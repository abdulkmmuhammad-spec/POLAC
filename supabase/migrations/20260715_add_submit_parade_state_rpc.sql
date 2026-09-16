-- supabase/migrations/20260715_add_submit_parade_state_rpc.sql

CREATE OR REPLACE FUNCTION public.submit_parade_state(
    p_officer_id UUID,
    p_officer_name TEXT,
    p_course_name TEXT,
    p_year_group INTEGER,
    p_course_number TEXT,
    p_date DATE,
    p_parade_type TEXT,
    p_present_count INTEGER,
    p_absent_count INTEGER,
    p_sick_count INTEGER,
    p_detention_count INTEGER,
    p_pass_count INTEGER,
    p_suspension_count INTEGER,
    p_yet_to_report_count INTEGER,
    p_grand_total INTEGER,
    p_cadet_records JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_parade_id UUID;
    v_inserted_count INTEGER;
BEGIN
    -- 1. Insert the parent parade record and capture the generated UUID
    INSERT INTO public.parade_records (
        officer_id, officer_name, course_name, year_group, course_number,
        date, parade_type, present_count, absent_count, sick_count, detention_count,
        pass_count, suspension_count, yet_to_report_count, grand_total, created_at
    ) VALUES (
        p_officer_id, p_officer_name, p_course_name, p_year_group, p_course_number,
        p_date, p_parade_type, p_present_count, p_absent_count, p_sick_count, p_detention_count,
        p_pass_count, p_suspension_count, p_yet_to_report_count, p_grand_total, NOW()
    )
    RETURNING id INTO v_parade_id;

    -- 2. Unpack the JSONB array and write all child records atomically
    IF jsonb_array_length(p_cadet_records) > 0 THEN
        INSERT INTO public.cadet_details (record_id, name, squad, status)
        SELECT 
            v_parade_id,
            rec->>'name',
            rec->>'squad',
            rec->>'status'
        FROM jsonb_array_elements(p_cadet_records) AS rec;
        
        GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    ELSE
        v_inserted_count := 0;
    END IF;

    -- 3. Return a unified success state payload
    RETURN jsonb_build_object(
        'success', true,
        'parade_id', v_parade_id,
        'records_written', v_inserted_count
    );

EXCEPTION WHEN OTHERS THEN
    -- Any failure inside this block forces a clean rollback of all modifications
    RAISE EXCEPTION 'Parade state submission failed: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_parade_state(UUID, TEXT, TEXT, INTEGER, TEXT, DATE, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, JSONB) TO authenticated, anon;
