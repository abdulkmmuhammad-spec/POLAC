-- FULL DATABASE REVERT: RESTORE LEGACY ACCESS
-- Run this in your Supabase SQL Editor to unlock the database.

-- 1. DISABLE ROW LEVEL SECURITY (RLS)
-- This allows the legacy code to query these tables directly again.
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.parade_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadet_details DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadet_registry DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;

-- 2. DROP ALL NEW POLICIES (Cleanup)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Commandants can manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Officers can manage own course records" ON parade_records;
DROP POLICY IF EXISTS "Commandants can view all records" ON parade_records;
DROP POLICY IF EXISTS "Authenticated users can view registry" ON cadet_registry;
DROP POLICY IF EXISTS "Commandants can manage registry" ON cadet_registry;
DROP POLICY IF EXISTS "Commandants can manage app settings" ON app_settings;
DROP POLICY IF EXISTS "Officers can manage assigned course records" ON parade_records;
DROP POLICY IF EXISTS "Officers can view assigned course cadets" ON cadet_registry;
DROP POLICY IF EXISTS "Users can view assigned course notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update non-assignment profile data" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON profiles;

-- 3. REMOVE ROTATION OBJECTS (Remove views and dependencies first)
DROP VIEW IF EXISTS public.assignment_conflicts;
DROP FUNCTION IF EXISTS public.vacate_course(integer);

-- 4. REMOVE ROTATION COLUMNS (Use CASCADE to handle any remaining dependencies)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS service_number CASCADE;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS assigned_course_number CASCADE;
ALTER TABLE public.notifications DROP COLUMN IF EXISTS course_number CASCADE;

-- 5. CLEANUP AUTH (Remove the SNR001 test account)
DELETE FROM auth.users WHERE email = 'snr001@polac.com';
DELETE FROM auth.users WHERE email = 'commandant@polac.com';

-- Database Reverted Successfully. Legacy login should now work.
