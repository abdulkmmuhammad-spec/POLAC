-- PHASE 3: AUTOMATED AUDIT TRAIL
-- RUN THIS IN SUPABASE SQL EDITOR

-- This script creates robust Postgres triggers to automatically write to `audit_events`.
-- By moving this to the database tier, we guarantee 100% logging reliability
-- even if the frontend crashes, fails to map a response, or an API call bypasses the UI.

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
            COALESCE((SELECT full_name FROM public.profiles WHERE id = NEW.acknowledged_by), 'ADMIN'),
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

-- Apply the trigger to the cadet_alerts table
DROP TRIGGER IF EXISTS trg_audit_cadet_alerts ON public.cadet_alerts;
CREATE TRIGGER trg_audit_cadet_alerts
AFTER UPDATE ON public.cadet_alerts
FOR EACH ROW
EXECUTE FUNCTION public.audit_cadet_alerts_trigger();
