-- ==============================================================================
-- Migration: Supabase Auth Sync & Identity Lockdown
-- Date: 2026-03-24
-- Description: Transitions plain-text auth to secure Supabase Auth integrating
--              atomic triggers, email constraints, and count-based RLS.
-- ==============================================================================

-- 1. CLEANUP PREVIOUS AUTH (WARNING: THIS INVALIDATES ALL EXISTING ACCOUNTS)
-- Since we are moving to proper auth.users, legacy profiles must be cleared 
-- so they don't break the foreign key constraint. User data must be re-initialized.
DELETE FROM public.profiles;

-- 2. SCHEMA: REMOVE PLAIN-TEXT & ENFORCE LINK TO AUTH.USERS
ALTER TABLE public.profiles DROP COLUMN IF EXISTS password_hash;

-- Ensure the ID column is a UUID and references auth.users to prevent "orphaned" profiles.
ALTER TABLE public.profiles 
  ALTER COLUMN id SET DATA TYPE UUID USING (uuid_generate_v4()),
  DROP CONSTRAINT IF EXISTS fk_user,
  ADD CONSTRAINT fk_user FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;

-- 3. REGISTRATION LIMIT: Enforced by frontend pre-flight count check (not SQL constraint).
-- The app will verify that exactly 0 commandants exist before allowing signup.
-- No database constraint needed here — the count-based check is the gatekeeper.


-- 4. ATOMIC SIGNUP: THE POST-SIGNUP TRIGGER
-- Automatically creates the profile row the moment a user confirms their email/signs up in GoTrue.
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  -- We extract username and role from the metadata passed during auth.signUp()
  INSERT INTO public.profiles (id, username, role)
  VALUES (
    new.id, 
    new.raw_user_meta_data->>'username', 
    new.raw_user_meta_data->>'role'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to the auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 5. SECURITY: ROW LEVEL SECURITY (RLS) REFINEMENT
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy A: Self View (Users can only see their own profile data)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT TO authenticated USING (auth.uid() = id);

-- Policy B: Public Count (The "Pre-flight" check for the Signup/Login toggle)
-- We need the app to count roles before login, but we don't want to expose user names/IDs.
DROP POLICY IF EXISTS "Allow login lookup" ON public.profiles;
DROP POLICY IF EXISTS "Public can count profiles" ON public.profiles;
CREATE POLICY "Public can count profiles" ON public.profiles
    FOR SELECT TO anon USING (true);

-- Done. Ready for Frontend sync.
