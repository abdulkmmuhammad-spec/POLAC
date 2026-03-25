-- 1. Purge all conflicting test data to allow a clean-room realignment
-- This must happen FIRST to prevent FK validation errors during ALTER TABLE
TRUNCATE TABLE public.parade_records CASCADE;
TRUNCATE TABLE public.cadet_details CASCADE;

-- 2. Remove the stale constraint pointing to the legacy 'profiles' table
ALTER TABLE public.parade_records 
DROP CONSTRAINT IF EXISTS parade_records_officer_id_fkey;

-- 3. Bind the officer_id to the new 'public.users' source of truth
ALTER TABLE public.parade_records 
ADD CONSTRAINT parade_records_officer_id_fkey 
FOREIGN KEY (officer_id) 
REFERENCES public.users(id) 
ON DELETE CASCADE;

-- 4. Update the granular 'cadet_details' link to ensure consistency
ALTER TABLE public.cadet_details
DROP CONSTRAINT IF EXISTS cadet_details_record_id_fkey;

ALTER TABLE public.cadet_details
ADD CONSTRAINT cadet_details_record_id_fkey
FOREIGN KEY (record_id)
REFERENCES public.parade_records(id)
ON DELETE CASCADE;

-- 5. Force-refresh the PostgREST schema cache
NOTIFY pgrst, 'reload schema';
