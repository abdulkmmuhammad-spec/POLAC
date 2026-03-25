-- ============================================================
-- FILE: 20260325_simplified_auth_rpc.sql
-- DATE: 2026-03-25
-- PURPOSE: Add RPC functions that bypass RLS for all auth-phase
-- profile queries, eliminating hang points caused by
-- AbortController + RLS evaluation.
-- ============================================================

-- ============================================================
-- FUNCTION: get_officers()
-- Returns: All course_officer profiles ordered by full_name
-- Bypasses RLS via SECURITY DEFINER so officers can be listed
-- even when evaluated under an authenticated session.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_officers()
RETURNS TABLE (
    id UUID,
    username TEXT,
    role TEXT,
    full_name TEXT,
    course_name TEXT,
    year_group INTEGER,
    course_number INTEGER,
    total_cadets INTEGER,
    profile_image TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        pr.id,
        pr.username,
        pr.role,
        pr.full_name,
        pr.course_name,
        pr.year_group,
        pr.course_number,
        pr.total_cadets,
        pr.profile_image
    FROM public.profiles pr
    WHERE pr.role = 'course_officer'
    ORDER BY pr.full_name ASC;
END;
$$;

-- Grant execute to authenticated and anon roles (needed for RLS context)
GRANT EXECUTE ON FUNCTION public.get_officers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_officers() TO anon;

-- ============================================================
-- FUNCTION: get_registration_counts()
-- Returns: Single row with commandant_count and officer_count
-- Used by Login page to determine if signup/register is open.
-- Bypasses RLS via SECURITY DEFINER so this query never hangs.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_registration_counts()
RETURNS TABLE (
    commandant_count BIGINT,
    officer_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE role = 'commandant') AS commandant_count,
        COUNT(*) FILTER (WHERE role = 'course_officer') AS officer_count
    FROM public.profiles;
END;
$$;

-- Grant execute to authenticated and anon (needed for pre-login check)
GRANT EXECUTE ON FUNCTION public.get_registration_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_registration_counts() TO anon;
