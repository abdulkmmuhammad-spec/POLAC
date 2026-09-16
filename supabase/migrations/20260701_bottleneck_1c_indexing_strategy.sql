-- ============================================================
-- FILE: 20260701_bottleneck_1c_indexing_strategy.sql
-- DATE: 2026-07-01
-- PURPOSE: Bottleneck 1C — Composite and Partial Indexing Strategy
--
-- Optimizes query performance and search latency across millions
-- of database rows by creating composite indexes for frequent filters
-- and a partial index that excludes inactive (dismissed) cadets.
-- ============================================================

-- ─── Step 1: Composite Index on Parade Records ─────────────────────────────
-- Speeds up pagination and history lookups filtered by Course Number and
-- ordered by descending Date.
CREATE INDEX IF NOT EXISTS idx_parade_records_course_date 
    ON public.parade_records (course_number, date DESC);

-- ─── Step 2: Composite Index on Cadet Registry ─────────────────────────────
-- Optimizes roster lookups filtering by course number and active status.
CREATE INDEX IF NOT EXISTS idx_cadet_registry_course_status 
    ON public.cadet_registry (course_number, status);

-- ─── Step 3: Partial Index for Active Cadets ───────────────────────────────
-- Omit dismissed cadets (dead records) entirely from this index structure.
-- This keeps the B-Tree small, fit entirely in RAM, and speeds up daily scans.
CREATE INDEX IF NOT EXISTS idx_active_cadets 
    ON public.cadet_registry (course_number) 
    WHERE status != 'DISMISSED';

-- Grant access and reload schema cache
GRANT SELECT ON public.cadet_registry TO authenticated, anon;
NOTIFY pgrst, 'reload schema';
