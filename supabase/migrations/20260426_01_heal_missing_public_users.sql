-- supabase/migrations/20260426_01_heal_missing_public_users.sql
-- Heal the Database: Bulk Sync and Identity Reconciliation

-- 0. Prepare Foreign Keys for ID Cascade Updates
-- The ID reconciliation requires that foreign keys pointing to public.users(id) support cascading updates.

-- parade_records
ALTER TABLE public.parade_records DROP CONSTRAINT IF EXISTS parade_records_officer_id_fkey;
ALTER TABLE public.parade_records ADD CONSTRAINT parade_records_officer_id_fkey 
    FOREIGN KEY (officer_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- audit_events
ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_actor_id_fkey;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_actor_id_fkey 
    FOREIGN KEY (actor_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- 1. Identity Reconciliation: Update public.users IDs to match auth.users IDs where emails match
-- Because of ON UPDATE CASCADE, parade_records and audit_events will automatically update.
UPDATE public.users u
SET id = a.id
FROM auth.users a
WHERE u.email = a.email AND u.id != a.id;

-- 2. Bulk Sync: Insert missing users from auth.users into public.users
INSERT INTO public.users (id, email, password, username, full_name, role, created_at, total_cadets)
SELECT 
    id, 
    email, 
    'AUTH_MANAGED_' || id::text, -- Placeholder password
    COALESCE(raw_user_meta_data->>'username', split_part(email, '@', 1)),
    COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
    COALESCE(raw_user_meta_data->>'role', 'course_officer'),
    created_at,
    0
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.users)
  AND email NOT IN (SELECT email FROM public.users)
ON CONFLICT (id) DO NOTHING;
