-- supabase/migrations/20260426_03_resilient_audit_trigger.sql
-- Defense-in-Depth: Update audit triggers to be resilient to missing users

-- 1. Resilient Cadet Registry Modification Trigger
CREATE OR REPLACE FUNCTION public.audit_cadet_registry_modification_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_id UUID := NULL;
    v_actor_name TEXT;
BEGIN
    IF current_setting('app.suppress_audit', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- Safely resolve actor_id from public.users to prevent FK violation
    IF auth.uid() IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()) THEN
            v_actor_id := auth.uid();
        END IF;
    END IF;

    -- Resolve actor_name from JWT metadata or fallback
    v_actor_name := COALESCE(
        auth.jwt() -> 'user_metadata' ->> 'full_name',
        auth.jwt() -> 'user_metadata' ->> 'username',
        'ADMIN/SYSTEM'
    );

    INSERT INTO public.audit_events (actor_id, actor_name, action_type, target_id, payload)
    VALUES (
        v_actor_id,
        v_actor_name,
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
            'protocol', 'RESILIENT_TRIGGER_V1',
            'timestamp', clock_timestamp()
        )
    );
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Resilient Profile Modification Trigger
CREATE OR REPLACE FUNCTION public.audit_profiles_modification_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_id UUID := NULL;
    v_actor_name TEXT;
BEGIN
    -- Safely resolve actor_id from public.users
    IF auth.uid() IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()) THEN
            v_actor_id := auth.uid();
        END IF;
    END IF;

    -- Resolve actor_name
    v_actor_name := COALESCE(
        auth.jwt() -> 'user_metadata' ->> 'full_name',
        auth.jwt() -> 'user_metadata' ->> 'username',
        'ADMIN/SYSTEM'
    );

    INSERT INTO public.audit_events (actor_id, actor_name, action_type, target_id, payload)
    VALUES (
        v_actor_id,
        v_actor_name,
        'PROFILE_UPDATED',
        NEW.id::text,
        jsonb_build_object(
            'target_name', NEW.full_name,
            'diff', public.jsonb_diff_standardized(to_jsonb(OLD), to_jsonb(NEW), ARRAY['role', 'course_number', 'course_name']),
            'protocol', 'RESILIENT_TRIGGER_V1',
            'timestamp', clock_timestamp()
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: No changes needed for audit_cadet_alerts_trigger as it already uses NULL/explicit names.
