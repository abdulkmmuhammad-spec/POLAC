# PRD: Complete Authentication System Rebuild

**Project:** POLAC Parade Management System
**Document Version:** 1.0
**Date:** 2026-03-25
**Status:** DRAFT — Requires Implementation

---

## 1. Executive Summary

### Problem Statement

The current authentication system has been iteratively patched over multiple sessions, resulting in a fragile, complex architecture that exhibits multiple failure modes:

1. **Infinite spinner on app load** — The `initializeAuth()` function in `AuthContext.tsx` uses a turbo-init pattern with `localStorage` caching and background rehydration that creates race conditions. The `Promise.race` with `setTimeout` does not cancel Supabase requests — it merely rejects the outer promise while the Supabase query continues indefinitely.

2. **RLS-induced hangs** — `getRegistrationStatus()` and `getOfficers()` in `dbService.ts` use direct `supabase.from('profiles').select()` queries. With RLS enabled on `profiles`, these queries trigger recursive RLS policy evaluation that hangs indefinitely. The `AbortController` signal is not honored by Supabase.

3. **Complex, unreadable auth state machine** — The interplay between `initializing`, `currentUser`, `isLoggingIn` ref, `onAuthStateChange`, and `localStorage` cache creates a state machine that is difficult to reason about and debug.

4. **No clear separation of concerns** — Auth logic, lockout logic, registration status, and user profile management are all mixed into a single `AuthContext`.

### Root Cause Analysis

Supabase's PostgreSQL Row Level Security (RLS) is the root cause of all hangs:

- When a direct `.from('profiles').select()` runs under an authenticated session, PostgreSQL evaluates ALL active RLS policies on the `profiles` table.
- The current policies (`is_commandant(auth.uid())`, etc.) are `SECURITY DEFINER` helper functions that work correctly in normal operation. However, during certain edge conditions (profile missing, session not fully established, RLS policy recursion), these queries can hang.
- `AbortController` is a JavaScript Fetch API concept — Supabase's Go client does not wire it to PostgreSQL query cancellation. Setting `abortSignal` on a Supabase query does NOT cancel the underlying PostgreSQL query.

### Proposed Solution

Rebuild the auth system with a **pure RPC-first architecture** where ALL profile reads during the auth phase go exclusively through `SECURITY DEFINER` RPC functions that bypass RLS entirely. The frontend becomes simple and stateless — it calls RPCs and renders the result.

---

## 2. Design Principles

### Principle 1: RPC-First for Auth Phase

**All** profile reads that happen during login, signup, and app initialization MUST go through a `SECURITY DEFINER` RPC function. No direct table access to `profiles` for auth-phase queries.

| Query Type | Mechanism | Why |
|---|---|---|
| Get user profile by ID | `SECURITY DEFINER` RPC | Bypasses RLS |
| Check registration counts | `SECURITY DEFINER` RPC | Bypasses RLS |
| List all officers | `SECURITY DEFINER` RPC | Bypasses RLS |
| Check if email exists | `SECURITY DEFINER` RPC | Bypasses RLS |
| Get active session | `supabase.auth.getSession()` | Supabase managed, fast |
| Sign in | `supabase.auth.signInWithPassword()` | Supabase managed |
| Sign up | `supabase.auth.signUp()` | Supabase managed |
| Sign out | `supabase.auth.signOut()` | Supabase managed |

### Principle 2: No Artificial Timeouts

Do NOT use `Promise.race` with `setTimeout` to "cancel" Supabase queries. If a Supabase query hangs, that is a backend problem (RLS recursion) that must be fixed in the database — not papered over in the frontend with fake timeouts.

### Principle 3: Simple, Predictable State Machine

The frontend auth state machine has exactly 3 states:

```
UNauthenticated → Authenticated -> Unauthenticated
```

There is no "initializing" or "background rehydration" state. The app either knows the user is logged in, or it doesn't.

### Principle 4: Server-Managed Session TTL

Supabase manages session lifecycle. The frontend reads session state but does not cache it in `localStorage` for auth decisions. The only `localStorage` usage is for non-critical UI preferences.

### Principle 5: Fail Fast and Explicit

