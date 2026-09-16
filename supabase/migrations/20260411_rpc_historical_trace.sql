-- ============================================================
-- FILE: 20260411_rpc_historical_trace.sql
-- DATE: 2026-04-11
-- PURPOSE: Create RPC for high-performance historical data querying
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_historical_trace(
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_course_number INTEGER DEFAULT NULL,
    p_status TEXT DEFAULT 'all',
    p_search_term TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', cd.id,
            'name', cd.name,
            'squad', cd.squad,
            'status', cd.status,
            'r', jsonb_build_object(
                'id', pr.id,
                'date', pr.date,
                'paradeType', pr.parade_type,
                'yearGroup', pr.year_group,
                'courseNumber', pr.course_number::integer,
                'officerName', pr.officer_name,
                'officerId', pr.officer_id,
                'presentCount', pr.present_count,
                'absentCount', pr.absent_count,
                'sickCount', pr.sick_count,
                'detentionCount', pr.detention_count,
                'grandTotal', pr.grand_total,
                'createdAt', pr.created_at
            )
        )
    )
    INTO v_result
    FROM cadet_details cd
    JOIN parade_records pr ON cd.record_id = pr.id
    WHERE 
        (p_start_date IS NULL OR pr.date >= p_start_date)
        AND (p_end_date IS NULL OR pr.date <= p_end_date)
        AND (p_course_number IS NULL OR pr.course_number::integer = p_course_number)
        AND (p_status = 'all' OR LOWER(cd.status) = LOWER(p_status))
        AND (
            p_search_term IS NULL 
            OR p_search_term = '' 
            OR cd.name ILIKE '%' || p_search_term || '%' 
            OR cd.squad ILIKE '%' || p_search_term || '%'
        );

    -- Return empty JSON array if no records matched to avoid returning null
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
