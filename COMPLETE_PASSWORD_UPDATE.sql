-- COMPLETE PASSWORD UPDATE for ALL USERS (PLAIN TEXT)
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/ixqqbmwqminmwrvrevlq/sql-editor

-- 1. DROP ALL BLOCKING TRIGGERS AND FUNCTIONS (CRITICAL)
DROP TRIGGER IF EXISTS tr_hash_profile_password ON public.profiles;
DROP FUNCTION IF EXISTS public.hash_profile_password();
DROP FUNCTION IF EXISTS public.verify_user_login(text, text);

-- 2. Update ALL user passwords with plain text strings
UPDATE profiles SET password_hash = 'password' WHERE username = 'commandant';
UPDATE profiles SET password_hash = 'password1' WHERE username = 'officer1';
UPDATE profiles SET password_hash = 'password2' WHERE username = 'officer2';
UPDATE profiles SET password_hash = 'password3' WHERE username = 'officer3';
UPDATE profiles SET password_hash = 'password4' WHERE username = 'officer4';
UPDATE profiles SET password_hash = 'password5' WHERE username = 'officer5';

-- 3. Verify all updates
SELECT
    username,
    role,
    password_hash as plain_text_password
FROM profiles
WHERE username IN ('commandant', 'officer1', 'officer2', 'officer3', 'officer4', 'officer5')
ORDER BY username;