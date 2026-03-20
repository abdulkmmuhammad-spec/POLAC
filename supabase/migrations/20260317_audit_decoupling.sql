-- Migration: audit_decoupling
-- Description: Creates forensic audit_events table and associated policies.

-- 1. Create audit_events table
CREATE TABLE IF NOT EXISTS public.audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name TEXT NOT NULL,
    action_type TEXT NOT NULL,
    target_id TEXT, -- e.g. Cadet ID, Record ID
    payload JSONB, -- Stores Before/After diffs
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Audit Trail Hardening: RLS Policies
-- Only Commandant (admins) can read audit logs. Nobody can update or delete.
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all audit logs" 
ON public.audit_events 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'commandant'
    )
);

CREATE POLICY "System can insert audit logs" 
ON public.audit_events 
FOR INSERT 
WITH CHECK (true); -- Usually restricted to service role in prod, but simplified for app logic

-- Note: No UPDATE or DELETE policies means they are forbidden by default.
