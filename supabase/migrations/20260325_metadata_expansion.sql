-- 1. Inject missing Course Officer metadata
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS full_name TEXT,
ADD COLUMN IF NOT EXISTS course_name TEXT,
ADD COLUMN IF NOT EXISTS course_number TEXT,
ADD COLUMN IF NOT EXISTS total_cadets INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

-- 2. Ensure RLS remains disabled for high-speed direct access as per Phase 2
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 3. Force PostgREST schema cache refresh
NOTIFY pgrst, 'reload schema';
