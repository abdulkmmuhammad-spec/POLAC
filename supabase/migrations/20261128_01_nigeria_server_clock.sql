-- ============================================================================
-- Migration: Nigeria Server Clock (Africa/Lagos WAT) RPC
-- Ensures Matron and Course Officer dashboards always align with the
-- PostgreSQL database clock in Nigeria Time (WAT), immune to device clock drift.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_nigeria_server_date()
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'wat_date', TO_CHAR(NOW() AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD'),
    'wat_time', TO_CHAR(NOW() AT TIME ZONE 'Africa/Lagos', 'HH24:MI'),
    'utc_now', NOW()
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_nigeria_server_date() TO anon, authenticated;
