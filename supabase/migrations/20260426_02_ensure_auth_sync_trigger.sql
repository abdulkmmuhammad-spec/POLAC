-- supabase/migrations/20260426_02_ensure_auth_sync_trigger.sql
-- Fix the Root Cause: Auth Sync Trigger to populate public.users on signup

CREATE OR REPLACE FUNCTION public.handle_new_user_sync()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, password, username, full_name, role, created_at, total_cadets)
  VALUES (
    NEW.id,
    NEW.email,
    'AUTH_MANAGED_' || NEW.id::text, -- Placeholder to satisfy NOT NULL constraint
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'course_officer'),
    NEW.created_at,
    0
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_sync ON auth.users;
CREATE TRIGGER on_auth_user_created_sync
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_sync();
