-- Migration: Phase 1 - Officer Rotation Support
-- Description: Adds service_number and assigned_course_number to the profiles table.

-- 1. Add columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS service_number TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS assigned_course_number INTEGER;

-- 2. Update the profile trigger to handle service_number if available in metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, role, service_number, assigned_course_number)
  VALUES (
    new.id,
    new.email,
    split_part(new.email, '@', 1),
    COALESCE(new.raw_user_meta_data->>'role', 'course_officer'),
    new.raw_user_meta_data->>'service_number',
    (new.raw_user_meta_data->>'assigned_course_number')::integer
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Data Migration (Optional)
-- If you already have accounts, you can manually set their service numbers:
-- UPDATE profiles SET service_number = '77665', assigned_course_number = 12 WHERE username = 'officer_b';
