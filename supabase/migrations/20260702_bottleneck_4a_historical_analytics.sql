-- ============================================================
-- FILE: 20260702_bottleneck_4a_historical_analytics.sql
-- DATE: 2026-07-02
-- PURPOSE: Bottleneck 4A — Historical Analytics Materialized View
--
-- Creates a high-performance materialized view for historical
-- parade statistics, indexed for microsecond lookups, and
-- automated refresh via pg_cron.
-- ============================================================

-- ─── Step 1: Create Materialized View ──────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_historical_parade_analytics AS
SELECT
    course_number,
    date_trunc('day', date::timestamp) AS record_date,
    SUM(present_count) AS total_present,
    SUM(absent_count) AS total_absent,
    SUM(sick_count) AS total_sick,
    SUM(detention_count) AS total_detention,
    SUM(pass_count) AS total_pass,
    SUM(suspension_count) AS total_suspension,
    SUM(yet_to_report_count) AS total_yet_to_report,
    SUM(grand_total) AS total_registered,
    CASE 
        WHEN SUM(grand_total) > 0 THEN 
            ROUND((SUM(absent_count)::numeric / SUM(grand_total)::numeric) * 100, 2)
        ELSE 0 
    END AS absenteeism_rate
FROM
    public.parade_records
GROUP BY
    course_number,
    date_trunc('day', date::timestamp);

-- ─── Step 2: Optimize with Indexes ─────────────────────────────────────────
-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_historical_analytics_unique 
    ON public.mv_historical_parade_analytics (course_number, record_date);

-- B-Tree index for fast filtering by course and date
CREATE INDEX IF NOT EXISTS idx_mv_historical_analytics_course_date 
    ON public.mv_historical_parade_analytics (course_number, record_date DESC);

-- ─── Step 3: Automate Refresh via pg_cron ──────────────────────────────────
-- Create the refresh function
CREATE OR REPLACE FUNCTION public.refresh_parade_analytics_view()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_historical_parade_analytics;
END;
$$;

-- Schedule the refresh nightly at 02:30 AM
SELECT cron.schedule(
    'nightly-analytics-refresh',
    '30 2 * * *',
    $$SELECT public.refresh_parade_analytics_view();$$
);

-- Grant read access to the authenticated role
GRANT SELECT ON public.mv_historical_parade_analytics TO authenticated, anon;
NOTIFY pgrst, 'reload schema';
