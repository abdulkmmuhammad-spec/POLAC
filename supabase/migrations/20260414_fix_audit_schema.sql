-- 20260414_fix_audit_schema.sql
-- Fixes Foreign Key mismatch in audit_events and updates triggers to use 'users' instead of 'profiles'
-- Resolves 400 Bad Request errors by hardening RPC parameters and adding explicit grants.

-- 1. Fix Foreign Key on audit_events
ALTER TABLE public.audit_events 
DROP CONSTRAINT IF EXISTS audit_events_actor_id_fkey;

ALTER TABLE public.audit_events 
ADD CONSTRAINT audit_events_actor_id_fkey 
FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- 2. Update the Alert Audit Trigger
CREATE OR REPLACE FUNCTION public.audit_cadet_alerts_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.commandant_directive IS NOT NULL AND OLD.commandant_directive IS DISTINCT FROM NEW.commandant_directive THEN
        INSERT INTO public.audit_events (actor_id, actor_name, action_type, target_id, payload)
        VALUES (
            NULL, 
            'COMMANDANT',
            'COMMANDANT_DIRECTIVE_ISSUED',
            NEW.id::text,
            jsonb_build_object('cadet_name', NEW.cadet_name, 'directive_notes', NEW.commandant_directive)
        );
    END IF;

    IF NEW.status = 'RESOLVED' AND OLD.status = 'ACTIVE' AND NEW.alert_level = 'FLAGRANT' THEN
        INSERT INTO public.audit_events (actor_id, actor_name, action_type, target_id, payload)
        VALUES (
            NULL,
            COALESCE((SELECT full_name FROM public.users WHERE id = NEW.acknowledged_by), 'ADMIN'),
            'ALERT_RESOLVED_FLAGRANT',
            NEW.id::text,
            jsonb_build_object('cadet_name', NEW.cadet_name, 'resolution_notes', NEW.resolution_notes)
        );
    END IF;

    RETURN NEW;
END;
$$;

-- 3. Hardened Relegate Function (Resolves 400 Bad Request by using TEXT parameters)
-- We drop both possible previous signatures to ensure a clean slate.
DROP FUNCTION IF EXISTS public.relegate_cadet(UUID, INT, INT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.relegate_cadet(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.relegate_cadet(
    p_id TEXT,
    p_current_rc TEXT,
    p_new_rc TEXT,
    p_new_squad TEXT,
    p_reason TEXT,
    p_actor_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Atomic update in registry
    UPDATE public.cadet_registry
    SET 
        course_number = p_new_rc::INT,
        squad = p_new_squad,
        status = 'ACTIVE',
        status_change_date = timezone('utc'::text, now()),
        status_change_reason = p_reason,
        relegated_from_rc = p_current_rc::INT
    WHERE id::text = p_id;

    -- Forensic Audit Log
    INSERT INTO public.audit_events (
        actor_id,
        actor_name,
        action_type,
        target_id,
        payload
    ) VALUES (
        auth.uid(),
        p_actor_name,
        'CADET_RELEGATION',
        p_id,
        jsonb_build_object(
            'reason', p_reason,
            'old_course', p_current_rc,
            'new_course', p_new_rc,
            'new_squad', p_new_squad
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.relegate_cadet TO authenticated, anon;

-- 4. Hardened Dismiss Function
DROP FUNCTION IF EXISTS public.dismiss_cadet(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.dismiss_cadet(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.dismiss_cadet(
    p_id TEXT,
    p_reason TEXT,
    p_actor_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Atomic update in registry
    UPDATE public.cadet_registry
    SET 
        status = 'DISMISSED',
        status_change_date = timezone('utc'::text, now()),
        status_change_reason = p_reason
    WHERE id::text = p_id;

    -- Forensic Audit Log
    INSERT INTO public.audit_events (
        actor_id,
        actor_name,
        action_type,
        target_id,
        payload
    ) VALUES (
        auth.uid(),
        p_actor_name,
        'CADET_DISMISSAL',
        p_id,
        jsonb_build_object(
            'reason', p_reason
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.dismiss_cadet TO authenticated, anon;
