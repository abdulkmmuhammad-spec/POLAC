-- 1. Purge all conflicting test records to reset the 'Duplicate Prevention' guard
TRUNCATE TABLE public.parade_records CASCADE;
TRUNCATE TABLE public.cadet_details CASCADE;

-- 2. Ensure the Unique Constraint is correctly enforced
ALTER TABLE public.parade_records 
DROP CONSTRAINT IF EXISTS unique_officer_date_type;

ALTER TABLE public.parade_records 
ADD CONSTRAINT unique_officer_date_type 
UNIQUE (officer_id, date, parade_type);

-- 3. Force-refresh PostgREST to recognize Phase 2 metadata columns
NOTIFY pgrst, 'reload schema';
