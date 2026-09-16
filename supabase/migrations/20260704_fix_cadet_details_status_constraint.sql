-- Migration: Fix cadet_details status check constraint to support pass, suspension, and yet_to_report
-- Description: Drops the restricted check constraint and recreates it with all valid CadetStatus values.

ALTER TABLE public.cadet_details 
DROP CONSTRAINT IF EXISTS cadet_details_status_check;

ALTER TABLE public.cadet_details 
ADD CONSTRAINT cadet_details_status_check 
CHECK (status IN ('present', 'absent', 'sick', 'detention', 'pass', 'suspension', 'yet_to_report'));

NOTIFY pgrst, 'reload schema';
