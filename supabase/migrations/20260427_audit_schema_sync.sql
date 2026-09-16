-- Migration: audit_schema_sync
-- Date: 2026-04-27
-- Description: Syncs audit triggers and functions from the obsolete public.profiles table to public.users

-- 1. Correct log_audit_event_secure to lookup public.users
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
        COALESCE((SELECT full_name FROM public.users WHERE id = auth.uid()), 'AUTH_USER'),
        p_action_type,
        p_target_id,
        p_payload
    );
END;
$$;

-- 2. Correct audit_cadet_alerts_trigger to lookup public.users
CREATE OR REPLACE FUNCTION public.audit_cadet_alerts_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Triggered when a Commandant issues a Directive
    IF NEW.commandant_directive IS NOT NULL AND OLD.commandant_directive IS DISTINCT FROM NEW.commandant_directive THEN
        INSERT INTO public.audit_events (
            actor_id, 
            actor_name, 
            action_type, 
            target_id, 
            payload
        )
        VALUES (
            NULL, -- Use NULL for System/Service-level automated triggers where auth.uid() is unavailable
            'COMMANDANT',
            'COMMANDANT_DIRECTIVE_ISSUED',
            NEW.id::text,
            jsonb_build_object(
                'cadet_name', NEW.cadet_name,
                'directive_notes', NEW.commandant_directive,
                'diff', public.jsonb_diff_standardized(to_jsonb(OLD), to_jsonb(NEW), ARRAY['commandant_directive']),
                'trigger_timestamp', clock_timestamp()
            )
        );
    END IF;

    -- 2. Triggered when a Flagrant Alert receives its final Administrative Resolution
    IF NEW.status = 'RESOLVED' AND OLD.status = 'ACTIVE' AND NEW.alert_level = 'FLAGRANT' THEN
        INSERT INTO public.audit_events (
            actor_id, 
            actor_name, 
            action_type, 
            target_id, 
            payload
        )
        VALUES (
            NULL,
            COALESCE((SELECT full_name FROM public.users WHERE id = NEW.acknowledged_by), 'ADMIN'),
            'ALERT_RESOLVED_FLAGRANT',
            NEW.id::text,
            jsonb_build_object(
                'cadet_name', NEW.cadet_name,
                'resolution_notes', NEW.resolution_notes,
                'diff', public.jsonb_diff_standardized(to_jsonb(OLD), to_jsonb(NEW), ARRAY['status', 'resolution_notes']),
                'trigger_timestamp', clock_timestamp()
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

-- 3. Bind trigger to users table instead of profiles
DROP TRIGGER IF EXISTS trg_audit_profiles_mod ON public.profiles;
DROP TRIGGER IF EXISTS trg_audit_users_mod ON public.users;

CREATE TRIGGER trg_audit_users_mod
AFTER UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.audit_profiles_modification_trigger();
