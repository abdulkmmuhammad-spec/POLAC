-- Fix Missing Auth Trigger and Orphaned Profiles
-- Date: 2026-03-24
-- Description: Creates the on_auth_user_created trigger and inserts missing profile rows.

-- 1. Create the trigger function that auto-creates a profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_username TEXT;
BEGIN
  -- Extract role and username from auth.users metadata
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'course_officer');
  v_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));

  -- Insert profile only if one doesn't already exist
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    INSERT INTO public.profiles (id, username, role, full_name)
    VALUES (NEW.id, v_username, v_role, v_username);
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Create the trigger on auth.users (fires AFTER a new user is inserted)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_registration();

-- 3. Backfill: Insert missing profile for SNR001 (auth user has no profile)
-- This user was likely created manually or before the trigger existed
INSERT INTO public.profiles (id, username, role, full_name)
VALUES ('9c0d0c6c-40f8-4ab4-a5d2-3cc88cc3a7bf', 'SNR001', 'course_officer', 'SNR001')
ON CONFLICT (id) DO NOTHING;
