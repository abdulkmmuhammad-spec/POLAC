-- ============================================================================
-- MIGRATION: Commandant Parade Remarks & Audit Trail System
-- DATE: 2026-11-11
-- OBJECTIVE:
--   1. Create public.commandant_remarks linked to public.parade_records (submission_id)
--      storing id, submission_id, commandant_id, course_officer_id, remark_text,
--      officer_response, status ('pending', 'addressed', 'resolved'), and timestamps.
--   2. Create high-performance indexes for submission, officer, course, and status lookups.
--   3. Enable Row Level Security (RLS) and realtime broadcast support.
-- ============================================================================

-- 1. Create commandant_remarks table
CREATE TABLE IF NOT EXISTS public.commandant_remarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.parade_records(id) ON DELETE CASCADE,
  commandant_id UUID DEFAULT NULL,
  commandant_name TEXT NOT NULL DEFAULT 'COMMANDANT',
  course_officer_id UUID DEFAULT NULL,
  course_officer_name TEXT DEFAULT NULL,
  course_number INTEGER DEFAULT NULL,
  parade_type TEXT DEFAULT NULL,
  parade_date DATE DEFAULT NULL,
  remark_text TEXT NOT NULL,
  officer_response TEXT DEFAULT NULL,
  responded_at TIMESTAMPTZ DEFAULT NULL,
  thread JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'addressed', 'resolved')),
  resolved_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_commandant_remarks_submission_id
  ON public.commandant_remarks (submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_commandant_remarks_officer_status
  ON public.commandant_remarks (course_officer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_commandant_remarks_course_status
  ON public.commandant_remarks (course_number, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_commandant_remarks_status_created_at
  ON public.commandant_remarks (status, created_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.commandant_remarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to commandant_remarks" ON public.commandant_remarks;
CREATE POLICY "Allow read access to commandant_remarks"
  ON public.commandant_remarks
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert access to commandant_remarks" ON public.commandant_remarks;
CREATE POLICY "Allow insert access to commandant_remarks"
  ON public.commandant_remarks
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update access to commandant_remarks" ON public.commandant_remarks;
CREATE POLICY "Allow update access to commandant_remarks"
  ON public.commandant_remarks
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.commandant_remarks TO authenticated, anon;

-- 4. Enable Realtime Publication for commandant_remarks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'commandant_remarks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.commandant_remarks;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Safely ignore if publication does not exist in local test environment
  NULL;
END $$;

