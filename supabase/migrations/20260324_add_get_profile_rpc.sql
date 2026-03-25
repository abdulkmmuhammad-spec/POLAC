-- Bypass RLS for Profile Lookup During Login
-- Date: 2026-03-24
-- Description: Creates a SECURITY DEFINER function to bypass RLS when fetching profiles during login.

-- Create a function that bypasses RLS to fetch a user profile
CREATE OR REPLACE FUNCTION public.get_profile_by_id(p_user_id UUID)
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
  WHERE pr.id = p_user_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_profile_by_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_id(UUID) TO anon;
