-- ============================================================
-- FILE: 20260702_bottleneck_3a_websocket_limits.sql
-- DATE: 2026-07-02
-- PURPOSE: Bottleneck 3A — WebSocket Limits, Table Bloat, and RLS Optimization
--
-- Enables pg_cron for automatic cleanup of stale notifications,
-- archiving them to a cold-storage notifications_archive table.
-- Optimizes Row-Level Security (RLS) on notifications to use
-- metadata checks instead of dynamic SQL subqueries/joins.
-- ============================================================

-- ─── Step 1: Enable pg_cron Extension ──────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── Step 2: Create Cold-Storage Archive Table ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications_archive (
    id UUID PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    read BOOLEAN DEFAULT false,
    officer_name TEXT NOT NULL,
    year_group INTEGER,
    course_number INTEGER,
    archived_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Disable client-side RLS modifications to the archive table
ALTER TABLE public.notifications_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Commandants can view archive" ON public.notifications_archive;
CREATE POLICY "Commandants can view archive" ON public.notifications_archive
    FOR SELECT USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'commandant'
    );

-- ─── Step 3: Create Archival/Cleanup Database Function ─────────────────────
CREATE OR REPLACE FUNCTION public.archive_stale_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Copy records older than 90 days to cold storage
    INSERT INTO public.notifications_archive (id, type, title, content, timestamp, read, officer_name, year_group, course_number)
    SELECT id, type, title, content, timestamp, read, officer_name, year_group, course_number
    FROM public.notifications
    WHERE timestamp < NOW() - INTERVAL '90 days'
    ON CONFLICT (id) DO NOTHING;

    -- 2. Hard-delete from active table
    DELETE FROM public.notifications
    WHERE timestamp < NOW() - INTERVAL '90 days';

    -- 3. Reclaim physical space (runs vacuum on table)
    -- Note: VACUUM cannot be run inside a transaction block or function directly
    -- in standard PG unless using dblink or cron context, so we'll run clean deletion
    -- and let autovacuum take care of space or trigger it explicitly via cron.
END;
$$;

-- ─── Step 4: Schedule Maintenance Job via pg_cron ──────────────────────────
-- Clean up stale notifications every night at 2:00 AM UTC.
SELECT cron.schedule(
    'nightly-notifications-cleanup',
    '0 2 * * *',
    $$SELECT public.archive_stale_notifications();$$
);

-- ─── Step 5: Optimize Row-Level Security (RLS) for Real-time Streaming ─────
-- Replaces subquery-heavy SELECT check with static, metadata JWT lookup.
-- Reduces real-time channel processing complexity from O(n) table scans to O(1).
DROP POLICY IF EXISTS "Users can view assigned course notifications" ON public.notifications;

CREATE POLICY "Users can view assigned course notifications" ON public.notifications
    FOR SELECT USING (
        -- Check role directly from token metadata (O(1))
        COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'commandant' OR
        -- Check assigned course directly from token metadata (O(1))
        course_number = NULLIF(auth.jwt() -> 'user_metadata' ->> 'assigned_course_number', '')::integer
    );

-- Force PostgREST schema cache refresh
NOTIFY pgrst, 'reload schema';