All auth errors must be surfaced as clear user-facing messages. No silent failures, no swallowed errors, no fallback-to-cache behavior that masks real problems.

---

## 3. Database Schema

### 3.1 Overview

The `profiles` table is the only auth-critical table. All other tables (parade_records, cadet_registry, etc.) are business logic tables that happen to have RLS policies but are not involved in the auth flow itself.

### 3.2 Auth-Related Tables

#### `auth.users` (Supabase-managed)

Do not modify. Supabase manages this table automatically.

#### `public.profiles`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY`, references `auth.users(id)` | Matches auth user ID |
| `username` | `TEXT` | `UNIQUE`, `NOT NULL` | Human-readable identifier |
| `role` | `TEXT` | `NOT NULL`, `CHECK (role IN ('commandant', 'course_officer'))` | Fixed two-role model |
| `full_name` | `TEXT` | | Display name |
| `course_name` | `TEXT` | | e.g., "REGULAR COURSE 12" |
| `year_group` | `INTEGER` | | Deprecated — use course_number |
| `course_number` | `INTEGER` | | The RC number (8-12) |
| `total_cadets` | `INTEGER` | `DEFAULT 0` | Cadet count |
| `profile_image` | `TEXT` | | URL to avatar |
| `service_number` | `TEXT` | `UNIQUE` | Official service number |
| `assigned_course_number` | `INTEGER` | | For course officer assignment |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | |

#### `public.sessions` (NEW — Optional)

If we need server-side session validation beyond what Supabase provides:

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY` | |
| `user_id` | `UUID` | `REFERENCES profiles(id)` | |
| `refresh_token` | `TEXT` | | |
| `expires_at` | `TIMESTAMPTZ` | | |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | |

### 3.3 RPC Functions (Auth Phase)

All functions use `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.

#### `public.get_profile_by_id(p_user_id UUID)`

Returns: single `profiles` row or empty.

```sql
CREATE OR REPLACE FUNCTION public.get_profile_by_id(p_user_id UUID)
RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY SELECT * FROM public.profiles WHERE id = p_user_id;
END;
$$;
```

#### `public.get_registration_counts()`

Returns: `{commandant_count: BIGINT, officer_count: BIGINT}`

```sql
CREATE OR REPLACE FUNCTION public.get_registration_counts()
RETURNS TABLE (commandant_count BIGINT, officer_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE role = 'commandant'),
        COUNT(*) FILTER (WHERE role = 'course_officer')
    FROM public.profiles;
END;
$$;
```

#### `public.get_officers()`

Returns: all `course_officer` profiles.

```sql
CREATE OR REPLACE FUNCTION public.get_officers()
RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.profiles
    WHERE role = 'course_officer'
    ORDER BY full_name ASC;
END;
$$;
```

#### `public.email_exists(p_email TEXT)`

Returns: `{exists: BOOLEAN}` — used to check if an email is already registered before signup attempt.

```sql
CREATE OR REPLACE FUNCTION public.email_exists(p_email TEXT)
RETURNS TABLE (exists BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY SELECT EXISTS (SELECT 1 FROM auth.users WHERE email = p_email);
END;
$$;
```

#### `public.upsert_profile(p_user_id UUID, p_username TEXT, p_role TEXT, p_full_name TEXT)`

Creates or updates a profile. Used after signup and after manual profile edits.

```sql
CREATE OR REPLACE FUNCTION public.upsert_profile(...)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, username, role, full_name, created_at, updated_at)
    VALUES (p_user_id, p_username, p_role, p_full_name, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name,
        updated_at = NOW();
END;
$$;
```

### 3.4 Auth Trigger

The `on_auth_user_created` trigger on `auth.users` is the critical piece that auto-creates a profile when a new user signs up.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_username TEXT;
BEGIN
    v_role := COALESCE(
        NEW.raw_user_meta_data->>'role',
        'course_officer'
    );
    v_username := COALESCE(
        NEW.raw_user_meta_data->>'username',
        split_part(NEW.email, '@', 1)
    );
    INSERT INTO public.profiles (id, username, role, full_name)
    VALUES (NEW.id, v_username, v_role, v_username)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_registration();
