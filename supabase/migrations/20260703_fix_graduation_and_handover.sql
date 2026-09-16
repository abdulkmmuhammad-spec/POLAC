-- MISSION 1: FIX THE 404 GRADUATION FUNCTION
CREATE OR REPLACE FUNCTION public.execute_course_graduation(
    p_course_number INTEGER,
    p_actor_id TEXT,
    p_actor_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_cadets INTEGER;
    v_officer_name TEXT;
BEGIN
    -- 0. Set local session variable to disable automatic row-level logging trigger
    PERFORM set_config('app.suppress_audit', 'true', true);

    -- Get officer name before deactivating
    SELECT full_name INTO v_officer_name
    FROM public.users
    WHERE course_number::text = p_course_number::text
      AND role = 'course_officer'
    LIMIT 1;

    -- 1. Graduate active cadets in this RC
    WITH updated AS (
        UPDATE public.cadet_registry
        SET status = 'GRADUATED'
        WHERE course_number::text = p_course_number::text
          AND status = 'ACTIVE'
        RETURNING id
    )
    SELECT count(*) INTO v_total_cadets FROM updated;

    -- 2. Deactivate the Course Officer assigned to this RC
    UPDATE public.users
    SET is_active = false
    WHERE course_number::text = p_course_number::text
      AND role = 'course_officer';

    -- 3. Log Forensic Audit Event
    INSERT INTO public.audit_events (
        actor_id, actor_name, action_type, target_id, payload
    ) VALUES (
        NULLIF(p_actor_id, '')::uuid, p_actor_name, 'COURSE_GRADUATION', p_course_number::text,
        jsonb_build_object(
            'course_number', p_course_number,
            'cadet_count', v_total_cadets,
            'officer_name', COALESCE(v_officer_name, 'Unknown')
        )
    );

    -- 4. Automatically advance the active RC baseline if this was the oldest cohort
    IF EXISTS (
        SELECT 1 FROM public.app_settings 
        WHERE key = 'active_rc' AND (value::integer - 4) = p_course_number
    ) THEN
        UPDATE public.app_settings
        SET value = (value::integer + 1)::text
        WHERE key = 'active_rc';

        -- Log the automated promotion
        INSERT INTO public.audit_events (
            actor_id, actor_name, action_type, target_id, payload
        ) VALUES (
            NULLIF(p_actor_id, '')::uuid, p_actor_name, 'SETTINGS_CHANGED', 'active_rc',
            jsonb_build_object(
                'setting', 'active_rc',
                'note', 'Automated bump due to graduation of oldest cohort'
            )
        );
    END IF;
END;
$$;

-- CRITICAL: Grant explicit execution rights so PostgREST can resolve the RPC
GRANT EXECUTE ON FUNCTION public.execute_course_graduation(INTEGER, TEXT, TEXT) TO authenticated, anon;


-- MISSION 2: FIX THE 400 HANDOVER TRIGGER
CREATE OR REPLACE FUNCTION public.prevent_identity_hijack()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Allow clean INSERTs (new officers being registered).
    -- Only block UPDATEs where the core identity fields are mutated 
    -- from a previously established (non-null) state.
    IF TG_OP = 'UPDATE' THEN
        IF (OLD.email IS NOT NULL AND NEW.email IS DISTINCT FROM OLD.email) OR
           (OLD.username IS NOT NULL AND NEW.username IS DISTINCT FROM OLD.username) THEN
            RAISE EXCEPTION 'IDENTITY VIOLATION: Cannot recycle identity credentials. Deactivate the account instead.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Re-attach the trigger properly for INSERT and UPDATE to rely on the function logic
DROP TRIGGER IF EXISTS trg_prevent_identity_hijack ON public.users;
CREATE TRIGGER trg_prevent_identity_hijack
    BEFORE INSERT OR UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_identity_hijack();
