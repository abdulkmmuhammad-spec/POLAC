# Pure Hashing Authentication & Onboarding PRD

## 1. Executive Summary
This document outlines the end-to-end architecture, user journey, and technical implementation of the "Pure Hashing" authentication system for the Nigeria Police Academy (NPA) Parade Management Portal. This system replaces managed third-party authentication (Supabase GoTrue) with an ultra-lean, high-performance database-driven hashing model. 

The Login/Signup page is the primary gateway to the application, enforcing strict access controls, rate limiting, and capacity constraints (e.g., maximum 1 Commandant, 5 Course Officers) before granting access to the internal dashboards.

---

## 2. The User Journey (First Touchpoint)

When any user navigates to the portal, the application routes them to the `/login` page (`Login.tsx`). The page is designed with a premium, restricted-access aesthetic.

1.  **Initial Load & Registration Check:**
    *   As the page loads, `useRegistrationStatus.ts` fires a request to the database to count existing Commandant and Course Officer roles.
    *   **If 0 Commandants exist:** The system automatically defaults to "Sign Up" mode for the Commandant tab, prompting the first user to claim the owner access.
    *   **If 5 Course Officers exist:** The system disables the "Sign Up" mode for Course Officers, showing a unit capacity reached message.
2.  **User Input:**
    *   The user selects their role (Commandant vs. Course Officer).
    *   They are presented with either a **Login Form** (Email, Password) or a **Signup Form** (Email, Username, Password, Confirm Password).
3.  **Client-Side Validation:**
    *   The application validates the email format and enforces an 8-character minimum password length.
4.  **Submission & Hashing (Signup) / Verification (Login):**
    *   The form submits data to `AuthContext.tsx`.
    *   If **Signup**, the password is encrypted using `bcrypt.hash()` with 10 salt rounds before being sent to the database.
    *   If **Login**, the form fetches the stored hash from the DB and uses `bcrypt.compare()` to verify the entered password.
5.  **Access Granted:**
    *   A JSON session object is stored in the browser's `localStorage` (`polac_user_session`).
    *   The application redirects the Commandant to `/commandant` or the Officer to `/officer`.

---

## 3. Security, Validation & Rate Limiting

*   **Hashing Engine:** Uses `bcryptjs` with 10 salt rounds. Plain-text passwords never leave `AuthContext.tsx` and are immediately discarded.
*   **Password Complexity:** Enforced 8-character minimum limit prior to hashing to prevent weak encryption states.
*   **Brute Force Protection (Lockout):** The `AuthContext` tracks consecutive failed login attempts. If a user fails 5 times, local state and `localStorage` enforce a strict 60-second lockout timer where the submit button is disabled. 
*   **Data Masking:** Failed logins do not disclose whether the email or the password was incorrect. It universally returns "Invalid email or password."
*   **Disabled RLS:** The `users` table uses Application-Level Security rather than PostgreSQL Row Level Security (RLS) to maximize speed and bypass recursion/deadlock loops.

---

## 4. Communication with the Database

The frontend communicates with a unified `public.users` table in PostgreSQL. All requests bypass RPCs and use direct `supabase.from('users')` queries via the `authService.ts`.

### Database Schema (SQL Migration)
```sql
-- 1. Enable the cryptographic extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create the unified users table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    username TEXT,
    role TEXT NOT NULL DEFAULT 'course_officer',
    full_name TEXT DEFAULT '',
    course_name TEXT DEFAULT '',
    year_group INTEGER DEFAULT 0,
    course_number INTEGER DEFAULT 0,
    total_cadets INTEGER DEFAULT 0,
    profile_image TEXT DEFAULT '',
    service_number TEXT DEFAULT '',
    assigned_course_number INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

-- 3. Disable Row Level Security (application-level security only)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 4. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
```

---

## 5. Complete Codebase Implementation

Below is the exhaustive, line-by-line implementation of the Auth System.

### A. The User Interface (`components/Auth/Login.tsx`)
This component handles role switching, dynamic forms, validation, and layout.

