# Recovery Snapshot: Plain Text Transition (2026-03-24)

This document contains a snapshot of the critical changes made to resolve the "Password mismatch" and "404/406" login errors. If these changes ever need to be reverted, use the code below.

## 1. Frontend Logic ([services/dbService.ts](file:///c:/Users/abdul/OneDrive/Documents/IMPORTANT%20PROGRAMMING%20STUFF/polac-parade-management%20%282%29%20-%20Copy/services/dbService.ts))
```typescript
  loginWithCredentials: async (username: string, password: string): Promise<User | null> => {
    try {
      const cleanUsername = username.trim();
      const providedPassword = password.trim();

      console.log(`Attempting login for: ${cleanUsername}`);

      // 1. Fetch the user by username only
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', cleanUsername)
        .single();

      if (error || !data) {
        console.error('Login failed: User not found', error?.message);
        return null;
      }

      // 2. Plain text password comparison
      if (providedPassword !== data.password_hash) {
        console.error('Login failed: Password mismatch for', cleanUsername);
        return null;
      }
      console.log(`Login successful for: ${cleanUsername}`);
      return {
        id: data.id,
        username: data.username,
        role: data.role,
        fullName: data.full_name,
        courseName: data.course_name,
        yearGroup: data.year_group,
        courseNumber: data.course_number,
        totalCadets: data.total_cadets,
        profileImage: data.profile_image
      };
    } catch (err) {
      console.error('Login error:', err);
      return null;
    }
  },
```

## 2. SQL Migration ([FIX_PASSWORD_SQL.sql](file:///c:/Users/abdul/OneDrive/Documents/IMPORTANT%20PROGRAMMING%20STUFF/polac-parade-management%20%282%29%20-%20Copy/FIX_PASSWORD_SQL.sql))
```sql
-- Fix login passwords PLAIN TEXT VERSION
-- 1. DROP ALL BLOCKING TRIGGERS AND FUNCTIONS
DROP TRIGGER IF EXISTS tr_hash_profile_password ON public.profiles;
DROP FUNCTION IF EXISTS public.hash_profile_password();

-- 2. FIX 406 ERROR: ADD RLS POLICY FOR LOGIN
DROP POLICY IF EXISTS "Allow login lookup" ON profiles;
CREATE POLICY "Allow login lookup" ON profiles
    FOR SELECT TO anon USING (true);

-- 3. Reset ALL account passwords to plain text
UPDATE public.profiles SET password_hash = 'password' WHERE username = 'commandant';
UPDATE public.profiles SET password_hash = 'password1' WHERE username = 'officer1';
UPDATE public.profiles SET password_hash = 'password2' WHERE username = 'officer2';
UPDATE public.profiles SET password_hash = 'password3' WHERE username = 'officer3';
UPDATE public.profiles SET password_hash = 'password4' WHERE username = 'officer4';
UPDATE public.profiles SET password_hash = 'password5' WHERE username = 'officer5';
```

## 3. Rationale
- **Removing BCrypt**: Replaced complex client-side hashing with plain text storage to eliminate salt/cost incompatibilities.
- **RLS Policy**: Added a public `SELECT` policy for the `anon` role on `profiles` to bypass the "404 User Not Found" error during login.