```

**Important:** The trigger uses `ON CONFLICT (id) DO NOTHING` so it is idempotent. Re-signing up with the same email (after sign-out) will not create duplicate profile entries.

### 3.5 RLS Policies

RLS is enabled on all tables. The auth flow does NOT rely on RLS for profile reads (we use RPC). RLS policies protect business data.

#### `profiles` Table

| Operation | Policy Name | Condition |
|---|---|---|
| SELECT (own row) | `profiles_select_own` | `auth.uid() = id` |
| SELECT (all — for commandant) | `profiles_select_commandant` | `is_commandant(auth.uid())` via SECURITY DEFINER helper |
| UPDATE (own row) | `profiles_update_own` | `auth.uid() = id` |
| UPDATE (all — for commandant) | `profiles_update_commandant` | `is_commandant(auth.uid())` |

**Note:** SELECT policies are permissive for commandant. The RPC functions bypass RLS entirely so auth-phase reads are unaffected.

#### `parade_records` Table

| Operation | Policy Name | Condition |
|---|---|---|
| SELECT (own records) | `parade_records_select_own` | `officer_id = auth.uid()` |
| SELECT (all — commandant) | `parade_records_select_commandant` | `is_commandant(auth.uid())` |
| INSERT | `parade_records_insert_own` | `is_commandant(auth.uid()) OR officer_id = auth.uid()` |
| UPDATE | `parade_records_update_own` | `is_commandant(auth.uid()) OR officer_id = auth.uid()` |

#### `cadet_registry` Table

| Operation | Policy Name | Condition |
|---|---|---|
| ALL | `cadet_registry_commandant_only` | `is_commandant(auth.uid())` |

#### `app_settings` Table

| Operation | Policy Name | Condition |
|---|---|---|
| ALL | `app_settings_commandant_only` | `is_commandant(auth.uid())` |

#### `notifications` Table

| Operation | Policy Name | Condition |
|---|---|---|
| SELECT (own) | `notifications_select_own` | `officer_name = (SELECT full_name FROM profiles WHERE id = auth.uid())` OR `is_commandant(auth.uid())` |
| INSERT | `notifications_insert_authenticated` | `auth.role() = 'authenticated'` |
| UPDATE (mark read) | `notifications_update_own` | Same as SELECT |

---

## 4. Frontend Architecture

### 4.1 File Structure

```
src/
├── context/
│   └── AuthContext.tsx       # ALL auth state and operations
├── services/
│   ├── supabase.ts            # Supabase client singleton
│   └── authService.ts         # Auth-specific RPC calls (wraps dbService)
├── hooks/
│   ├── useAuth.ts             # Re-exports useAuth from context
│   └── useRegistrationStatus.ts  # Hook for login page registration counts
├── components/
│   └── Auth/
│       ├── Login.tsx          # Login/signup form
│       └── index.ts
├── pages/
│   ├── UnauthenticatedApp.tsx # Route wrapper for public routes
│   └── AuthenticatedApp.tsx   # Route wrapper for protected routes
```

### 4.2 AuthContext Design

The `AuthContext` has exactly 3 states and minimal state variables:

```typescript
type AuthState =
  | { status: 'initializing' }           // App loading, checking session
  | { status: 'unauthenticated' }         // No valid session
  | { status: 'authenticated'; user: User }  // Valid session with profile
```

**State Variables:**

```typescript
// Single source of truth for auth state
const [authState, setAuthState] = useState<AuthState>({ status: 'initializing' });

