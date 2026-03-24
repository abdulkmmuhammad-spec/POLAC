-- Fix login passwords PLAIN TEXT VERSION (STRICT ANALYSI OF 406 ERROR)
-- Run this in Supabase Dashboard SQL Editor
-- Go to: https://supabase.com/dashboard/project/ixqqbmwqminmwrvrevlq/sql-editor

-- 1. DROP ALL BLOCKING TRIGGERS AND FUNCTIONS (CRITICAL)
DROP TRIGGER IF EXISTS tr_hash_profile_password ON public.profiles;
DROP FUNCTION IF EXISTS public.hash_profile_password();

-- 2. FIX 406 ERROR: ADD RLS POLICY FOR LOGIN
-- The "User Not Found / 406" error happens because RLS blocks the anonymous login query.
-- This policy allows the React app to find users by username during the login process.
DROP POLICY IF EXISTS "Allow login lookup" ON profiles;
CREATE POLICY "Allow login lookup" ON profiles
    FOR SELECT TO anon USING (true);

-- 3. Reset ALL account passwords to plain text
UPDATE public.profiles SET password_hash = 'password' WHERE username = 'commandant';
UPDATE public.profiles SET password_hash = 'password1' WHERE username = 'officer1';
UPDATE public.profiles SET password_hash = 'password2' WHERE username = 'officer2';
UPDATE public.profiles SET password_hash = 'password3' WHERE username = 'officer3';
UPDATE public.profiles SET password_hash = 'password4' WHERE username = 'officer4';
UPDATE public.profiles SET password_hash = 'password5' WHERE username = 'officer5';

-- 4. Verify the updates
SELECT username, role, password_hash
FROM profiles
WHERE username IN ('commandant', 'officer1', 'officer2', 'officer3', 'officer4', 'officer5');