```tsx
import React, { useState, useEffect } from 'react';
import { RefreshCcw, ShieldCheck, UserPlus } from 'lucide-react';
import { UserRole } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useRegistrationStatus } from '../../hooks/useRegistrationStatus';

export const Login: React.FC = () => {
    const { login, signUp, isLoading, lockoutTime } = useAuth();
    const { status: regStatus, isLoading: regLoading, error: regError } = useRegistrationStatus();

    const [loginRole, setLoginRole] = useState<UserRole>(UserRole.COMMANDANT);
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Determine if signup is available for the selected role
    const canRegister = loginRole === UserRole.COMMANDANT
        ? regStatus.canRegisterCommandant
        : regStatus.canRegisterOfficer;

    // Update mode when regStatus loads or role changes
    useEffect(() => {
        if (regLoading) return;
        if (mode === 'login') return;
        // Auto-switch to login if registration no longer available for this role
        if (!canRegister && mode === 'signup') {
            setMode('login');
        }
    }, [regStatus, regLoading, canRegister, mode]);

    const isRegistering = mode === 'signup';

    const handleRoleSwitch = (role: UserRole) => {
        setLoginRole(role);
        setError(null);
        setSuccessMessage(null);
        setValidationErrors({});
        // When switching role, re-evaluate mode based on availability
        if (role === UserRole.COMMANDANT) {
            setMode(regStatus.canRegisterCommandant ? 'signup' : 'login');
        } else {
            setMode(regStatus.canRegisterOfficer ? 'signup' : 'login');
        }
    };

    const toggleMode = () => {
        setMode(m => m === 'login' ? 'signup' : 'login');
        setError(null);
        setSuccessMessage(null);
        setValidationErrors({});
    };

    const validate = (): boolean => {
        const errors: Record<string, string> = {};

        if (!email || !email.includes('@') || email.length < 5) {
            errors.email = 'Please enter a valid email address.';
        }

        if (isRegistering) {
            if (!username.trim() || username.trim().length < 3) {
                errors.username = 'Username must be at least 3 characters.';
            }
            if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
                errors.username = 'Username can only contain letters, numbers, and underscores.';
            }
            if (password.length < 8) {
                errors.password = 'Password must be at least 8 characters.';
            }
            if (confirmPassword !== password) {
                errors.confirmPassword = 'Passwords do not match.';
            }
        } else {
            if (password.length < 1) {
                errors.password = 'Password is required.';
            }
        }

        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        setValidationErrors({});

        if (lockoutTime > 0) return;
        if (!validate()) return;

        setIsSubmitting(true);

        try {
            if (isRegistering) {
                await signUp(email, password, username.trim(), loginRole);
            } else {
                await login(email, password, loginRole);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Authentication failed.';
            setError(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isCommandant = loginRole === UserRole.COMMANDANT;
    const themeColor = isCommandant ? 'blue-900' : 'slate-800';
    const themeText = isCommandant ? 'text-blue-600' : 'text-slate-700';
    const themeBorder = isCommandant ? 'border-blue-600' : 'border-slate-700';
    const themeHover = isCommandant ? 'bg-blue-900 hover:bg-blue-800' : 'bg-slate-800 hover:bg-slate-700';
    const spinColor = isCommandant ? 'text-blue-500' : 'text-slate-500';

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-900 relative overflow-hidden">
            <img
                src="/background.jpg"
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-30 blur-sm scale-105"
            />

            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative z-10">
                <div className={`bg-${themeColor} p-8 text-center text-white`}>
                    <div className="w-24 h-24 bg-white rounded-full mx-auto mb-4 flex items-center justify-center shadow-xl overflow-hidden border-4 border-white/20">
                        <img src="/logo.png" alt="NPA Logo" className="w-[90%] h-[90%] object-contain block mx-auto" />
                    </div>
                    <h1 className="text-2xl font-bold">Nigeria Police Academy</h1>
                    <div className="flex justify-center mt-2">
                        <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border-2 ${
                            isCommandant ? 'bg-blue-800 border-blue-400 text-blue-100' : 'bg-slate-700 border-slate-500 text-slate-100'
                        }`}>
                            {isCommandant ? 'Commandant Portal' : 'Course Officer Portal'}
                        </span>
                    </div>
                </div>

                <div className="flex border-b">
                    <button
                        type="button"
                        onClick={() => handleRoleSwitch(UserRole.COMMANDANT)}
                        className={`flex-1 py-4 text-sm font-semibold transition-colors ${isCommandant ? `${themeText} border-b-2 ${themeBorder}` : 'text-slate-400'}`}
                    >
                        Commandant
                    </button>
                    <button
                        type="button"
                        onClick={() => handleRoleSwitch(UserRole.COURSE_OFFICER)}
                        className={`flex-1 py-4 text-sm font-semibold transition-colors ${!isCommandant ? `${themeText} border-b-2 ${themeBorder}` : 'text-slate-400'}`}
                    >
                        Course Officer
                    </button>
                </div>

                {regLoading && (
                    <div className="px-8 pt-4">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            <RefreshCcw className={`w-3 h-3 animate-spin ${spinColor}`} />
                            <span>Checking access...</span>
                        </div>
                    </div>
                )}

                {!regLoading && canRegister && mode === 'login' && (
                    <div className="mx-8 mt-4 p-3 bg-blue-50 text-blue-700 rounded-xl text-xs border border-blue-200 text-center">
                        No commandant account detected. You can sign up for a new account below.
                    </div>
                )}

                {!regLoading && !canRegister && !isRegistering && (
                    <div className="mx-8 mt-4 p-3 bg-slate-50 text-slate-600 rounded-xl text-xs border border-slate-200 text-center">
                        Unit Capacity: {regStatus.officerCount}/5 Allocated — Login to access your account.
                    </div>
                )}

                <form onSubmit={handleSubmit} className="p-8 space-y-5">
                    <div className="text-center mb-2">
                        <h2 className={`text-xl font-black uppercase tracking-tighter ${isCommandant ? 'text-blue-900' : 'text-slate-800'}`}>
                            {isRegistering ? 'Initialize Account' : 'Secure Authorization'}
                        </h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
                            {isCommandant
                                ? (isRegistering ? 'First-Time Commandant Setup' : 'Restricted Commandant Access')
                                : (isRegistering ? 'New Officer Registration' : `Unit Capacity: ${regStatus.officerCount}/5`)}
                        </p>
                    </div>

                    {error && (
                        <div className="p-4 bg-rose-50 text-rose-600 rounded-xl text-sm font-medium border border-rose-100">
                            {error}
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Official Email</label>
                        <input
                            type="email"
                            required
                            disabled={isSubmitting}
                            className={`w-full px-4 py-3 rounded-xl border ${validationErrors.email ? 'border-rose-500' : 'border-slate-200'} ${isSubmitting ? 'bg-slate-100 cursor-not-allowed' : ''} focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all`}
                            placeholder="e.g. name@polac.gov.ng"
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); if (validationErrors.email) setValidationErrors(p => ({ ...p, email: undefined })); }}
                        />
                        {validationErrors.email && <p className="text-[10px] text-rose-500 font-bold ml-1 uppercase">{validationErrors.email}</p>}
                    </div>

                    {isRegistering && (
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-slate-700">Display Username</label>
                            <input
                                type="text"
                                required
                                disabled={isSubmitting}
                                className={`w-full px-4 py-3 rounded-xl border ${validationErrors.username ? 'border-rose-500' : 'border-slate-200'} ${isSubmitting ? 'bg-slate-100 cursor-not-allowed' : ''} focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all`}
                                placeholder={isCommandant ? 'e.g. commandant' : 'e.g. officer1'}
                                value={username}
                                onChange={(e) => { setUsername(e.target.value); if (validationErrors.username) setValidationErrors(p => ({ ...p, username: undefined })); }}
                            />
                            {validationErrors.username && <p className="text-[10px] text-rose-500 font-bold ml-1 uppercase">{validationErrors.username}</p>}
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Secure Password</label>
                        <input
                            type="password"
                            required
                            disabled={isSubmitting}
                            className={`w-full px-4 py-3 rounded-xl border ${validationErrors.password ? 'border-rose-500' : 'border-slate-200'} ${isSubmitting ? 'bg-slate-100 cursor-not-allowed' : ''} focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all`}
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); if (validationErrors.password) setValidationErrors(p => ({ ...p, password: undefined })); }}
                        />
                        {validationErrors.password && <p className="text-[10px] text-rose-500 font-bold ml-1 uppercase">{validationErrors.password}</p>}
                    </div>

                    {isRegistering && (
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-slate-700">Confirm Password</label>
                            <input
                                type="password"
                                required
                                disabled={isSubmitting}
                                className={`w-full px-4 py-3 rounded-xl border ${validationErrors.confirmPassword ? 'border-rose-500' : 'border-slate-200'} ${isSubmitting ? 'bg-slate-100 cursor-not-allowed' : ''} focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all`}
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => { setConfirmPassword(e.target.value); if (validationErrors.confirmPassword) setValidationErrors(p => ({ ...p, confirmPassword: undefined })); }}
                            />
                            {validationErrors.confirmPassword && <p className="text-[10px] text-rose-500 font-bold ml-1 uppercase">{validationErrors.confirmPassword}</p>}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isSubmitting || lockoutTime > 0 || regLoading}
                        className={`w-full ${lockoutTime > 0 ? 'bg-slate-400 cursor-not-allowed' : themeHover} text-white font-bold py-4 rounded-xl shadow-lg transition-all transform hover:scale-[1.01] flex items-center justify-center gap-2 disabled:transform-none`}
                    >
                        {isSubmitting ? (
                            <RefreshCcw className={`animate-spin ${spinColor}`} />
                        ) : lockoutTime > 0 ? (
                            <span>Locked ({lockoutTime}s)</span>
                        ) : (
                            <>
                                {isRegistering ? <UserPlus size={18} /> : <ShieldCheck size={18} />}
                                <span>{isRegistering ? 'Create Command Profile' : 'Grant Access'}</span>
                            </>
                        )}
                    </button>

                    {canRegister && (
                        <button
                            type="button"
                            onClick={toggleMode}
                            disabled={isSubmitting}
                            className="w-full text-center text-xs font-bold uppercase tracking-tighter text-blue-600 hover:text-blue-800 underline disabled:text-slate-400 disabled:no-underline"
                        >
                            {isRegistering ? 'Already have an account? Login' : 'Need to sign up? Create Account'}
                        </button>
                    )}

                    <p className="text-center text-xs text-slate-400">
                        Restricted Access • {isRegistering ? 'Registration Phase' : 'Secure Hashed Authentication'}
                    </p>
                </form>
            </div>
        </div>
    );
};
```

### B. The State Engine & Encryptor (`context/AuthContext.tsx`)
Handles the heavy lifting: `bcrypt` usage, locking, and syncing with `localStorage`.

```tsx
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import bcrypt from 'bcryptjs';
import { User, UserRole } from '../types';
import { authService } from '../services/authService';
import { dbService } from '../services/dbService';

