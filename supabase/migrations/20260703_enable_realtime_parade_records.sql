-- Enable Realtime for parade_records
-- This ensures the Commandant Dashboard instantly updates when a course officer submits a state

BEGIN;

-- Check if the table is already in the publication, if not, add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND tablename = 'parade_records'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE parade_records;
    END IF;
END
$$;

COMMIT;
