-- Migration: Fix cadet_registry status check constraint to support GRADUATED status
-- Description: Drops the restricted check constraint on cadet_registry status and recreates it to include 'GRADUATED'.

ALTER TABLE public.cadet_registry 
DROP CONSTRAINT IF EXISTS cadet_registry_status_check;

ALTER TABLE public.cadet_registry 
ADD CONSTRAINT cadet_registry_status_check 
CHECK (status IN ('ACTIVE', 'DISMISSED', 'GRADUATED'));

NOTIFY pgrst, 'reload schema';
