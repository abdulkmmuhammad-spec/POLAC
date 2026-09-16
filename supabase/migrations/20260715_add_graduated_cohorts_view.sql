-- supabase/migrations/20260715_add_graduated_cohorts_view.sql

CREATE OR REPLACE VIEW public.graduated_cohorts_summary AS
SELECT 
    course_number, 
    COUNT(*) as cadet_count
FROM public.cadet_registry
WHERE status = 'GRADUATED'
GROUP BY course_number
ORDER BY course_number DESC;
