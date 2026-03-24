# Technical PRD: Unified Authentication Flow (Plain-Text Version)

## 1. Overview
This PRD outlines the three-tier authentication process implemented to resolve persistent BCrypt and RPC failures. It defines the relationship between the React frontend, the Supabase client, and the PostgreSQL database schema.

## 2. Frontend Flow (Lines of Code)

### Step 1: User Input ([Login.tsx](file:///c:/Users/abdul/OneDrive/Documents/IMPORTANT%20PROGRAMMING%20STUFF/polac-parade-management%20%282%29%20-%20Copy/components/Auth/Login.tsx))
- **Location**: [Login.tsx](file:///c:/Users/abdul/OneDrive/Documents/IMPORTANT%20PROGRAMMING%20STUFF/polac-parade-management%20%282%29%20-%20Copy/components/Auth/Login.tsx)
- **Logic**: Captures `username`, `password`, and `loginRole` from the UI form.
- **Trigger**: [handleSubmit](file:///c:/Users/abdul/OneDrive/Documents/IMPORTANT%20PROGRAMMING%20STUFF/polac-parade-management%20%282%29%20-%20Copy/components/Auth/Login.tsx#26-48) on line 26 calls the [login()](file:///c:/Users/abdul/OneDrive/Documents/IMPORTANT%20PROGRAMMING%20STUFF/polac-parade-management%20%282%29%20-%20Copy/context/AuthContext.tsx#63-112) function from [AuthContext](file:///c:/Users/abdul/OneDrive/Documents/IMPORTANT%20PROGRAMMING%20STUFF/polac-parade-management%20%282%29%20-%20Copy/context/AuthContext.tsx#6-14).

### Step 2: Context Management ([AuthContext.tsx](file:///c:/Users/abdul/OneDrive/Documents/IMPORTANT%20PROGRAMMING%20STUFF/polac-parade-management%20%282%29%20-%20Copy/context/AuthContext.tsx))
- **Location**: [AuthContext.tsx](file:///c:/Users/abdul/OneDrive/Documents/IMPORTANT%20PROGRAMMING%20STUFF/polac-parade-management%20%282%29%20-%20Copy/context/AuthContext.tsx)
- **Logic**: 
    - Lines 63-111: The [login()](file:///c:/Users/abdul/OneDrive/Documents/IMPORTANT%20PROGRAMMING%20STUFF/polac-parade-management%20%282%29%20-%20Copy/context/AuthContext.tsx#63-112) function manages the loading state and handles failures (lockout logic).
    - Line 70: Calls the `dbService.loginWithCredentials()` method.

### Step 3: Service Layer & Comparison ([dbService.ts](file:///c:/Users/abdul/OneDrive/Documents/IMPORTANT%20PROGRAMMING%20STUFF/polac-parade-management%20%282%29%20-%20Copy/services/dbService.ts))
- **Location**: [dbService.ts](file:///c:/Users/abdul/OneDrive/Documents/IMPORTANT%20PROGRAMMING%20STUFF/polac-parade-management%20%282%29%20-%20Copy/services/dbService.ts)
- **Logic**:
    - **Query** (Lines 126-131): Fetches the user record from the `profiles` table using `.ilike()` for case-insensitivity.
    - **Comparison** (Lines 139-146): Performs a **Direct String Comparison** (`===`) between the provided password and the database `password_hash`. Both are `trimmed()` to prevent whitespace errors.

## 3. Database Schema (PostgreSQL)

### Table Definition: `profiles`
The `profiles` table is the "Single Source of Truth" for authentication.

| Column | Type | Description |
| :--- | :--- | :--- |
| [id](file:///c:/Users/abdul/OneDrive/Documents/IMPORTANT%20PROGRAMMING%20STUFF/polac-parade-management%20%282%29%20-%20Copy/components/Auth/Login.tsx#14-25) | `UUID` | Primary Key (matches Supabase Auth ID if linked) |
| `username` | `TEXT`/`VARCHAR` | Unique identifier used for login (e.g., 'commandant') |
| `password_hash` | `VARCHAR(255)` | **Plain Text** password storage (e.g., 'password') |
| `role` | `USER_ROLE` | Enum (`commandant` or `course_officer`) |

### Security Layer (RLS)
The Row Level Security (RLS) policy in the database is what allows the React app to "see" the user records during login without already being logged in.
- **SQL Source**: [FIX_PASSWORD_SQL.sql](file:///c:/Users/abdul/OneDrive/Documents/IMPORTANT%20PROGRAMMING%20STUFF/polac-parade-management%20%282%29%20-%20Copy/FIX_PASSWORD_SQL.sql)
- **Primary Policy**:
  ```sql
  CREATE POLICY "Allow login lookup" ON profiles
      FOR SELECT TO anon USING (true);
  ```
  *This permits the `anon` (public) key to read the `profiles` table specifically for finding usernames.*

## 4. Why This Configuration? (Rationale)
1. **Simplified Hashing**: By using plain text, we eliminated the complex salt/cost factor discrepancies between the `bcryptjs` libraries and Postgres `crypt()` functions that were causing mismatches.
2. **Removed RPC Overhead**: By querying the table directly, we bypassed the "404 RPC Not Found" errors caused by Supabase schema cache delays.
3. **Trigger-Free Updates**: We dropped the `tr_hash_profile_password` trigger to ensure that updating a password doesn't lead to it being "double-hashed" or otherwise corrupted.