const SESSION_KEY = 'polac_user_session';
const LOCKOUT_KEY = 'polac_lockout_until';
const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_SALT_ROUNDS = 10;

type AuthState =
  | { status: 'initializing' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: User };

interface AuthContextType {
  authState: AuthState;
  currentUser: User | null;
  isLoading: boolean;
  lockoutTime: number;
  lockoutUntil: number | null;
  failedAttempts: number;
  login: (email: string, password: string, requiredRole: UserRole) => Promise<void>;
  signUp: (email: string, password: string, username: string, role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  setCurrentUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({ status: 'initializing' });
  const currentUser = authState.status === 'authenticated' ? authState.user : null;
  const isLoading = authState.status === 'initializing';
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutTime, setLockoutTime] = useState(0);

  const setCurrentUser = useCallback((user: User | null) => {
    if (user) {
      setAuthState({ status: 'authenticated', user });
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } else {
      setAuthState({ status: 'unauthenticated' });
      localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (lockoutUntil) {
      interval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
        setLockoutTime(remaining);
        if (remaining === 0) {
          setLockoutUntil(null);
          setFailedAttempts(0);
          localStorage.removeItem(LOCKOUT_KEY);
        }
      }, 1000);
    } else {
      setLockoutTime(0);
    }
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  useEffect(() => {
    let isMounted = true;
    const storedLockout = localStorage.getItem(LOCKOUT_KEY);
    if (storedLockout) {
      const until = parseInt(storedLockout, 10);
      if (until > Date.now()) setLockoutUntil(until);
    }

    const initializeAuth = async () => {
      try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (!stored) {
          if (isMounted) setAuthState({ status: 'unauthenticated' });
          return;
        }

        const storedUser: User = JSON.parse(stored);
        const profile = await authService.getProfileById(String(storedUser.id));

        if (isMounted) {
          if (profile) {
            setAuthState({ status: 'authenticated', user: profile });
            localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
          } else {
            console.warn('[Auth] Stored session invalid. Clearing.');
            localStorage.removeItem(SESSION_KEY);
            setAuthState({ status: 'unauthenticated' });
          }
        }
      } catch (err) {
        if (isMounted) setAuthState({ status: 'unauthenticated' });
      }
    };

    const timeoutId = setTimeout(() => {
      if (isMounted) {
        setAuthState(prev => {
          if (prev.status === 'initializing') return { status: 'unauthenticated' };
          return prev;
        });
      }
    }, 8000);

    initializeAuth().finally(() => clearTimeout(timeoutId));
    return () => { isMounted = false; };
  }, []);

