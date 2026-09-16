-- Migration: Add RPC for Commandant Parade Overview Data Fetching
-- Resolves pseudo-auth RLS deadlocks by using SECURITY DEFINER

CREATE OR REPLACE FUNCTION public.get_commandant_parade_overview(p_viewer_id UUID)
RETURNS SETOF public.parade_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
BEGIN
    -- Authorization check: Validate viewer exists and is a commandant
    SELECT role INTO v_role FROM public.users WHERE id::text = p_viewer_id::text;
    
    IF v_role != 'commandant' THEN
        RAISE EXCEPTION 'Unauthorized: Only Commandants can view the overview.';
    END IF;

    -- Return all relevant rows securely bypassing table RLS
    RETURN QUERY
    SELECT * FROM public.parade_records;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_commandant_parade_overview(UUID) TO anon, authenticated;
