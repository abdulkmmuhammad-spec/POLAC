CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    username TEXT,
    role TEXT NOT NULL DEFAULT 'course_officer',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
