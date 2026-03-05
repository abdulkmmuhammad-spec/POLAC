-- DIAGNOSTIC SCRIPT: CHECK PROFILES DATA
-- Run this in your Supabase SQL Editor to see what accounts exist.

SELECT 
    id, 
    username, 
    role, 
    full_name,
    CASE WHEN password_hash IS NOT NULL THEN 'SET' ELSE 'MISSING' END as password_status
FROM public.profiles
ORDER BY role, username;

-- Also check if there are any RLS issues still lingering
SELECT 
    relname as table_name, 
    relrowsecurity as rls_enabled 
FROM pg_class 
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace 
WHERE nspname = 'public' 
AND relname IN ('profiles', 'parade_records', 'cadet_registry');
