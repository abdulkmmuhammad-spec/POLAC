-- Migration: Sync Profiles and Auth Metadata
-- Description: Sets up triggers and functions to keep profiles Table and Supabase Auth in sync.

-- 1. Function to handle new user signup and set role metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Insert into profiles table automatically when a user signs up
  -- Note: We default role to 'course_officer' unless specified in metadata
  INSERT INTO public.profiles (id, username, full_name, role)
  VALUES (
    new.id,
    new.email, -- Use email prefix as initial username
    split_part(new.email, '@', 1),
    COALESCE(new.raw_user_meta_data->>'role', 'course_officer')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger for auto-profile creation
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Migration Helper: How to migrate existing profiles to Auth
/*
  INSTRUCTIONS FOR THE USER:
  To migrate your existing data:
  1. Go to Authentication -> Users in Supabase Dashboard.
  2. For EACH existing profile, create a new user with the same ID (if using UUIDs) 
     or update the profile's ID to match the new Auth UUID.
  3. Ensure you set the 'role' in the user's raw metadata during creation 
     or via SQL:
     UPDATE auth.users 
     SET raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', '"commandant"')
     WHERE email = 'commandant@polac.com';
*/

-- 4. Secure the profiles table with RLS (if not already done)
CREATE POLICY "Users can update their own profiles" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
