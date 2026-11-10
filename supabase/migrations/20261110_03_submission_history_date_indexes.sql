-- ============================================================================
-- MIGRATION: Submission History Date Filter Indexes & Query Optimization
-- DATE: 2026-11-10
-- OBJECTIVE:
--   1. Ensure high-performance B-Tree indexes exist on public.parade_records
--      for created_at, date, officer_id, and course_number to guarantee
--      sub-millisecond range scans over large archival datasets.
--   2. Provide an indexed server-side RPC get_officer_submission_history
--      accepting optional ISO 8601 start_date and end_date parameters.
-- ============================================================================

-- 1. Primary Timestamp & Date Range Indexes on public.parade_records
CREATE INDEX IF NOT EXISTS idx_parade_records_created_at_desc
  ON public.parade_records (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parade_records_date_desc
  ON public.parade_records (date DESC, created_at DESC);

-- 2. Composite Indexes for Officer & Course Scoped Date Range Queries
CREATE INDEX IF NOT EXISTS idx_parade_records_officer_created_at
  ON public.parade_records (officer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parade_records_officer_date_desc
  ON public.parade_records (officer_id, date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parade_records_course_created_at
  ON public.parade_records (course_number, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parade_records_course_date_desc
  ON public.parade_records (course_number, date DESC, created_at DESC);

-- 3. Optimized Server-Side RPC for Date-Filtered Submission History
CREATE OR REPLACE FUNCTION public.get_officer_submission_history(
  p_officer_id UUID DEFAULT NULL,
  p_course_number INTEGER DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_parade_type TEXT DEFAULT NULL,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  officer_id UUID,
  officer_name TEXT,
  course_name TEXT,
  year_group INTEGER,
  course_number INTEGER,
  date DATE,
  parade_type TEXT,
  present_count INTEGER,
  absent_count INTEGER,
  sick_count INTEGER,
  detention_count INTEGER,
  pass_count INTEGER,
  suspension_count INTEGER,
  yet_to_report_count INTEGER,
  grand_total INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pr.id,
    pr.officer_id,
    pr.officer_name,
    pr.course_name,
    pr.year_group,
    pr.course_number,
    pr.date,
    pr.parade_type,
    pr.present_count,
    pr.absent_count,
    pr.sick_count,
    pr.detention_count,
    pr.pass_count,
    pr.suspension_count,
    pr.yet_to_report_count,
    pr.grand_total,
    pr.created_at
  FROM public.parade_records pr
  WHERE (p_officer_id IS NULL OR pr.officer_id = p_officer_id)
    AND (p_course_number IS NULL OR pr.course_number = p_course_number)
    AND (
      p_start_date IS NULL
      OR pr.created_at >= p_start_date
      OR pr.date >= (p_start_date AT TIME ZONE 'UTC')::date
    )
    AND (
      p_end_date IS NULL
      OR pr.created_at <= p_end_date
      OR pr.date <= (p_end_date AT TIME ZONE 'UTC')::date
    )
    AND (p_parade_type IS NULL OR p_parade_type = '' OR LOWER(pr.parade_type) = LOWER(p_parade_type))
    AND (p_cursor IS NULL OR pr.created_at < p_cursor)
  ORDER BY pr.created_at DESC
  LIMIT COALESCE(p_limit, 20);
$$;

