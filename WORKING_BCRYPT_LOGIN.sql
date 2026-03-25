-- WORKING BCRYPT LOGIN - Use This One!
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/ixqqbmwqminmwrvrevlq/sql-editor

-- Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create the verify_user_login function (bcrypt-based)
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
SECURITY DEFINER
AS $$
DECLARE
    v_user_record RECORD;
BEGIN
    SELECT * INTO v_user_record
    FROM profiles
    WHERE profiles.username::text ILIKE p_username::text;

    IF NOT FOUND THEN
        RETURN;
    END IF;

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

-- Update ALL users with BCRYPT HASHES
UPDATE profiles SET password_hash = '$2b$10$v0047uZkWcT4j9d51s3hpe.AUoeaCKnD6/RV8DtGdldF6F8pnaxCO' WHERE username = 'commandant';
UPDATE profiles SET password_hash = '$2b$10$iKuu3CTAvNU8Jqn5fra.POJtHHyYeBxM.44kSaga3Vm8l8nS63cui' WHERE username = 'officer1';
UPDATE profiles SET password_hash = '$2b$10$5t28O/3VdJSega01eE3ngO68v6uvDaV51OxrpJS1Y2sG9zq54GVRe' WHERE username = 'officer2';
UPDATE profiles SET password_hash = '$2b$10$yi4auA6UT6BXxXBBgXftAe89Su7GGBhrXyF3WYXSU.lo3.FfG53IS' WHERE username = 'officer3';
UPDATE profiles SET password_hash = '$2b$10$VI.GtfBCrPwxwM6ESBlX9OmrM661j2OvRcccw6JUXk9VHDhFdAuUW' WHERE username = 'officer4';
UPDATE profiles SET password_hash = '$2b$10$4Y9ep23dduRXvy95H6pasOvVGn6NmSh9jJ6XTg981RleKKoBLuU9q' WHERE username = 'officer5';

-- Verify
SELECT username, role, LEFT(password_hash, 20) || '...' as hash_preview
FROM profiles
WHERE username IN ('commandant', 'officer1', 'officer2', 'officer3', 'officer4', 'officer5')
ORDER BY username;