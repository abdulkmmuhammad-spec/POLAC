-- Migration: Support Dual-Format Cadet Enrollment (New NPA 2-Column Template & Legacy 3-Column Template)
-- Description: Adds npa_number and admission_year columns to cadet_registry, ensures uniqueness and indexes,
-- and upgrades bulk_import_cadets RPC to safely upsert NPA-identified cadets and insert legacy cadets.

-- 1. Add columns to cadet_registry
ALTER TABLE public.cadet_registry 
ADD COLUMN IF NOT EXISTS npa_number TEXT,
ADD COLUMN IF NOT EXISTS admission_year INTEGER;

-- 2. Add Unique Constraint on npa_number
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'cadet_registry_npa_number_key'
    ) THEN 
        ALTER TABLE public.cadet_registry ADD CONSTRAINT cadet_registry_npa_number_key UNIQUE (npa_number);
    END IF; 
END $$;

-- 3. Create Index on admission_year and npa_number for fast query lookups
CREATE INDEX IF NOT EXISTS idx_cadet_registry_npa_number ON public.cadet_registry (npa_number);
CREATE INDEX IF NOT EXISTS idx_cadet_registry_admission_year ON public.cadet_registry (admission_year);

-- 4. Upgrade bulk_import_cadets RPC to support both formats with conflict-free upsert
CREATE OR REPLACE FUNCTION bulk_import_cadets(
    p_admin_id UUID,
    p_cadet_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE
        v_inserted_count INTEGER := 0;
    BEGIN
        -- 1. Suppress the row-level audit trigger for this specific transaction
        PERFORM set_config('app.suppress_audit', 'true', true);
        
        -- 2. Unpack the JSONB payload and execute atomic upsert/insert with intra-batch deduplication
        WITH raw_payload AS (
            SELECT 
                rec->>'name' AS name,
                rec->>'squad' AS squad,
                (rec->>'course_number')::INTEGER AS course_number,
                (rec->>'year_group')::INTEGER AS year_group,
                COALESCE(rec->>'status', 'ACTIVE') AS status,
                NULLIF(TRIM(rec->>'npa_number'), '') AS npa_number,
                (NULLIF(TRIM(rec->>'admission_year'), ''))::INTEGER AS admission_year,
                NOW() AS created_at,
                row_number() OVER () AS ordinal
            FROM jsonb_array_elements(p_cadet_data) AS rec
        ),
        deduped_npa AS (
            -- Guarantee no intra-batch duplicate constrained values (keep latest occurrence)
            SELECT DISTINCT ON (UPPER(npa_number))
                name, squad, course_number, year_group, status, UPPER(npa_number) AS npa_number, admission_year, created_at
            FROM raw_payload
            WHERE npa_number IS NOT NULL
            ORDER BY UPPER(npa_number), ordinal DESC
        ),
        upserted_npa AS (
            INSERT INTO public.cadet_registry (
                name, squad, course_number, year_group, status, npa_number, admission_year, created_at
            )
            SELECT name, squad, course_number, year_group, status, npa_number, admission_year, created_at
            FROM deduped_npa
            ON CONFLICT (npa_number) DO UPDATE SET
                name = EXCLUDED.name,
                squad = EXCLUDED.squad,
                course_number = EXCLUDED.course_number,
                year_group = EXCLUDED.year_group,
                admission_year = COALESCE(EXCLUDED.admission_year, public.cadet_registry.admission_year),
                status = EXCLUDED.status
            RETURNING id
        ),
        inserted_legacy AS (
            INSERT INTO public.cadet_registry (
                name, squad, course_number, year_group, status, npa_number, admission_year, created_at
            )
            SELECT name, squad, course_number, year_group, status, npa_number, admission_year, created_at
            FROM raw_payload
            WHERE npa_number IS NULL
            RETURNING id
        )
        SELECT (
            (SELECT COUNT(*) FROM upserted_npa) + 
            (SELECT COUNT(*) FROM inserted_legacy)
        )::INTEGER INTO v_inserted_count;
        
        -- 3. Write exactly ONE consolidated audit log for the entire batch
        INSERT INTO public.audit_events (action_type, actor_id, payload, created_at)
        VALUES (
            'BULK_CADET_IMPORT',
            p_admin_id,
            jsonb_build_object(
                'records_imported', v_inserted_count,
                'upload_method', 'DUAL_TEMPLATE_INGRESS'
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

NOTIFY pgrst, 'reload schema';

