-- Migration: Optimize Graduated Cohort Lookup and Parade View queries
-- Description: Adds a partial index on status lookup and provides an optimized INNER JOIN view for parade summaries.

CREATE INDEX IF NOT EXISTS idx_cadet_registry_graduated_lookup 
ON public.cadet_registry(course_number, name) 
WHERE status = 'GRADUATED';

CREATE OR REPLACE VIEW public.graduated_parade_summaries AS
SELECT 
    pr.id,
    pr.officer_name,
    pr.course_name,
    pr.course_number,
    pr.date,
    pr.parade_type,
    pr.grand_total,
    pr.present_count,
    pr.absent_count,
    pr.sick_count,
    pr.detention_count
FROM public.parade_records pr
INNER JOIN (
    SELECT DISTINCT course_number 
    FROM public.cadet_registry 
    WHERE status = 'GRADUATED'
) gc ON pr.course_number = gc.course_number;

NOTIFY pgrst, 'reload schema';
