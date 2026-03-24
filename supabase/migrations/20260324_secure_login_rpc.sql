-- Secure Login RPC and Password Reset
-- Date: 2026-03-24

-- 1. Ensure pgcrypto extension is available for secure hashing if needed
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create the secure login function in the public schema
CREATE OR REPLACE FUNCTION public.verify_user_login(
    p_username TEXT,
    p_password TEXT
)
RETURNS TABLE (
    id UUID,
    username TEXT,
    role TEXT,
    full_name TEXT,
    course_name TEXT,
    year_group INT,
    course_number INT,
    total_cadets INT,
    profile_image TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges to read hashes
AS $$
DECLARE
    v_stored_hash TEXT;
    v_user_record RECORD;
BEGIN
    -- Fetch the user record and hash
    SELECT * INTO v_user_record
    FROM profiles
    WHERE profiles.username::text ILIKE p_username::text;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Standard Bcrypt comparison (if pgcrypto supports it) 
    -- or local validation logic. 
    -- For now, we will perform a direct check against the stored hash 
    -- using crypt() if the DB supports it, or simple equality for this fix.
    
    -- IMPORTANT: This RPC assumes the DB can verify the hash.
    -- If pgcrypto's crypt() is used with bcrypt:
    IF v_user_record.password_hash = crypt(p_password, v_user_record.password_hash) THEN
        RETURN QUERY SELECT 
            v_user_record.id,
            v_user_record.username,
            v_user_record.role,
            v_user_record.full_name,
            v_user_record.course_name,
            v_user_record.year_group,
            v_user_record.course_number,
            v_user_record.total_cadets,
            v_user_record.profile_image;
    END IF;
END;
$$;

-- 3. Reset the commandant password to a known state compatible with crypt()
-- Password: 'commandant'
UPDATE profiles 
SET password_hash = crypt('commandant', gen_salt('bf'))
WHERE username = 'commandant';

-- 4. Reset officer1 password
-- Password: 'officer1'
UPDATE profiles 
SET password_hash = crypt('officer1', gen_salt('bf'))
WHERE username = 'officer1';
