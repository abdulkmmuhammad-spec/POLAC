-- ============================================================
-- FILE: 20260326_resolve_rls_deadlock.sql
-- DATE: 2026-03-26
-- PURPOSE: Replace recursive table-lookups in RLS policies with modern JWT claims
-- ============================================================

-- 1. Drop the helper functions that cause recursive table read locks
DROP FUNCTION IF EXISTS public.is_commandant(UUID);

-- 2. Drop the recursive policies on the profiles table
DROP POLICY IF EXISTS "Commandants can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Commandants can view all records" ON public.parade_records;

-- 3. Create modern, JWT-based policies (0 query recursion cost)

-- Commandants can manage all profiles
CREATE POLICY "Commandants can manage all profiles" ON public.profiles
    FOR ALL USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'commandant'
    );

-- Any authenticated user can view profiles (required for directory / assignment lookups)
CREATE POLICY "Authenticated users can view all profiles" ON public.profiles
    FOR SELECT TO authenticated USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Commandants can view all parade records
CREATE POLICY "Commandants can view all records" ON public.parade_records
    FOR SELECT USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'commandant'
    );
