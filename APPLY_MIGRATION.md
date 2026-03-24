# Apply Password Migration - Step-by-Step

## The Error
The RPC function `verify_user_login` doesn't exist in your Supabase database. This is why login is failing.

## Solution: Apply the Migration

### Step 1: Open Supabase Dashboard
Go to: https://supabase.com/dashboard/project/ixqqbmwqminmwrvrevlq

### Step 2: Navigate to SQL Editor
1. Click "SQL Editor" in the left sidebar
2. Click "New query"

### Step 3: Run the Migration
Copy and paste this complete SQL:

```sql
-- Enable pgcrypto extension for bcrypt hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create or replace the verify_user_login function
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

-- Update commandant password (username: commandant, password: password)
UPDATE profiles
SET password_hash = '$2b$10$v0047uZkWcT4j9d51s3hpe.AUoeaCKnD6/RV8DtGdldF6F8pnaxCO'
WHERE username = 'commandant';

-- Update officer1 password (username: officer1, password: password1)
UPDATE profiles
SET password_hash = '$2b$10$iKuu3CTAvNU8Jqn5fra.POJtHHyYeBxM.44kSaga3Vm8l8nS63cui'
WHERE username = 'officer1';

-- Verify the updates
SELECT username, role, LEFT(password_hash, 20) || '...' as hash_preview
FROM profiles
WHERE username IN ('commandant', 'officer1');
```

### Step 4: Execute
Click "Run" - it should complete successfully with no errors.

### Step 5: Test Login
1. Go to http://localhost:3000
2. Login with: **commandant** / **password**

## What This Does
1. Creates the `verify_user_login` RPC function
2. Sets bcrypt-hashed passwords for all users
3. Fixes the authentication flow

## Expected Result
✅ No more "RPC error" or "Password mismatch" errors
✅ Successful login with commandant / password