  const login = useCallback(async (email: string, password: string, requiredRole: UserRole) => {
    if (lockoutUntil && Date.now() < lockoutUntil) {
      throw new Error(`Too many failed attempts. Try again in ${lockoutTime} seconds.`);
    }

    const result = await authService.getProfileByEmail(email);

    if (!result) {
      handleFailedAttempt();
      throw new Error('Invalid email or password.');
    }

    const validPassword = await bcrypt.compare(password, result.passwordHash);

    if (!validPassword) {
      handleFailedAttempt();
      throw new Error('Invalid email or password.');
    }

    if (result.user.role !== requiredRole) {
      handleFailedAttempt();
      throw new Error(`This account does not have privileges.`);
    }

    handleSuccess();
    setAuthState({ status: 'authenticated', user: result.user });
    localStorage.setItem(SESSION_KEY, JSON.stringify(result.user));
    
    authService.updateLastLogin(String(result.user.id)).catch(console.error);
    
    dbService.addNotification({
      type: 'login',
      title: 'User Logged In',
      content: `${result.user.fullName || result.user.username} logged in successfully`,
      timestamp: new Date().toISOString(),
      read: false,
      officerName: result.user.fullName || result.user.username,
      yearGroup: result.user.yearGroup || 1,
      courseNumber: result.user.courseNumber,
    }).catch(console.error);
  }, [lockoutUntil, lockoutTime]);

