-- ============================================================
-- FILE: 20260326_auth_rebuild_phase1.sql
-- DATE: 2026-03-26
-- PURPOSE: Phase 1 of auth system rebuild
--   - Add email_exists() RPC to check pre-signup
--   - Add upsert_profile() RPC for profile create/update
--   - Verify existing RPCs and trigger are working
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: email_exists(p_email TEXT)
-- Returns: {exists: BOOLEAN} — single row
-- Used by: Login page signup flow (pre-flight check before
-- calling supabase.auth.signUp to give a better error message)
-- Bypasses RLS via SECURITY DEFINER.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.email_exists(p_email TEXT)
RETURNS TABLE (exists BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT EXISTS(
        SELECT 1 FROM auth.users WHERE email = p_email
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_exists TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: upsert_profile(p_user_id, p_username, p_role, p_full_name)
-- Returns: void
-- Creates or updates a profile row.
-- Used by: signup flow (after supabase.auth.signUp succeeds)
-- Bypasses RLS via SECURITY DEFINER.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_profile(
    p_user_id UUID,
    p_username TEXT,
    p_role TEXT,
    p_full_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (
        id, username, role, full_name, created_at, updated_at
    )
    VALUES (
        p_user_id, p_username, p_role, p_full_name, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name,
        updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_profile TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: get_profile_by_id(p_user_id UUID)
-- Updated to return ALL profiles columns including
-- service_number and assigned_course_number.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_profile_by_id(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    username TEXT,
    role TEXT,
    full_name TEXT,
    course_name TEXT,
    year_group INTEGER,
    course_number INTEGER,
    total_cadets INTEGER,
    profile_image TEXT,
    service_number TEXT,
    assigned_course_number INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY SELECT * FROM public.profiles WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_by_id TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: get_registration_counts()
-- Already exists from 20260325_simplified_auth_rpc.sql.
-- This version re-creates it cleanly to ensure it's correct.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_registration_counts()
RETURNS TABLE (commandant_count BIGINT, officer_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE role = 'commandant') AS commandant_count,
        COUNT(*) FILTER (WHERE role = 'course_officer') AS officer_count
    FROM public.profiles;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_registration_counts TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: get_officers()
-- Already exists from 20260325_simplified_auth_rpc.sql.
-- This version re-creates it with full column set.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_officers()
RETURNS TABLE (
    id UUID,
    username TEXT,
    role TEXT,
    full_name TEXT,
    course_name TEXT,
    year_group INTEGER,
    course_number INTEGER,
    total_cadets INTEGER,
    profile_image TEXT,
    service_number TEXT,
    assigned_course_number INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.profiles
    WHERE role = 'course_officer'
    ORDER BY full_name ASC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_officers TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────
-- TRIGGER: Verify on_auth_user_created exists and works
-- ─────────────────────────────────────────────────────────────
-- Check if trigger exists
SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created' AND tgrelid = 'auth.users'::regclass;

-- If not exists, create it:
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'on_auth_user_created'
        AND tgrelid = 'auth.users'::regclass
    ) THEN
        -- Ensure the function exists
        CREATE OR REPLACE FUNCTION public.handle_new_user_registration()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SECURITY DEFINER SET search_path = public
        AS $$
        DECLARE
            v_role TEXT;
            v_username TEXT;
        BEGIN
            v_role := COALESCE(
                NEW.raw_user_meta_data->>'role',
                'course_officer'
            );
            v_username := COALESCE(
                NEW.raw_user_meta_data->>'username',
                split_part(NEW.email, '@', 1)
            );
            INSERT INTO public.profiles (id, username, role, full_name)
            VALUES (NEW.id, v_username, v_role, v_username)
            ON CONFLICT (id) DO NOTHING;
            RETURN NEW;
        END;
        $$;

        CREATE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_registration();

        RAISE NOTICE 'Trigger on_auth_user_created created successfully';
    ELSE
        RAISE NOTICE 'Trigger on_auth_user_created already exists';
    END IF;
END;
$$;
