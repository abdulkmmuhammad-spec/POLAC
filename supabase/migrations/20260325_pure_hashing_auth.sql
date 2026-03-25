-- ============================================================
-- Pure Hashing Auth Migration
-- Simplified single-table authentication with bcrypt hashing
-- ============================================================

-- 1. Enable the cryptographic extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create the unified users table (replaces profiles + auth.users split)
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

-- 4. Index for fast email lookups during login
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- 5. Index for role-based queries (registration counts, officer lists)
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