  const signUp = useCallback(async (email: string, password: string, username: string, role: UserRole) => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
    }

    const exists = await authService.emailExists(email);
    if (exists) {
      throw new Error('An account with this email already exists. Try logging in instead.');
    }

    const roleString = role === UserRole.COMMANDANT ? 'commandant' : 'course_officer';
    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    const hash = await bcrypt.hash(password, salt);

    const newUser = await authService.createUser(email, hash, username.trim(), roleString);

    setAuthState({ status: 'authenticated', user: newUser });
    localStorage.setItem(SESSION_KEY, JSON.stringify(newUser));
  }, []);

  const logout = useCallback(async () => {
    setAuthState({ status: 'unauthenticated' });
    localStorage.removeItem(SESSION_KEY);
  }, [currentUser]);

  const handleFailedAttempt = () => {
    const newCount = failedAttempts + 1;
    setFailedAttempts(newCount);
    if (newCount >= 5) {
      const until = Date.now() + 60000;
      setLockoutUntil(until);
      localStorage.setItem(LOCKOUT_KEY, until.toString());
    }
  };

  const handleSuccess = () => {
    setFailedAttempts(0);
    setLockoutUntil(null);
    localStorage.removeItem(LOCKOUT_KEY);
  };

  return (
    <AuthContext.Provider value={{
      authState, currentUser, isLoading, lockoutTime, lockoutUntil, failedAttempts, login, signUp, logout, setCurrentUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};
```

### C. The Database Communication Layer (`services/authService.ts`)
Directly manipulates the `users` table via standard Supabase PostgREST queries.

```typescript
import { supabase } from './dbService';
import { User, UserRole } from '../types';

function mapRowToUser(d: any): User {
  return {
    id: d.id,
    username: d.username ?? '',
    role: d.role as UserRole,
    fullName: d.full_name ?? '',
    courseName: d.course_name ?? '',
    yearGroup: d.year_group ?? 0,
    courseNumber: d.course_number ?? 0,
    totalCadets: d.total_cadets ?? 0,
    profileImage: d.profile_image ?? '',
    serviceNumber: d.service_number ?? d.username ?? '',
    assignedCourseNumber: d.assigned_course_number ?? null,
  };
}

export const authService = {
  getProfileById: async (userId: string): Promise<User | null> => {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if (error || !data) return null;
    return mapRowToUser(data);
  },

  getProfileByEmail: async (email: string): Promise<{ user: User; passwordHash: string } | null> => {
    const { data, error } = await supabase.from('users').select('*').eq('email', email.toLowerCase().trim()).single();
    if (error || !data) return null;
    return { user: mapRowToUser(data), passwordHash: data.password_hash };
  },

  getRegistrationCounts: async () => {
    const { data, error } = await supabase.from('users').select('role');
    const rows = data || [];
    return {
      commandant_count: rows.filter((r: any) => r.role === 'commandant').length,
      officer_count: rows.filter((r: any) => r.role === 'course_officer').length,
    };
  },

  emailExists: async (email: string): Promise<boolean> => {
    const { count } = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('email', email.toLowerCase().trim());
    return (count ?? 0) > 0;
  },

  createUser: async (email: string, passwordHash: string, username: string, role: string): Promise<User> => {
    const { data, error } = await supabase.from('users').insert({
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      username,
      role,
      full_name: username,
      service_number: username,
    }).select().single();

    if (error) throw new Error(error.message);
    return mapRowToUser(data);
  },

  updateLastLogin: async (userId: string): Promise<void> => {
    await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', userId);
  },
};
```
