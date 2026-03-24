-- COMPLETE PASSWORD UPDATE for ALL USERS
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/ixqqbmwqminmwrvrevlq/sql-editor

-- Update ALL user passwords with correct bcrypt hashes

-- Commandant (username: commandant, password: password)
UPDATE profiles
SET password_hash = '$2b$10$v0047uZkWcT4j9d51s3hpe.AUoeaCKnD6/RV8DtGdldF6F8pnaxCO'
WHERE username = 'commandant';

-- Officer 1 (username: officer1, password: password1)
UPDATE profiles
SET password_hash = '$2b$10$iKuu3CTAvNU8Jqn5fra.POJtHHyYeBxM.44kSaga3Vm8l8nS63cui'
WHERE username = 'officer1';

-- Officer 2 (username: officer2, password: password2)
UPDATE profiles
SET password_hash = '$2b$10$5t28O/3VdJSega01eE3ngO68v6uvDaV51OxrpJS1Y2sG9zq54GVRe'
WHERE username = 'officer2';

-- Officer 3 (username: officer3, password: password3)
UPDATE profiles
SET password_hash = '$2b$10$yi4auA6UT6BXxXBBgXftAe89Su7GGBhrXyF3WYXSU.lo3.FfG53IS'
WHERE username = 'officer3';

-- Officer 4 (username: officer4, password: password4)
UPDATE profiles
SET password_hash = '$2b$10$VI.GtfBCrPwxwM6ESBlX9OmrM661j2OvRcccw6JUXk9VHDhFdAuUW'
WHERE username = 'officer4';

-- Officer 5 (username: officer5, password: password5)
UPDATE profiles
SET password_hash = '$2b$10$4Y9ep23dduRXvy95H6pasOvVGn6NmSh9jJ6XTg981RleKKoBLuU9q'
WHERE username = 'officer5';

-- Verify all updates
SELECT
    username,
    role,
    CASE
        WHEN LENGTH(password_hash) > 20 THEN LEFT(password_hash, 20) || '...'
        ELSE password_hash
    END as hash_preview
FROM profiles
WHERE username IN ('commandant', 'officer1', 'officer2', 'officer3', 'officer4', 'officer5')
ORDER BY username;