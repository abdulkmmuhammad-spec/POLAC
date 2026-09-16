-- MIGRATION: 20260718_allow_backend_admin_user_edits.sql
-- DESCRIPTION: Permits direct database administration roles (postgres, service_role, supabase_admin) in Supabase SQL/Table Editor to modify user records without triggering prevent_identity_hijack.

CREATE OR REPLACE FUNCTION public.prevent_identity_hijack()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Allow explicit administrative session overrides OR direct backend admin roles (SQL Editor / Table Editor / Service Role)
    IF current_setting('app.allow_identity_override', true) = 'true'
       OR current_user IN ('postgres', 'supabase_admin', 'service_role')
       OR session_user IN ('postgres', 'supabase_admin') THEN
        RETURN NEW;
    END IF;

    -- 2. Block unauthorized client-side UPDATEs where core identity fields (email, username) are mutated from an established state
    IF TG_OP = 'UPDATE' THEN
        IF (OLD.email IS NOT NULL AND NEW.email IS DISTINCT FROM OLD.email) OR
           (OLD.username IS NOT NULL AND NEW.username IS DISTINCT FROM OLD.username) THEN
            RAISE EXCEPTION 'IDENTITY VIOLATION: Cannot recycle identity credentials. Deactivate the account instead.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Re-verify trigger binding
DROP TRIGGER IF EXISTS trg_prevent_identity_hijack ON public.users;
CREATE TRIGGER trg_prevent_identity_hijack
    BEFORE INSERT OR UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_identity_hijack();
