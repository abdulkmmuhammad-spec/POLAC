-- 20260417_dismissal_cascade_fixes.sql

-- Replace Dismissal V2 with strict Schema Checks & Cleanups
CREATE OR REPLACE FUNCTION public.dismiss_cadet_v2(
    p_cadet_id TEXT,
    p_reason TEXT,
    p_actor_id TEXT,
    p_actor_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_valid_actor_id UUID := NULL;
BEGIN
    -- Verify Actor Linkage
    IF NULLIF(p_actor_id, '') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.users WHERE id::text = p_actor_id) THEN
            v_valid_actor_id := p_actor_id::uuid;
        END IF;
    END IF;

    -- Strict check to see if target already matches terminal state to prevent duplication 
    IF EXISTS (SELECT 1 FROM public.cadet_registry WHERE id::text = p_cadet_id AND status = 'DISMISSED') THEN
        RETURN;
    END IF;

    -- Atomic Registry Update
    UPDATE public.cadet_registry
    SET 
        status = 'DISMISSED',
        status_change_date = timezone('utc'::text, now()),
        status_change_reason = p_reason
    WHERE id::text = p_cadet_id;

    -- Cascading Sub-Cleanup: Orphan dependent pending sequences if applicable.
    -- (Defensive schema closure to enforce state cleanup)
    UPDATE public.cadet_details
    SET status = 'ABSENT_AWOL'
    WHERE name = (SELECT name FROM public.cadet_registry WHERE id::text = p_cadet_id)
      AND status = 'PENDING';

    -- Hardened JSON payload tracing with Fault Tolerance
    BEGIN
        INSERT INTO public.audit_events (
            actor_id,
            actor_name,
            action_type,
            target_id,
            payload
        ) VALUES (
            v_valid_actor_id,
            p_actor_name,
            'CADET_DISMISSAL',
            p_cadet_id,
            jsonb_build_object(
                'reason', p_reason,
                'protocol', 'V2_SECURE_CASCADE',
                'timestamp', timezone('utc'::text, now())
            )
        );
    EXCEPTION WHEN foreign_key_violation THEN
        -- Fallback if v_valid_actor_id was found in public.users but orphaned from auth.users
        INSERT INTO public.audit_events (
            actor_id,
            actor_name,
            action_type,
            target_id,
            payload
        ) VALUES (
            NULL,
            p_actor_name,
            'CADET_DISMISSAL',
            p_cadet_id,
            jsonb_build_object(
                'reason', p_reason,
                'protocol', 'V2_SECURE_CASCADE_FALLBACK',
                'warning', 'Orphaned Actor ID bypassed manually',
                'timestamp', timezone('utc'::text, now())
            )
        );
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dismiss_cadet_v2 TO authenticated, anon;
