-- FIX LOGINS: RESTORE 5 OFFICER ACCOUNTS
-- Run this in your Supabase SQL Editor.

-- 1. CLEANUP: Ensure no leftover email-based IDs are causing confusion
DELETE FROM public.profiles WHERE username = 'snr001@polac.com';

-- 2. CREATE/UPDATE 5 OFFICER ACCOUNTS
-- Using a bulk insert with an ON CONFLICT clause to ensure they are created or updated correctly.

INSERT INTO public.profiles (username, role, full_name, password_hash)
VALUES 
    ('officer1', 'course_officer', 'Officer 1', 'password1'),
    ('officer2', 'course_officer', 'Officer 2', 'password2'),
    ('officer3', 'course_officer', 'Officer 3', 'password3'),
    ('officer4', 'course_officer', 'Officer 4', 'password4'),
    ('officer5', 'course_officer', 'Officer 5', 'password5')
ON CONFLICT (username) 
DO UPDATE SET 
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    password_hash = EXCLUDED.password_hash;

-- 3. Verify the result
SELECT username, role, full_name, password_hash 
FROM public.profiles
WHERE username LIKE 'officer%';
