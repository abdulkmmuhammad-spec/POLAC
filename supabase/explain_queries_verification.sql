-- ============================================================
-- FILE: explain_queries_verification.sql
-- DATE: 2026-07-01
-- PURPOSE: Verification queries using EXPLAIN ANALYZE for 1C
-- ============================================================

-- Query 1: Verify Course & Date Composite Index usage on parade_records
-- Expected result: "Index Scan using idx_parade_records_course_date" or "Bitmap Index Scan"
EXPLAIN ANALYZE
SELECT id, course_number, date, parade_type, grand_total
FROM public.parade_records
WHERE course_number = 12
  AND date >= '2026-01-01'
ORDER BY date DESC;

-- Query 2: Verify Active Cadet Partial Index usage on cadet_registry
-- Expected result: "Index Scan using idx_active_cadets" or "Bitmap Index Scan"
EXPLAIN ANALYZE
SELECT id, name, squad, course_number, status
FROM public.cadet_registry
WHERE course_number = 12
  AND status != 'DISMISSED';
