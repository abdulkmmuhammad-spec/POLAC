-- 20260326_sanitize_user_metadata.sql
-- Backfill NULL metadata values in public.users to prevent UI crashes

-- 1. Sanitize NULL full_name (aliased as 'name' in some UI contexts)
UPDATE public.users 
SET full_name = 'SYSTEM_ADMIN' 
WHERE full_name IS NULL AND role = 'commandant';

UPDATE public.users 
SET full_name = 'COURSE_OFFICER' 
WHERE full_name IS NULL AND role = 'course_officer';

-- 2. Sanitize NULL course_name
UPDATE public.users 
SET course_name = 'ACADEMY HQ' 
WHERE course_name IS NULL AND role = 'commandant';

UPDATE public.users 
SET course_name = 'PENDING ALLOCATION' 
WHERE course_name IS NULL AND role = 'course_officer';

-- 3. Sanitize NULL course_number
UPDATE public.users 
SET course_number = '0' 
WHERE course_number IS NULL;

-- 4. Sanitize NULL total_cadets
UPDATE public.users 
SET total_cadets = 0 
WHERE total_cadets IS NULL;
