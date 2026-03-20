-- Migration: audit_stabilization
-- Description: Adds course_number to notifications and implements atomic audit RPC.

-- 1. Add course_number to notifications for structured audit trails
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS course_number INTEGER;

-- 2. Performance & Atomicity: Create RPC for Cadet Registry updates
-- This prevents TOCTOU gaps and returns the exact old/new row states for the audit log.
CREATE OR REPLACE FUNCTION public.update_cadet_registry_with_audit(
    p_id UUID,
    p_name TEXT,
    p_squad TEXT,
    p_course_number INTEGER,
    p_year_group INTEGER
)
RETURNS TABLE (
    old_record JSONB,
    new_record JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old JSONB;
    v_new JSONB;
BEGIN
    -- Capture OLD state
    SELECT to_jsonb(r) INTO v_old FROM public.cadet_registry r WHERE r.id = p_id;
    
    -- Perform atomic UPDATE
    UPDATE public.cadet_registry
    SET 
        name = p_name,
        squad = p_squad,
        course_number = p_course_number,
        year_group = p_year_group
    WHERE id = p_id
    RETURNING to_jsonb(cadet_registry.*) INTO v_new;

    RETURN QUERY SELECT v_old, v_new;
END;
$$;
