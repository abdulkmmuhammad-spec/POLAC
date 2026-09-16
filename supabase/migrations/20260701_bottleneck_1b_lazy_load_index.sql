-- ============================================================
-- FILE: 20260701_bottleneck_1b_lazy_load_index.sql
-- DATE: 2026-07-01
-- PURPOSE: Bottleneck 1B — Lazy-load performance hardening
--
-- Creates a covering index on cadet_details(record_id) so that
-- getParadeDetails() lookups are O(1) key-lookup instead of O(n)
-- full table scans as the database grows over years.
--
-- Also creates a lightweight DB view (vw_parade_records_summary)
-- that pins the exact aggregate columns returned to the frontend,
-- acting as a stable contract — schema changes to parade_records
-- won't accidentally leak new heavy columns to the API layer.
-- ============================================================

-- ─── Step 1: Index cadet_details on record_id ──────────────────────────────
-- This is the critical path for lazy-loading: every time an officer opens a
-- submission preview, a SELECT WHERE record_id = $1 executes. Without an index
-- this is a full table scan. With it, it's a single B-tree lookup.
CREATE INDEX IF NOT EXISTS idx_cadet_details_record_id
    ON public.cadet_details (record_id);

-- ─── Step 2: Covering index — include name, squad, status in the index ─────
-- This creates a "covering index" so the DB engine can satisfy the
-- getParadeDetails() SELECT (name, squad, status) entirely from the index
-- without touching the heap pages at all. Maximum speed for lazy-load.
DROP INDEX IF EXISTS idx_cadet_details_record_id_covering;
CREATE INDEX idx_cadet_details_record_id_covering
    ON public.cadet_details (record_id)
    INCLUDE (name, squad, status);

-- ─── Step 3: Create vw_parade_records_summary view ─────────────────────────
-- Stable contract view: even if parade_records gains new columns in future
-- migrations, the API layer is shielded from them. Only the exact metadata
-- fields needed by the frontend are exposed.
CREATE OR REPLACE VIEW public.vw_parade_records_summary AS
SELECT
    id,
    officer_id,
    officer_name,
    course_name,
    year_group,
    course_number,
    date,
    parade_type,
    present_count,
    absent_count,
    sick_count,
    detention_count,
    pass_count,
    suspension_count,
    yet_to_report_count,
    grand_total,
    created_at
FROM public.parade_records;

-- Grant read access to authenticated role (respects existing RLS on base table)
GRANT SELECT ON public.vw_parade_records_summary TO authenticated, anon;

-- ─── Step 4: Force PostgREST schema cache refresh ──────────────────────────
NOTIFY pgrst, 'reload schema';
