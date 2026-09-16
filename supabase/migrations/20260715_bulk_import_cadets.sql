CREATE OR REPLACE FUNCTION bulk_import_cadets(
    p_admin_id UUID,
    p_cadet_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE
        v_inserted_count INTEGER;
    BEGIN
        -- 1. Suppress the row-level audit trigger for this specific transaction
        PERFORM set_config('app.suppress_audit', 'true', true);
        
        -- 2. Unpack the JSONB payload and execute a native bulk insert
        INSERT INTO public.cadet_registry (
            name, squad, course_number, year_group, status, created_at
        )
        SELECT 
            rec->>'name',
            rec->>'squad',
            (rec->>'course_number')::INTEGER,
            (rec->>'year_group')::INTEGER,
            COALESCE(rec->>'status', 'ACTIVE'),
            NOW()
        FROM jsonb_array_elements(p_cadet_data) AS rec;
        
        GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
        
        -- 3. Write exactly ONE consolidated audit log for the entire batch
        INSERT INTO public.audit_events (action_type, actor_id, payload, created_at)
        VALUES (
            'BULK_CADET_IMPORT',
            p_admin_id,
            jsonb_build_object(
                'records_imported', v_inserted_count,
                'upload_method', 'EXCEL_INGRESS'
            ),
            NOW()
        );
        
        -- Return success metric
        RETURN jsonb_build_object(
            'success', TRUE,
            'inserted_count', v_inserted_count
        );
    EXCEPTION WHEN OTHERS THEN
        -- Ensure full rollback if the JSON mapping or insertion fails
        RAISE EXCEPTION 'Bulk import transaction failed: %', SQLERRM;
    END;
$$;
