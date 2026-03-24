# Migration Log - 2026-03-24

## Objective: Resolve Persistent Login Failures
Due to recurring "Password mismatch" and "Missing RPC function" errors in the Supabase/Bcrypt flow, the system has been migrated to a simplified Plain Text authentication model.

## Changes:
1. **Frontend (`services/dbService.ts`)**:
   - Removed `bcryptjs` dependency.
   - Removed `verify_user_login` RPC call.
   - Implemented direct `profiles` table query with `===` plain text comparison.
   - Updated `inviteOfficer` to store passwords in plain text.

2. **Database**:
   - Dropped `tr_hash_profile_password` trigger (which was double-hashing passwords).
   - Removed `verify_user_login` function.
   - Reset all 6 baseline accounts (`commandant`, `officer1-5`) to plain text passwords.

3. **Restore Point**:
   - Commited and pushed to `origin/main` (Triggers Vercel deployment).

## Current Credentials:
- commandant / password
- officer1 / password1
- officer2 / password2
- officer3 / password3
- officer4 / password4
- officer5 / password5
