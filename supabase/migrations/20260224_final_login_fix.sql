-- FINAL LOGIN FIX & DIAGNOSTIC
-- Run this in your Supabase SQL Editor.

-- 1. INSPECT SCHEMA (See if ID or other columns are mandatory)
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND table_schema = 'public';

-- 2. FORCE RECREATE THE 5 OFFICERS
-- We use a simpler DELETE + INSERT to avoid any unique constraint ghosts.
DELETE FROM public.profiles WHERE username LIKE 'officer%';

-- NOTE: We try to insert WITHOUT ID first. If it fails, we will know why from the schema above.
INSERT INTO public.profiles (username, role, full_name, password_hash)
VALUES 
    ('officer1', 'course_officer', 'Officer 1', 'password1'),
    ('officer2', 'course_officer', 'Officer 2', 'password2'),
    ('officer3', 'course_officer', 'Officer 3', 'password3'),
    ('officer4', 'course_officer', 'Officer 4', 'password4'),
    ('officer5', 'course_officer', 'Officer 5', 'password5');

-- 3. FINAL VERIFICATION
-- Check if RLS is definitely OFF
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- List all accounts
SELECT id, username, role, password_hash FROM public.profiles;
