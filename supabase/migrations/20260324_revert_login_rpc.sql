-- Plain Text Login Reset (The Nuclear Option)
-- Date: 2026-03-24

-- 1. DROP ALL BLOCKING TRIGGERS AND FUNCTIONS
DROP TRIGGER IF EXISTS tr_hash_profile_password ON public.profiles;
DROP FUNCTION IF EXISTS public.hash_profile_password();
DROP FUNCTION IF EXISTS public.verify_user_login(text, text);

-- 2. Reset ALL account passwords to plain text

-- Commandant (username: commandant, password: password)
UPDATE public.profiles 
SET password_hash = 'password'
WHERE username = 'commandant';

-- Officer 1 (username: officer1, password: password1)
UPDATE public.profiles 
SET password_hash = 'password1'
WHERE username = 'officer1';

-- Officer 2 (username: officer2, password: password2)
UPDATE public.profiles 
SET password_hash = 'password2'
WHERE username = 'officer2';

-- Officer 3 (username: officer3, password: password3)
UPDATE public.profiles 
SET password_hash = 'password3'
WHERE username = 'officer3';

-- Officer 4 (username: officer4, password: password4)
UPDATE public.profiles 
SET password_hash = 'password4'
WHERE username = 'officer4';

-- Officer 5 (username: officer5, password: password5)
UPDATE public.profiles 
SET password_hash = 'password5'
WHERE username = 'officer5';
