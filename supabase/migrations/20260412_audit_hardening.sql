-- Migration: audit_hardening
-- Date: 2026-04-12
-- Description: Hardens Institutional Audit Trail with immutability and standardized diff formats.

-- 1. Standardization Helper Function
-- Enforces the [{field, from, to}] schema for all audit payloads
CREATE OR REPLACE FUNCTION public.jsonb_diff_standardized(old_val JSONB, new_val JSONB, fields TEXT[])
RETURNS JSONB AS $$
DECLARE
    f TEXT;
    diff JSONB := '[]'::jsonb;
BEGIN
    FOREACH f IN ARRAY fields LOOP
        IF old_val->>f IS DISTINCT FROM new_val->>f THEN
            diff := diff || jsonb_build_object(
                'field', f,
                'from', COALESCE(old_val->>f, 'N/A'),
                'to', COALESCE(new_val->>f, 'N/A')
            );
        END IF;
    END LOOP;
    RETURN diff;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Immutability Trigger Function
-- Rejects any attempt to modify or delete audit logs
CREATE OR REPLACE FUNCTION public.audit_immutability_enforcement()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'INSTITUTIONAL ERROR: Audit logs are immutable and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

-- 3. Apply Immutability to audit_events
DROP TRIGGER IF EXISTS trg_audit_immutability ON public.audit_events;
CREATE TRIGGER trg_audit_immutability
BEFORE UPDATE OR DELETE ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.audit_immutability_enforcement();

-- 4. Secure RLS Update
-- Use modern JWT claims for zero-recursion READ access
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_events;
CREATE POLICY "Commandants can view all audit logs" 
ON public.audit_events 
FOR SELECT 
USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'commandant'
);

-- Completely disable direct client-side insertion to prevent spoofing
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_events;
DROP POLICY IF EXISTS "Strict Database Insertion" ON public.audit_events;
CREATE POLICY "No Client-Side Insertion" 
ON public.audit_events 
FOR INSERT 
WITH CHECK (false); 

-- 4b. Secure Client-Side Logging RPC
-- This allows the frontend to log sensitive actions without direct insert access
CREATE OR REPLACE FUNCTION public.log_audit_event_secure(
    p_action_type TEXT,
    p_target_id TEXT,
    p_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.audit_events (
        actor_id, 
        actor_name, 
        action_type, 
        target_id, 
        payload
    )
    VALUES (
        auth.uid(),
        COALESCE((SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'AUTH_USER'),
        p_action_type,
        p_target_id,
        p_payload
    );
END;
$$;

-- 5. Expanded Audit: App Settings
CREATE OR REPLACE FUNCTION public.audit_app_settings_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.audit_events (actor_id, actor_name, action_type, target_id, payload)
    VALUES (
        auth.uid(),
        'ADMIN/SYSTEM',
        'SETTING_UPDATED',
        NEW.key,
        jsonb_build_object(
            'diff', public.jsonb_diff_standardized(to_jsonb(OLD), to_jsonb(NEW), ARRAY['value']),
            'timestamp', clock_timestamp()
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_app_settings ON public.app_settings;
CREATE TRIGGER trg_audit_app_settings
AFTER UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.audit_app_settings_trigger();

-- 6. Expanded Audit: Cadet Registry Modifications
CREATE OR REPLACE FUNCTION public.audit_cadet_registry_modification_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.audit_events (actor_id, actor_name, action_type, target_id, payload)
    VALUES (
        auth.uid(),
        'ADMIN/COMMANDANT',
        CASE 
            WHEN TG_OP = 'DELETE' THEN 'REGISTRY_DELETED'
            ELSE 'CADET_MODIFIED'
        END,
        CASE 
            WHEN TG_OP = 'DELETE' THEN OLD.id::text
            ELSE NEW.id::text
        END,
        jsonb_build_object(
            'cadet_name', CASE WHEN TG_OP = 'DELETE' THEN OLD.name ELSE NEW.name END,
            'diff', CASE 
                WHEN TG_OP = 'DELETE' THEN '[]'::jsonb 
                ELSE public.jsonb_diff_standardized(to_jsonb(OLD), to_jsonb(NEW), ARRAY['name', 'squad', 'course_number', 'year_group']) 
            END,
            'timestamp', clock_timestamp()
        )
    );
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_cadet_registry_delete ON public.cadet_registry;
-- 7. Expanded Audit: Profile / Role Changes
CREATE OR REPLACE FUNCTION public.audit_profiles_modification_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.audit_events (actor_id, actor_name, action_type, target_id, payload)
    VALUES (
        auth.uid(),
        'ADMIN',
        'PROFILE_UPDATED',
        NEW.id::text,
        jsonb_build_object(
            'target_name', NEW.full_name,
            'diff', public.jsonb_diff_standardized(to_jsonb(OLD), to_jsonb(NEW), ARRAY['role', 'course_number', 'course_name']),
            'timestamp', clock_timestamp()
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_profiles_mod ON public.profiles;

CREATE TRIGGER trg_audit_profiles_mod
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_profiles_modification_trigger();