// Derived convenience values (computed from authState)
const currentUser = authState.status === 'authenticated' ? authState.user : null;
const isLoading = authState.status === 'initializing';
const isAuthenticated = authState.status === 'authenticated';
```

**No more of these:**
- ❌ `initializing` boolean (replaced by `authState.status`)
- ❌ `isLoggingIn` ref
- ❌ `getCachedProfile()` localStorage read on init
- ❌ `setTimeout` / `Promise.race` hacks
- ❌ `failedAttempts`, `lockoutUntil`, `lockoutTime` (moved to a separate `useLockout` hook if needed)

### 4.3 Initialization Flow

**Before (complex):**
```
1. Read localStorage cache
2. Set initializing = !cachedProfile (optimistic)
3. Show dashboard immediately if cache exists
4. Race: getSession() vs 7s timeout
5. Background: getUserProfile()
6. If mismatch, update state
7. Always set initializing = false in finally
```

**After (simple):**
```
1. authState = { status: 'initializing' } — spinner shows
2. supabase.auth.getSession() — fast Supabase internal check
3. If no session → authState = { status: 'unauthenticated' }
4. If session → call get_profile_by_id RPC (SECURITY DEFINER, fast)
5. If profile found → authState = { status: 'authenticated', user: profile }
6. If profile missing → authState = { status: 'unauthenticated' }
7. Done. No finally block gymnastics.
```

**Key insight:** `supabase.auth.getSession()` does NOT query the `profiles` table. It reads from Supabase's internal session store (cookies/localStorage). This is fast and does not trigger RLS. The RLS hang only happens when you query `profiles` directly.

### 4.4 Login Flow

**Before (complex with fake timeouts):**
```typescript
// 1. setTimeout(10s) → race → signInUser() → if timeout throw "timed out"
// 2. setTimeout(10s) → race → getUserProfile() → if timeout throw "timed out"
// 3. All while isLoggingIn.current = true to skip onAuthStateChange
```

**After (simple):**
```typescript
async function login(email: string, password: string, requiredRole: UserRole) {
  // Step 1: Sign in — Supabase manages its own timeout
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  // Step 2: Fetch profile via RPC — SECURITY DEFINER, bypasses RLS, fast
  const profile = await authService.getProfileById(data.user.id);
  if (!profile) throw new Error('Profile not found. Contact administrator.');

  // Step 3: Validate role
  if (profile.role !== requiredRole) {
    await supabase.auth.signOut();
    throw new Error(`This account does not have ${requiredRole} privileges.`);
  }

  // Step 4: Set authenticated state
  setAuthState({ status: 'authenticated', user: profile });
}
```

**No artificial timeouts. No Promise.race. No background rehydration. No skip logic.**

### 4.5 Signup Flow

```typescript
async function signUp(email: string, password: string, username: string, role: UserRole) {
  // Step 1: Check if email already exists (RPC — fast)
  const { data: emailCheck } = await supabase.rpc('email_exists', { p_email: email });
  if (emailCheck?.[0]?.exists) {
    throw new Error('An account with this email already exists.');
  }

  // Step 2: Create auth user
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, role } }
  });
  if (error) throw new Error(error.message);

  // Step 3: The on_auth_user_created trigger auto-creates the profile.
  // We wait briefly and then fetch the profile to confirm.
  await new Promise(r => setTimeout(r, 500));
  const profile = await authService.getProfileById(data.user.id);
  if (!profile) throw new Error('Profile creation failed. Contact administrator.');

  // Step 4: Auto-login after signup
  setAuthState({ status: 'authenticated', user: profile });
}
```

### 4.6 Logout Flow

```typescript
async function logout() {
  // 1. Clear state immediately (UI responsive)
  setAuthState({ status: 'unauthenticated' });

  // 2. Terminate server session
  await supabase.auth.signOut();
}
```

**No non-blocking fire-and-forget. No keeping the user state while signing out.**

### 4.7 onAuthStateChange Handler

```typescript
supabase.auth.onAuthStateChange((event, session) => {
  switch (event) {
    case 'SIGNED_OUT':
      setAuthState({ status: 'unauthenticated' });
      break;
    case 'TOKEN_REFRESHED':
      // Session refreshed — if we were authenticated, re-fetch profile
      if (authState.status === 'authenticated') {
        authService.getProfileById(session!.user.id)
          .then(profile => {
            if (profile) setAuthState({ status: 'authenticated', user: profile });
            else setAuthState({ status: 'unauthenticated' });
          });
      }
      break;
    case 'INIT':
    case 'USER_DELETED':
    default:
      // For INIT, the initializeAuth() useEffect handles it.
      // For USER_DELETED, sign out.
      setAuthState({ status: 'unauthenticated' });
      break;
  }
});
```

---

## 5. Login Page Design

### 5.1 State

```typescript
interface LoginPageState {
  mode: 'login' | 'signup';
  role: UserRole.COMMANDANT | UserRole.COURSE_OFFICER;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  error: string | null;
  successMessage: string | null;
  validationErrors: Record<string, string>;
  isSubmitting: boolean;
}
```

### 5.2 Registration vs Login Decision

The `mode` is determined by `registrationStatus` — fetched once on page mount:

```
if (role === COMMANDANT) {
  mode = registrationStatus.canRegisterCommandant ? 'signup' : 'login';
} else {
  mode = registrationStatus.canRegisterOfficer ? 'signup' : 'login';
}
```

The user can always manually toggle to "login" even if signup is available.

### 5.3 Role Tab Switching

Switching roles:
1. Resets form fields (email, username, password, confirmPassword)
2. Clears error/success messages
3. Re-evaluates `mode` based on `registrationStatus` for the new role
4. Does NOT re-fetch `registrationStatus` (it's already loaded)

### 5.4 Form Validation

Before submit:
```
email: required, valid email format
username: required, 3-50 chars, alphanumeric + underscore only
password: required, minimum 8 characters
confirmPassword: required, must match password
```

### 5.5 Error Display

All errors are displayed inline below the relevant field OR as a dismissible banner at the top of the form. No `alert()` or `console.error` for user-facing errors.

### 5.6 Loading State

While submitting:
- Submit button shows spinner + "Please wait..."
- All form fields are disabled
- Role tabs are disabled

---

## 6. App Routing

### 6.1 Route Structure

```
/                          → Root redirect (see below)
/login                     → LoginPage (public)
/commandant/*              → Commandant routes (commandant only)
/officer/*                 → Officer routes (officer only)
```

### 6.2 Root Redirect Logic

At `/`, evaluate `authState.status`:

```
if 'initializing' → show full-screen spinner (no redirect)
if 'unauthenticated' → redirect to /login
if 'authenticated' AND user.role === commandant → redirect to /commandant
if 'authenticated' AND user.role === course_officer → redirect to /officer
```

### 6.3 Protected Route Component

```typescript
function ProtectedRoute({ allowedRoles }: { allowedRoles: UserRole[] }) {
  const { authState } = useAuth();

  if (authState.status === 'initializing') {
    return <FullScreenSpinner />;
  }

  if (authState.status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(authState.user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
```

### 6.4 Public Route Component (for /login)

```typescript
function PublicRoute() {
  const { authState } = useAuth();

  if (authState.status === 'initializing') {
    return <FullScreenSpinner />;
  }

  if (authState.status === 'authenticated') {
    // Already logged in — redirect to appropriate dashboard
    const destination = authState.user.role === UserRole.COMMANDANT
      ? '/commandant'
      : '/officer';
    return <Navigate to={destination} replace />;
  }

  return <Outlet />;
}
```

---

## 7. Implementation Plan

### Phase 1: Database (Day 1)

1. Create migration `20260326_auth_rebuild_phase1.sql`:
   - Add `email` unique constraint/index to `auth.users` preparation (do not modify Supabase tables)
   - Create `public.email_exists(p_email TEXT)` RPC
   - Create `public.upsert_profile(...)` RPC
   - Verify `on_auth_user_created` trigger is working correctly
   - Verify `get_profile_by_id` works for all auth user IDs
   - Verify `get_registration_counts` works
   - Verify `get_officers` works
   - Test all RPCs via Supabase SQL Editor

2. Test procedure:
   - Sign up a new officer in the app
   - Check that `profiles` table has a row with the correct `id`, `username`, `role`
   - Call `get_profile_by_id` with the new user's ID — should return the row
   - Call `get_registration_counts` — should show updated counts

### Phase 2: AuthContext (Day 1)

2. Create new `AuthContext.tsx`:
   - Replace state machine from `AuthState` type above
   - Remove all `localStorage` caching for auth decisions
   - Remove all `setTimeout` / `Promise.race` patterns
   - Remove `isLoggingIn` ref
   - Simplify `onAuthStateChange` handler
   - Keep lockout logic if needed (or move to separate hook)

3. Create `authService.ts`:
   - Wrapper functions that call Supabase RPCs
   - `getProfileById(userId)` → calls `get_profile_by_id`
   - `getRegistrationStatus()` → calls `get_registration_counts`
   - `getOfficers()` → calls `get_officers`
   - `emailExists(email)` → calls `email_exists`
   - `upsertProfile(profile)` → calls `upsert_profile`

### Phase 3: Login Page (Day 1)

4. Refactor `Login.tsx`:
   - Implement new state machine from section 5
   - Add proper form validation before submit
   - Show inline validation errors
   - Handle signup with email existence check
   - Simplify — remove `isForcedLogin` complexity

### Phase 4: Routing (Day 2)

5. Refactor `App.tsx`:
   - Use new `ProtectedRoute` and `PublicRoute` components
   - Simplify root redirect logic
   - Ensure no flash of wrong content during redirect

### Phase 5: Testing (Day 2)

6. Test all flows:
   - [ ] App load with no session → spinner → login page
   - [ ] App load with valid session → spinner → dashboard
   - [ ] App load with expired session → spinner → login page (with error message "Session expired")
   - [ ] Login with correct commandant credentials → dashboard
   - [ ] Login with correct officer credentials → dashboard
   - [ ] Login with wrong password → error message, no spinner hang
   - [ ] Login with non-existent email → error message
   - [ ] Login with commandant creds on officer tab → appropriate error
   - [ ] Signup new officer (when slots available) → auto-login
   - [ ] Signup new officer (when 5 officers exist) → error message
   - [ ] Signup commandant (when commandant exists) → error message
   - [ ] Logout → redirect to login
   - [ ] Session expiry while app is open → graceful sign-out
   - [ ] Token refresh while app is open → profile updated automatically

---

## 8. What to Delete

The following patterns/code should be removed entirely:

### From `AuthContext.tsx`
- ❌ `getCachedProfile()` function — delete entirely
- ❌ `localStorage.setItem('polac_user_profile', ...)` — delete entirely
- ❌ `localStorage.getItem('polac_user_profile', ...)` — delete entirely
- ❌ `Promise.race` with `setTimeout` — delete entirely
- ❌ `timedOut` variable and `setTimeout(10000)` login timer — delete entirely
- ❌ `isLoggingIn.current` ref — delete entirely
- ❌ `initializing` as a separate boolean state — replaced by `authState.status`
- ❌ `setCurrentUser()` as a separate function with localStorage — replaced by `setAuthState`
- ❌ `refreshRegistrationStatus()` being called in `finally` — moved to login page mount only

### From `dbService.ts`
- ❌ `getRegistrationStatus()` with `AbortController` — replace with RPC call
- ❌ `getOfficers()` with direct `from('profiles').select()` — replace with RPC call
- ❌ All references to `abortSignal` — delete

### From `Login.tsx`
- ❌ `isForcedLogin` state — simplify to just `mode: 'login' | 'signup'`
- ❌ Complex auto-login-on-signup logic that fails with email confirmation

---

## 9. Migration Strategy

### Option A: Big Bang (Recommended)

Replace all files at once and run all database migrations together. No backward compatibility layer needed since this is a greenfield rebuild of the auth system.

**Steps:**
1. Apply all database migrations
2. Deploy new `AuthContext.tsx`, `authService.ts`, `Login.tsx`, `App.tsx`
3. Test all flows

**Risk:** If a migration fails, the app is down for all users.

### Option B: Incremental

1. Apply database migrations first (they are additive — new RPC functions, existing tables unchanged)
2. Deploy new `authService.ts` (backend-facing, no UI changes)
3. Deploy new `AuthContext.tsx` (state machine change)
4. Deploy new `Login.tsx` and `App.tsx`

**Risk:** Mixed versions during rollout could cause unexpected behavior.

**Recommendation:** Option A. The database migrations only add new functions — they don't modify existing ones. The frontend can be tested locally first.

---

## 10. Metrics for Success

After deployment, the following should be true:

1. **No infinite spinners** — App initialization always completes in < 5 seconds, even on cold network
2. **No "timed out" errors** — The artificial 10s timeout error messages should never appear
3. **Clear error messages** — All auth errors surface with specific, actionable messages
4. **Registration counts accurate** — The login page always shows correct commandant/officer counts
5. **Session expiry handled** — If a session expires, the app redirects to login with a "Session expired" message
6. **No localStorage auth dependency** — Users can log out and log back in from a different device and get the same experience

---

## 11. Open Questions

1. **Email confirmation:** Does Supabase have email confirmation enabled? If yes, the signup flow needs to handle `email_confirmed: false` states. The current app shows a success message and switches to login mode — is this the desired behavior?

2. **Session TTL:** What is the Supabase session TTL? If it's very long (e.g., 30 days), session expiry may not be a real concern. If it's short (e.g., 1 hour), the token refresh handling in `onAuthStateChange` becomes more important.

3. **Service number vs username:** There is a `service_number` column on `profiles` that was added in rotation migrations but is not consistently used. The `User.serviceNumber` field in the frontend is populated from `username`. Should we standardize on `service_number` as the authoritative field?

4. **Lockout mechanism:** The current lockout (5 failed attempts → 60s lockout) is client-side only and can be bypassed by clearing localStorage. Do we want a server-side lockout? Or is client-side lockout acceptable for this application (internal tool, not high-security)?

5. **Officer limit:** The system currently caps at 5 officers (`officerCount < 5`). Is this a hard business rule? Should commandant be able to exceed 5 officers?

6. **Auditing:** Login/logout notifications are currently inserted by the client. Should these be server-side (database trigger on auth.users) instead of client-side inserts?

---

## 12. File Inventory

### Files to CREATE

| File | Purpose |
|---|---|
| `supabase/migrations/20260326_auth_rebuild_phase1.sql` | Database RPC functions and trigger verification |
| `src/services/authService.ts` | Auth-specific RPC wrappers |
| `src/hooks/useRegistrationStatus.ts` | Hook for login page |

### Files to REWRITE

| File | Purpose |
|---|---|
| `context/AuthContext.tsx` | Complete rewrite with new state machine |
| `components/Auth/Login.tsx` | Refactored with cleaner state and validation |
| `App.tsx` | Simplified routing with new protected/public route components |

### Files to MODIFY

| File | Changes |
|---|---|
| `services/dbService.ts` | Remove `getRegistrationStatus` and `getOfficers` (moved to `authService.ts`) |

### Files to DELETE

| File | Reason |
|---|---|
| `services/dbService.ts` functions: `getRegistrationStatus`, `getOfficers` | Moved to `authService.ts` |
| Any turbo-init related code | Replaced by simple state machine |

---

## Appendix A: Current vs Proposed State Comparison

### Current Auth State (AuthContext.tsx)

```
State Variables:
  currentUser: User | null (from localStorage cache)
  isLoading: boolean (login/signup in progress)
  initializing: boolean (app init spinner — true if no localStorage cache)
  failedAttempts: number
  lockoutUntil: number | null
  lockoutTime: number
  registrationStatus: { canRegisterCommandant, canRegisterOfficer, commandantCount, officerCount }

Initialization:
  1. Read localStorage cache → set currentUser (optimistic)
  2. Set initializing = !cachedProfile (show spinner if no cache)
  3. Promise.race(getSession() vs 7s timeout)
  4. getUserProfile() via RPC
  5. Update state if profile differs from cache
  6. ALWAYS set initializing = false in finally

Login:
  1. Promise.race(signInUser() vs 10s timeout) → throw if timeout
  2. Promise.race(getUserProfile() vs 10s timeout) → throw if timeout
  3. Role validation
  4. setCurrentUser() → writes to localStorage
```

### Proposed Auth State (AuthContext.tsx)

```
State Variables:
  authState: { status: 'initializing' } | { status: 'unauthenticated' } | { status: 'authenticated'; user: User }

Initialization:
  1. authState = { status: 'initializing' } — spinner shows
  2. getSession() — fast Supabase internal check
  3. If no session → authState = { status: 'unauthenticated' }
  4. If session → getProfileById() via RPC (fast, bypasses RLS)
  5. If profile found → authState = { status: 'authenticated', user: profile }
  6. If profile missing → authState = { status: 'unauthenticated' }

Login:
  1. signInUser() — Supabase manages timeout
  2. getProfileById() via RPC — fast, bypasses RLS
  3. Role validation
  4. setAuthState({ status: 'authenticated', user: profile })
```

---

## Appendix B: RPC Function Specifications

### `get_profile_by_id(p_user_id UUID)`

**Arguments:** `p_user_id UUID`

**Returns:** `TABLE(...)` matching `profiles` row

**Error handling:** Returns empty result set if user not found. Never throws.

**Grants:** `GRANT EXECUTE ON FUNCTION public.get_profile_by_id TO authenticated, anon;`

**SQL:**
```sql
CREATE OR REPLACE FUNCTION public.get_profile_by_id(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    username TEXT,
    role TEXT,
    full_name TEXT,
    course_name TEXT,
    year_group INTEGER,
    course_number INTEGER,
    total_cadets INTEGER,
    profile_image TEXT,
    service_number TEXT,
    assigned_course_number INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY SELECT * FROM public.profiles WHERE id = p_user_id;
END;
$$;
```

### `get_registration_counts()`

**Arguments:** none

**Returns:** `TABLE(commandant_count BIGINT, officer_count BIGINT)` — single row

**Error handling:** Returns `{0, 0}` if error. Never throws.

**Grants:** `GRANT EXECUTE ON FUNCTION public.get_registration_counts TO authenticated, anon;`

**SQL:**
```sql
CREATE OR REPLACE FUNCTION public.get_registration_counts()
RETURNS TABLE (commandant_count BIGINT, officer_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE role = 'commandant') AS commandant_count,
        COUNT(*) FILTER (WHERE role = 'course_officer') AS officer_count
    FROM public.profiles;
END;
$$;
```

### `get_officers()`

**Arguments:** none

**Returns:** `TABLE(...)` — all `course_officer` profiles, ordered by `full_name`

**Error handling:** Returns empty set if no officers. Never throws.

**Grants:** `GRANT EXECUTE ON FUNCTION public.get_officers TO authenticated, anon;`

**SQL:**
```sql
CREATE OR REPLACE FUNCTION public.get_officers()
RETURNS TABLE (
    id UUID,
    username TEXT,
    role TEXT,
    full_name TEXT,
    course_name TEXT,
    year_group INTEGER,
    course_number INTEGER,
    total_cadets INTEGER,
    profile_image TEXT,
    service_number TEXT,
    assigned_course_number INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.profiles
    WHERE role = 'course_officer'
    ORDER BY full_name ASC NULLS LAST;
END;
$$;
```

### `email_exists(p_email TEXT)`

**Arguments:** `p_email TEXT`

**Returns:** `TABLE(exists BOOLEAN)` — single row

**Error handling:** Returns `{false}` on error. Never throws.

**Grants:** `GRANT EXECUTE ON FUNCTION public.email_exists TO authenticated, anon;`

**SQL:**
```sql
CREATE OR REPLACE FUNCTION public.email_exists(p_email TEXT)
RETURNS TABLE (exists BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT EXISTS(
        SELECT 1 FROM auth.users WHERE email = p_email
    );
END;
$$;
```

### `upsert_profile(p_user_id UUID, p_username TEXT, p_role TEXT, p_full_name TEXT)`

**Arguments:**
- `p_user_id UUID` — matches `auth.users.id`
- `p_username TEXT`
- `p_role TEXT` — 'commandant' or 'course_officer'
- `p_full_name TEXT`

**Returns:** void

**Error handling:** Throws on database error. Should be wrapped in try/catch in calling code.

**Grants:** `GRANT EXECUTE ON FUNCTION public.upsert_profile TO authenticated;`

**SQL:**
```sql
CREATE OR REPLACE FUNCTION public.upsert_profile(
    p_user_id UUID,
    p_username TEXT,
    p_role TEXT,
    p_full_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (
        id, username, role, full_name, created_at, updated_at
    )
    VALUES (
        p_user_id, p_username, p_role, p_full_name, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name,
        updated_at = NOW();
END;
$$;
```

---

*End of PRD*
