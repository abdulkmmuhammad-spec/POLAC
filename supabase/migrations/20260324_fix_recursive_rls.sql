-- Fix Recursive RLS (Infinite Loops)
-- Date: 2026-03-24
-- Description: Replaces recursive role checks with a SECURITY DEFINER function to prevent login hangs.

-- 1. Create a helper function that bypasses RLS to check if a user is a commandant
-- This must be in the public schema and use SECURITY DEFINER to bypass the profiles RLS.
CREATE OR REPLACE FUNCTION public.is_commandant(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- CRITICAL: This bypasses RLS for the internal query
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = user_id AND role = 'commandant'
    );
END;
$$;

-- 2. Create another helper for course officer check
CREATE OR REPLACE FUNCTION public.is_course_officer(user_id UUID, p_course_number INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = user_id AND role = 'course_officer' AND course_number = p_course_number
    );
END;
$$;

-- 3. Drop existing recursive policies
DROP POLICY IF EXISTS "Commandants can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Officers can manage own course records" ON public.parade_records;
DROP POLICY IF EXISTS "Commandants can view all records" ON public.parade_records;
DROP POLICY IF EXISTS "Commandants can manage registry" ON public.cadet_registry;
DROP POLICY IF EXISTS "Commandants can manage app settings" ON public.app_settings;

-- 4. Re-implement policies using the non-recursive helpers

-- Profiles
CREATE POLICY "Commandants can manage all profiles" ON public.profiles
    FOR ALL USING (is_commandant(auth.uid()));

-- Parade Records
CREATE POLICY "Officers can manage own course records" ON public.parade_records
    FOR ALL USING (
        is_commandant(auth.uid()) OR 
        is_course_officer(auth.uid(), course_number)
    );

CREATE POLICY "Commandants can view all records" ON public.parade_records
    FOR SELECT USING (is_commandant(auth.uid()));

-- Cadet Registry
CREATE POLICY "Commandants can manage registry" ON public.cadet_registry
    FOR ALL USING (is_commandant(auth.uid()));

-- App Settings
CREATE POLICY "Commandants can manage app settings" ON public.app_settings
    FOR ALL USING (is_commandant(auth.uid()));

-- 5. Ensure the base view policy for profiles still exists
-- (This was set in the emergency fix, but re-asserting for safety)
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles" ON public.profiles
    FOR SELECT TO authenticated USING (true);
