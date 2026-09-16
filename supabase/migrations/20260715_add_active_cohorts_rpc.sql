-- supabase/migrations/20260715_add_active_cohorts_rpc.sql

CREATE OR REPLACE FUNCTION public.get_active_cohorts()
RETURNS TABLE (course_number INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT c.course_number
  FROM public.cadet_registry c
  WHERE c.status = 'ACTIVE'
  ORDER BY c.course_number DESC;
END;
$$;

-- Grant execution rights to authenticated and anon users
GRANT EXECUTE ON FUNCTION public.get_active_cohorts() TO authenticated, anon;
