-- EMERGENCY FIX: RESOLVE "DATABASE ERROR QUERYING SCHEMA"
-- Run this in your Supabase SQL Editor.

-- 1. FIX SCHEMA INCONSISTENCIES
-- Ensure 'notifications' has the mapping column required by the security policy
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS course_number INTEGER;

-- Ensure 'profiles' has all the new rotation columns (just in case)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS service_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assigned_course_number INTEGER;

-- 2. RESET DANGEROUS POLICIES
-- Drop the policies that are causing the "Database Error" (500)
DROP POLICY IF EXISTS "Officers can manage assigned course records" ON parade_records;
DROP POLICY IF EXISTS "Officers can view assigned course cadets" ON cadet_registry;
DROP POLICY IF EXISTS "Users can view assigned course notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update non-assignment profile data" ON profiles;

-- 3. APPLY STABLE POLICIES (Simplified for immediate recovery)
-- These are "Safe" versions that won't break the Auth system.

-- Records: Simple Course Check
CREATE POLICY "Officers can manage assigned course records" ON parade_records
    FOR ALL USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'commandant' OR 
        course_number = (SELECT assigned_course_number FROM public.profiles WHERE id = auth.uid())
    );

-- Registry: Simple View Check
CREATE POLICY "Officers can view assigned course cadets" ON cadet_registry
    FOR SELECT USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'commandant' OR 
        course_number = (SELECT assigned_course_number FROM public.profiles WHERE id = auth.uid())
    );

-- Notifications: Simple View Check
CREATE POLICY "Users can view assigned course notifications" ON notifications
    FOR SELECT USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'commandant' OR 
        course_number = (SELECT assigned_course_number FROM public.profiles WHERE id = auth.uid())
    );

-- Profiles: Allow users to view roles (Required for Auth login logic)
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON profiles;
CREATE POLICY "Authenticated users can view profiles" ON profiles
    FOR SELECT TO authenticated USING (true);

-- 4. CLEANUP AUTH (Final attempt for snr001)
DELETE FROM auth.users WHERE email = 'snr001@polac.com';
DELETE FROM public.profiles WHERE service_number = 'snr001' OR id NOT IN (SELECT id FROM auth.users);

-- Re-run the core setup logic
DO $$
DECLARE
    target_id UUID := gen_random_uuid();
BEGIN
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, role, aud, created_at, updated_at)
    VALUES (target_id, '00000000-0000-0000-0000-000000000000', 'snr001@polac.com', crypt('SecurePassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role": "commandant", "full_name": "Academy Commandant", "service_number": "snr001"}', 'authenticated', 'authenticated', now(), now());

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), target_id, format('{"sub":"%s","email":"%s"}', target_id, 'snr001@polac.com')::jsonb, 'email', 'snr001@polac.com', now(), now(), now());

    INSERT INTO public.profiles (id, username, full_name, role, service_number)
    VALUES (target_id, 'snr001@polac.com', 'Academy Commandant', 'commandant', 'snr001');
END $$;
