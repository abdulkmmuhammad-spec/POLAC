-- ============================================================================
-- MIGRATION: 20261126_02_matron_reconciliation.sql
-- PURPOSE:
--   1. Provision 'matron' role in public.users & admin_register_officer.
--   2. Create public.matron_course_strengths (per-course female strength).
--   3. Create public.parade_gender_submissions (split-gender staging table).
--   4. Create atomic RPCs:
--        - public.reconcile_course_parade(...) [internal helper]
--        - public.submit_gender_parade_segment(...)
--        - public.upsert_matron_course_strength(...)
--   5. Update admin_wipe_application_data to clear Matron staging & strength tables.
-- ============================================================================

-- 1. Extend user_role enum if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'matron';
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Expand role CHECK constraint on public.users
DO $$
DECLARE
  v_con_name TEXT;
BEGIN
  FOR v_con_name IN
    SELECT con.conname
    FROM pg_constraint con
    INNER JOIN pg_class rel ON rel.oid = con.conrelid
    INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'users'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT IF EXISTS %I', v_con_name);
  END LOOP;

  ALTER TABLE public.users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'commandant', 'course_officer', 'medical_officer', 'matron'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 3. Upgrade admin_register_officer to support 'matron'
CREATE OR REPLACE FUNCTION public.admin_register_officer(
  p_commandant_id TEXT,
  p_email TEXT,
  p_password TEXT,
  p_username TEXT,
  p_role TEXT,
  p_full_name TEXT DEFAULT NULL,
  p_designation TEXT DEFAULT NULL,
  p_course_number INTEGER DEFAULT NULL,
  p_caller_email TEXT DEFAULT NULL,
  p_caller_username TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_caller_role TEXT;
  v_caller_name TEXT;
  v_effective_full_name TEXT;
  v_effective_designation TEXT;
  v_effective_course_name TEXT;
  v_clean_username TEXT;
  v_new_id UUID;
BEGIN
  SELECT LOWER(TRIM(role)), COALESCE(full_name, username, 'System Administrator')
  INTO v_caller_role, v_caller_name
  FROM public.users
  WHERE id::text = TRIM(COALESCE(p_commandant_id, ''))
    AND COALESCE(is_active, TRUE) = TRUE;

  IF (v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'commandant'))
     AND NULLIF(TRIM(COALESCE(p_caller_email, '')), '') IS NOT NULL
     AND NULLIF(TRIM(COALESCE(p_caller_username, '')), '') IS NOT NULL THEN
    SELECT LOWER(TRIM(role)), COALESCE(full_name, username, 'System Administrator')
    INTO v_caller_role, v_caller_name
    FROM public.users
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_caller_email))
      AND LOWER(TRIM(username)) = LOWER(TRIM(p_caller_username))
      AND LOWER(TRIM(role)) IN ('admin', 'commandant')
      AND COALESCE(is_active, TRUE) = TRUE
    LIMIT 1;
  END IF;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'commandant') THEN
    RAISE EXCEPTION 'Unauthorized: Only the System Administrator can add new officers.';
  END IF;

  IF p_role NOT IN ('commandant', 'course_officer', 'medical_officer', 'matron') THEN
    RAISE EXCEPTION 'Invalid role specified: %.', p_role;
  END IF;

  IF p_role = 'course_officer' THEN
    SELECT COUNT(*) INTO v_count
    FROM public.users
    WHERE LOWER(TRIM(role)) = 'course_officer' AND COALESCE(is_active, TRUE) = TRUE;

    IF v_count >= 5 THEN
      RAISE EXCEPTION 'Capacity limit reached: System permits max 5 active Course Officers.';
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.users WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_email));
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Email already registered.';
  END IF;

  v_clean_username := LOWER(TRIM(COALESCE(p_username, '')));
  IF v_clean_username = '' THEN
    RAISE EXCEPTION 'Username is required.';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.users WHERE LOWER(TRIM(username)) = v_clean_username;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Username is already taken.';
  END IF;

  v_effective_full_name := NULLIF(TRIM(COALESCE(p_full_name, '')), '');
  IF v_effective_full_name IS NULL THEN
    v_effective_full_name := v_clean_username;
  END IF;

  IF p_role = 'commandant' THEN
    v_effective_designation := COALESCE(NULLIF(TRIM(COALESCE(p_designation, '')), ''), 'Senior Executive Officer');
    v_effective_course_name := 'Academy HQ';
  ELSIF p_role = 'medical_officer' THEN
    v_effective_designation := COALESCE(NULLIF(TRIM(COALESCE(p_designation, '')), ''), 'Medical Officer');
    v_effective_course_name := 'Academy HQ';
  ELSIF p_role = 'matron' THEN
    v_effective_designation := COALESCE(NULLIF(TRIM(COALESCE(p_designation, '')), ''), 'Academy Matron');
    v_effective_course_name := 'Academy HQ';
  ELSE
    v_effective_designation := COALESCE(NULLIF(TRIM(COALESCE(p_designation, '')), ''), 'Course Officer');
    IF p_course_number IS NOT NULL THEN
      v_effective_course_name := 'REGULAR COURSE ' || p_course_number::text;
    ELSE
      v_effective_course_name := NULL;
    END IF;
  END IF;

  INSERT INTO public.users (
    email,
    password,
    username,
    full_name,
    designation,
    role,
    course_name,
    course_number,
    is_active
  )
  VALUES (
    LOWER(TRIM(p_email)),
    p_password,
    v_clean_username,
    v_effective_full_name,
    v_effective_designation,
    p_role,
    v_effective_course_name,
    CASE WHEN p_role = 'course_officer' THEN p_course_number ELSE NULL END,
    TRUE
  )
  RETURNING id INTO v_new_id;

  BEGIN
    INSERT INTO public.audit_events (
      actor_id,
      actor_name,
      action_type,
      payload,
      created_at
    )
    VALUES (
      NULLIF(TRIM(p_commandant_id), '')::UUID,
      v_caller_name,
      'COMMISSION_OFFICER',
      jsonb_build_object(
        'target_user_id', v_new_id,
        'target_username', v_clean_username,
        'role', p_role,
        'designation', v_effective_designation,
        'course_number', p_course_number
      ),
      NOW()
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', TRUE,
    'id', v_new_id,
    'username', v_clean_username,
    'role', p_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_register_officer(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) TO authenticated, anon;

-- 4. Create public.matron_course_strengths
CREATE TABLE IF NOT EXISTS public.matron_course_strengths (
  course_number INTEGER PRIMARY KEY,
  female_strength INTEGER NOT NULL CHECK (female_strength >= 0),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.matron_course_strengths ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read matron_course_strengths" ON public.matron_course_strengths;
CREATE POLICY "Allow read matron_course_strengths"
  ON public.matron_course_strengths FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Allow write matron_course_strengths" ON public.matron_course_strengths;
CREATE POLICY "Allow write matron_course_strengths"
  ON public.matron_course_strengths FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- 5. Create public.parade_gender_submissions
CREATE TABLE IF NOT EXISTS public.parade_gender_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parade_date DATE NOT NULL,
  parade_type VARCHAR(20) NOT NULL CHECK (parade_type IN ('muster', 'tattoo', 'special')),
  course_number INTEGER NOT NULL,
  course_name VARCHAR(100) NOT NULL,
  year_group INTEGER NOT NULL DEFAULT 1,
  gender_segment VARCHAR(10) NOT NULL CHECK (gender_segment IN ('female', 'male')),
  submitted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  submitted_by_name VARCHAR(150) NOT NULL,
  declared_strength INTEGER NOT NULL DEFAULT 0,
  present_count INTEGER NOT NULL DEFAULT 0,
  absent_count INTEGER NOT NULL DEFAULT 0,
  sick_count INTEGER NOT NULL DEFAULT 0,
  detention_count INTEGER NOT NULL DEFAULT 0,
  pass_count INTEGER NOT NULL DEFAULT 0,
  suspension_count INTEGER NOT NULL DEFAULT 0,
  yet_to_report_count INTEGER NOT NULL DEFAULT 0,
  grand_total INTEGER NOT NULL DEFAULT 0,
  cadet_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  reconciled_record_id UUID REFERENCES public.parade_records(id) ON DELETE SET NULL,
  status VARCHAR(25) NOT NULL DEFAULT 'pending_counterpart'
    CHECK (status IN ('pending_counterpart', 'reconciled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (parade_date, parade_type, course_number, gender_segment)
);

CREATE INDEX IF NOT EXISTS idx_parade_gender_lookup
  ON public.parade_gender_submissions (parade_date, parade_type, course_number);

ALTER TABLE public.parade_gender_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read parade_gender_submissions" ON public.parade_gender_submissions;
CREATE POLICY "Allow read parade_gender_submissions"
  ON public.parade_gender_submissions FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Allow write parade_gender_submissions" ON public.parade_gender_submissions;
CREATE POLICY "Allow write parade_gender_submissions"
  ON public.parade_gender_submissions FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- 6. Internal helper: merge female + male (or 0-female-exempt male) into unified parade_records
CREATE OR REPLACE FUNCTION public.reconcile_course_parade_internal(
  p_parade_date DATE,
  p_parade_type TEXT,
  p_course_number INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_female public.parade_gender_submissions%ROWTYPE;
  v_male public.parade_gender_submissions%ROWTYPE;
  v_has_female BOOLEAN := FALSE;
  v_has_male BOOLEAN := FALSE;
  v_zero_female_exempt BOOLEAN := FALSE;
  v_female_strength INTEGER;

  v_present INTEGER;
  v_absent INTEGER;
  v_sick INTEGER;
  v_detention INTEGER;
  v_pass INTEGER;
  v_suspension INTEGER;
  v_yet_to_report INTEGER;
  v_grand_total INTEGER;

  v_officer_id UUID;
  v_officer_name TEXT;
  v_course_name TEXT;
  v_year_group INTEGER;
  v_reconciled_id UUID;
  v_merged_cadets JSONB;
  v_was_existing BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_female
  FROM public.parade_gender_submissions
  WHERE parade_date = p_parade_date
    AND parade_type = p_parade_type
    AND course_number = p_course_number
    AND gender_segment = 'female';
  v_has_female := FOUND;

  SELECT * INTO v_male
  FROM public.parade_gender_submissions
  WHERE parade_date = p_parade_date
    AND parade_type = p_parade_type
    AND course_number = p_course_number
    AND gender_segment = 'male';
  v_has_male := FOUND;

  SELECT female_strength INTO v_female_strength
  FROM public.matron_course_strengths
  WHERE course_number = p_course_number;

  IF NOT v_has_male THEN
    RETURN jsonb_build_object(
      'reconciled', FALSE,
      'waiting_for', 'male'
    );
  END IF;

  IF NOT v_has_female THEN
    IF p_parade_type != 'tattoo' OR COALESCE(v_female_strength, -1) = 0 THEN
      v_zero_female_exempt := TRUE;
    ELSE
      RETURN jsonb_build_object(
        'reconciled', FALSE,
        'waiting_for', 'female'
      );
    END IF;
  END IF;

  -- Sum all 7 counts + grand_total
  v_present       := COALESCE(v_male.present_count, 0)       + CASE WHEN v_has_female THEN COALESCE(v_female.present_count, 0) ELSE 0 END;
  v_absent        := COALESCE(v_male.absent_count, 0)        + CASE WHEN v_has_female THEN COALESCE(v_female.absent_count, 0) ELSE 0 END;
  v_sick          := COALESCE(v_male.sick_count, 0)          + CASE WHEN v_has_female THEN COALESCE(v_female.sick_count, 0) ELSE 0 END;
  v_detention     := COALESCE(v_male.detention_count, 0)     + CASE WHEN v_has_female THEN COALESCE(v_female.detention_count, 0) ELSE 0 END;
  v_pass          := COALESCE(v_male.pass_count, 0)          + CASE WHEN v_has_female THEN COALESCE(v_female.pass_count, 0) ELSE 0 END;
  v_suspension    := COALESCE(v_male.suspension_count, 0)    + CASE WHEN v_has_female THEN COALESCE(v_female.suspension_count, 0) ELSE 0 END;
  v_yet_to_report := COALESCE(v_male.yet_to_report_count, 0) + CASE WHEN v_has_female THEN COALESCE(v_female.yet_to_report_count, 0) ELSE 0 END;
  v_grand_total   := COALESCE(v_male.grand_total, 0)         + CASE WHEN v_has_female THEN COALESCE(v_female.grand_total, 0) ELSE 0 END;

  v_officer_id   := v_male.submitted_by;
  v_officer_name := v_male.submitted_by_name;
  v_course_name  := COALESCE(v_male.course_name, v_female.course_name, 'REGULAR COURSE ' || p_course_number::text);
  v_year_group   := COALESCE(v_male.year_group, v_female.year_group, 1);

  -- Deduplicate merged cadet_details by LOWER(TRIM(name)) + LOWER(TRIM(squad))
  WITH combined AS (
    SELECT
      elem->>'name' AS name,
      elem->>'squad' AS squad,
      elem->>'status' AS status,
      1 AS prio
    FROM jsonb_array_elements(COALESCE(v_male.cadet_details, '[]'::jsonb)) AS elem
    UNION ALL
    SELECT
      elem->>'name' AS name,
      elem->>'squad' AS squad,
      elem->>'status' AS status,
      2 AS prio
    FROM jsonb_array_elements(
      CASE WHEN v_has_female THEN COALESCE(v_female.cadet_details, '[]'::jsonb) ELSE '[]'::jsonb END
    ) AS elem
  ),
  deduped AS (
    SELECT DISTINCT ON (LOWER(TRIM(COALESCE(name, ''))), LOWER(TRIM(COALESCE(squad, ''))))
      name, squad, status
    FROM combined
    WHERE NULLIF(TRIM(COALESCE(name, '')), '') IS NOT NULL
    ORDER BY LOWER(TRIM(COALESCE(name, ''))), LOWER(TRIM(COALESCE(squad, ''))), prio ASC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'squad', squad, 'status', status)), '[]'::jsonb)
  INTO v_merged_cadets
  FROM deduped;

  -- Locate existing unified parade_records row if re-submitting
  v_reconciled_id := COALESCE(v_male.reconciled_record_id, CASE WHEN v_has_female THEN v_female.reconciled_record_id ELSE NULL END);

  IF v_reconciled_id IS NULL THEN
    SELECT id INTO v_reconciled_id
    FROM public.parade_records
    WHERE date = p_parade_date
      AND parade_type = p_parade_type
      AND course_number = p_course_number
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_reconciled_id IS NOT NULL THEN
    v_was_existing := TRUE;
    UPDATE public.parade_records
    SET
      officer_id = COALESCE(v_officer_id, officer_id),
      officer_name = COALESCE(v_officer_name, officer_name),
      course_name = v_course_name,
      year_group = v_year_group,
      present_count = v_present,
      absent_count = v_absent,
      sick_count = v_sick,
      detention_count = v_detention,
      pass_count = v_pass,
      suspension_count = v_suspension,
      yet_to_report_count = v_yet_to_report,
      grand_total = v_grand_total
    WHERE id = v_reconciled_id;

    DELETE FROM public.cadet_details WHERE record_id = v_reconciled_id;
  ELSE
    INSERT INTO public.parade_records (
      officer_id, officer_name, course_name, year_group, course_number,
      date, parade_type, present_count, absent_count, sick_count, detention_count,
      pass_count, suspension_count, yet_to_report_count, grand_total, created_at
    ) VALUES (
      v_officer_id, v_officer_name, v_course_name, v_year_group, p_course_number,
      p_parade_date, p_parade_type, v_present, v_absent, v_sick, v_detention,
      v_pass, v_suspension, v_yet_to_report, v_grand_total, NOW()
    )
    RETURNING id INTO v_reconciled_id;
  END IF;

  IF jsonb_array_length(v_merged_cadets) > 0 THEN
    INSERT INTO public.cadet_details (record_id, name, squad, status)
    SELECT
      v_reconciled_id,
      rec->>'name',
      rec->>'squad',
      rec->>'status'
    FROM jsonb_array_elements(v_merged_cadets) AS rec;
  END IF;

  -- Mark staging rows reconciled
  UPDATE public.parade_gender_submissions
  SET status = 'reconciled', reconciled_record_id = v_reconciled_id, updated_at = NOW()
  WHERE parade_date = p_parade_date
    AND parade_type = p_parade_type
    AND course_number = p_course_number;

  -- Audit log
  BEGIN
    INSERT INTO public.audit_events (action_type, actor_id, actor_name, payload, created_at)
    VALUES (
      'PARADE_RECONCILED_SUBMITTED',
      v_officer_id,
      v_officer_name,
      jsonb_build_object(
        'parade_id', v_reconciled_id,
        'course_number', p_course_number,
        'parade_date', p_parade_date,
        'parade_type', p_parade_type,
        'grand_total', v_grand_total,
        'zero_female_exempt', v_zero_female_exempt,
        'updated_existing', v_was_existing
      ),
      NOW()
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Unified Notification for Commandant & Course Officer
  BEGIN
    INSERT INTO public.notifications (
      type, title, content, timestamp, read, officer_name, year_group, course_number
    ) VALUES (
      'parade_submission',
      'Parade State Submitted',
      format(
        '%s (%s) — RC %s %s parade state compiled (Present: %s, Absent: %s, Sick: %s, Total: %s)',
        v_officer_name,
        CASE WHEN v_zero_female_exempt THEN 'Unified' ELSE 'Officer + Matron' END,
        p_course_number,
        UPPER(p_parade_type),
        v_present,
        v_absent,
        v_sick,
        v_grand_total
      ),
      NOW(),
      FALSE,
      v_officer_name,
      v_year_group,
      p_course_number
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'reconciled', TRUE,
    'parade_id', v_reconciled_id,
    'grand_total', v_grand_total,
    'present_count', v_present,
    'absent_count', v_absent,
    'sick_count', v_sick,
    'zero_female_exempt', v_zero_female_exempt
  );
END;
$$;

-- 7. Public RPC: submit_gender_parade_segment
CREATE OR REPLACE FUNCTION public.submit_gender_parade_segment(
  p_submitter_id UUID,
  p_submitter_name TEXT,
  p_course_name TEXT,
  p_year_group INTEGER,
  p_course_number INTEGER,
  p_date DATE,
  p_parade_type TEXT,
  p_gender_segment TEXT,
  p_declared_strength INTEGER,
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_reconcile JSONB;
  v_waiting_for TEXT;
BEGIN
  SELECT LOWER(TRIM(role)) INTO v_role
  FROM public.users
  WHERE id = p_submitter_id AND COALESCE(is_active, TRUE) = TRUE;

  IF v_role IS NULL OR v_role NOT IN ('matron', 'course_officer', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only an active Matron or Course Officer can submit parade segments.';
  END IF;

  IF p_gender_segment NOT IN ('female', 'male') THEN
    RAISE EXCEPTION 'Invalid gender segment: %', p_gender_segment;
  END IF;

  IF p_gender_segment = 'female' THEN
    INSERT INTO public.matron_course_strengths (course_number, female_strength, updated_by, updated_at)
    VALUES (p_course_number, GREATEST(0, COALESCE(p_declared_strength, 0)), p_submitter_id, NOW())
    ON CONFLICT (course_number) DO UPDATE SET
      female_strength = EXCLUDED.female_strength,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW();
  END IF;

  INSERT INTO public.parade_gender_submissions (
    parade_date, parade_type, course_number, course_name, year_group,
    gender_segment, submitted_by, submitted_by_name, declared_strength,
    present_count, absent_count, sick_count, detention_count,
    pass_count, suspension_count, yet_to_report_count, grand_total,
    cadet_details, status, updated_at
  ) VALUES (
    p_date, p_parade_type, p_course_number, p_course_name, COALESCE(p_year_group, 1),
    p_gender_segment, p_submitter_id, p_submitter_name, GREATEST(0, COALESCE(p_declared_strength, 0)),
    p_present_count, p_absent_count, p_sick_count, p_detention_count,
    p_pass_count, p_suspension_count, p_yet_to_report_count, p_grand_total,
    COALESCE(p_cadet_records, '[]'::jsonb), 'pending_counterpart', NOW()
  )
  ON CONFLICT (parade_date, parade_type, course_number, gender_segment) DO UPDATE SET
    course_name = EXCLUDED.course_name,
    year_group = EXCLUDED.year_group,
    submitted_by = EXCLUDED.submitted_by,
    submitted_by_name = EXCLUDED.submitted_by_name,
    declared_strength = EXCLUDED.declared_strength,
    present_count = EXCLUDED.present_count,
    absent_count = EXCLUDED.absent_count,
    sick_count = EXCLUDED.sick_count,
    detention_count = EXCLUDED.detention_count,
    pass_count = EXCLUDED.pass_count,
    suspension_count = EXCLUDED.suspension_count,
    yet_to_report_count = EXCLUDED.yet_to_report_count,
    grand_total = EXCLUDED.grand_total,
    cadet_details = EXCLUDED.cadet_details,
    updated_at = NOW();

  v_reconcile := public.reconcile_course_parade_internal(p_date, p_parade_type, p_course_number);

  IF COALESCE((v_reconcile->>'reconciled')::BOOLEAN, FALSE) = TRUE THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'state', 'reconciled',
      'parade_id', v_reconcile->>'parade_id',
      'grand_total', (v_reconcile->>'grand_total')::INTEGER
    );
  END IF;

  v_waiting_for := COALESCE(v_reconcile->>'waiting_for', CASE WHEN p_gender_segment = 'female' THEN 'male' ELSE 'female' END);

  -- Notify counterpart if awaiting
  BEGIN
    INSERT INTO public.notifications (
      type, title, content, timestamp, read, officer_name, year_group, course_number
    ) VALUES (
      'parade_segment_pending',
      CASE
        WHEN p_gender_segment = 'female' THEN format('Female Parade Received — RC %s', p_course_number)
        ELSE format('Male Parade Pending Matron — RC %s', p_course_number)
      END,
      CASE
        WHEN p_gender_segment = 'female' THEN format('Matron %s submitted RC %s %s female state (%s/%s Present). Submit your male state to auto-combine.', p_submitter_name, p_course_number, UPPER(p_parade_type), p_present_count, p_grand_total)
        ELSE format('%s submitted RC %s %s male state (%s/%s Present). Awaiting Matron female segment.', p_submitter_name, p_course_number, UPPER(p_parade_type), p_present_count, p_grand_total)
      END,
      NOW(),
      FALSE,
      p_submitter_name,
      COALESCE(p_year_group, 1),
      p_course_number
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', TRUE,
    'state', 'awaiting_counterpart',
    'waitingFor', v_waiting_for
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_gender_parade_segment(UUID, TEXT, TEXT, INTEGER, INTEGER, DATE, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, JSONB) TO authenticated, anon;

-- 8. Public RPC: upsert_matron_course_strength (triggers reconciliation if female_strength = 0 & male already submitted)
CREATE OR REPLACE FUNCTION public.upsert_matron_course_strength(
  p_course_number INTEGER,
  p_female_strength INTEGER,
  p_updated_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending RECORD;
  v_reconciled_count INTEGER := 0;
  v_res JSONB;
BEGIN
  INSERT INTO public.matron_course_strengths (course_number, female_strength, updated_by, updated_at)
  VALUES (p_course_number, GREATEST(0, COALESCE(p_female_strength, 0)), p_updated_by, NOW())
  ON CONFLICT (course_number) DO UPDATE SET
    female_strength = EXCLUDED.female_strength,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW();

  IF COALESCE(p_female_strength, 0) = 0 THEN
    FOR v_pending IN
      SELECT parade_date, parade_type
      FROM public.parade_gender_submissions
      WHERE course_number = p_course_number
        AND gender_segment = 'male'
        AND status = 'pending_counterpart'
    LOOP
      v_res := public.reconcile_course_parade_internal(v_pending.parade_date, v_pending.parade_type, p_course_number);
      IF COALESCE((v_res->>'reconciled')::BOOLEAN, FALSE) = TRUE THEN
        v_reconciled_count := v_reconciled_count + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'course_number', p_course_number,
    'female_strength', GREATEST(0, COALESCE(p_female_strength, 0)),
    'auto_reconciled_count', v_reconciled_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_matron_course_strength(INTEGER, INTEGER, UUID) TO authenticated, anon;

-- 9. Update admin_wipe_application_data to also clear parade_gender_submissions & matron_course_strengths
CREATE OR REPLACE FUNCTION public.admin_wipe_application_data(
  p_admin_id UUID,
  p_current_password TEXT,
  p_confirmation_phrase TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_role VARCHAR;
  v_admin_name VARCHAR;
  v_admin_password VARCHAR;
  v_deleted_cadets INTEGER := 0;
  v_deleted_parades INTEGER := 0;
  v_deleted_officers INTEGER := 0;
  v_deleted_details INTEGER := 0;
  v_deleted_remarks INTEGER := 0;
  v_deleted_notifications INTEGER := 0;
  v_deleted_sickbay INTEGER := 0;
  v_deleted_alerts INTEGER := 0;
  v_deleted_reports INTEGER := 0;
BEGIN
  PERFORM set_config('safeupdate.enabled', 'off', true);

  SELECT role, COALESCE(full_name, username, 'System Administrator'), password
  INTO v_admin_role, v_admin_name, v_admin_password
  FROM public.users
  WHERE id = p_admin_id AND COALESCE(is_active, TRUE) = TRUE;

  IF v_admin_role IS NULL OR LOWER(TRIM(v_admin_role)) != 'admin' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only an active System Administrator can wipe application data.';
  END IF;

  IF p_current_password IS NULL OR TRIM(p_current_password) = '' OR v_admin_password IS DISTINCT FROM p_current_password THEN
    RAISE EXCEPTION 'INVALID_CURRENT_PASSWORD: Administrator password verification failed.';
  END IF;

  IF TRIM(COALESCE(p_confirmation_phrase, '')) != 'WIPE ALL DATA' THEN
    RAISE EXCEPTION 'INVALID_CONFIRMATION: Confirmation phrase must be WIPE ALL DATA.';
  END IF;

  SELECT COUNT(*) INTO v_deleted_cadets FROM public.cadet_registry;
  SELECT COUNT(*) INTO v_deleted_parades FROM public.parade_records;
  SELECT COUNT(*) INTO v_deleted_officers FROM public.users WHERE id != p_admin_id;

  PERFORM set_config('app.suppress_audit', 'true', true);

  BEGIN
    DROP TRIGGER IF EXISTS trg_audit_immutability ON public.audit_events;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    DROP TRIGGER IF EXISTS trg_notification_immutability ON public.notifications;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    DELETE FROM public.parade_gender_submissions WHERE id IS NOT NULL;
    DELETE FROM public.matron_course_strengths WHERE course_number IS NOT NULL;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.sickbay_verifications WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_deleted_sickbay = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN v_deleted_sickbay := 0;
  END;

  BEGIN
    DELETE FROM public.cadet_details WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_deleted_details = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN v_deleted_details := 0;
  END;

  BEGIN
    DELETE FROM public.commandant_remarks WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_deleted_remarks = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN v_deleted_remarks := 0;
  END;

  DELETE FROM public.parade_records WHERE id IS NOT NULL;

  BEGIN
    DELETE FROM public.command_reports WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_deleted_reports = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN v_deleted_reports := 0;
  END;

  BEGIN
    DELETE FROM public.cadet_alerts WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_deleted_alerts = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN v_deleted_alerts := 0;
  END;

  BEGIN
    DELETE FROM public.notifications WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_deleted_notifications = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN v_deleted_notifications := 0;
  END;

  BEGIN
    DELETE FROM public.notifications_archive WHERE id IS NOT NULL;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.course_purge_snapshots WHERE id IS NOT NULL;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.push_subscriptions WHERE user_id != p_admin_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  BEGIN
    DELETE FROM auth.refresh_tokens WHERE user_id::text != p_admin_id::text;
    DELETE FROM auth.sessions WHERE user_id != p_admin_id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  DELETE FROM public.cadet_registry WHERE id IS NOT NULL;
  DELETE FROM public.audit_events WHERE id IS NOT NULL;

  BEGIN
    CREATE TRIGGER trg_audit_immutability
      BEFORE UPDATE OR DELETE ON public.audit_events
      FOR EACH ROW EXECUTE FUNCTION public.audit_immutability_enforcement();
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    CREATE TRIGGER trg_notification_immutability
      BEFORE DELETE ON public.notifications
      FOR EACH ROW EXECUTE FUNCTION public.notification_immutability_guard();
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  PERFORM set_config('app.suppress_audit', 'false', true);

  DELETE FROM public.users
  WHERE id != p_admin_id
    AND LOWER(TRIM(COALESCE(role, ''))) != 'admin';

  INSERT INTO public.audit_events (action_type, actor_id, actor_name, payload, created_at)
  VALUES (
    'SYSTEM_FACTORY_WIPE',
    p_admin_id,
    v_admin_name,
    jsonb_build_object(
      'deleted_cadets', v_deleted_cadets,
      'deleted_parade_records', v_deleted_parades,
      'deleted_cadet_details', v_deleted_details,
      'deleted_officers', v_deleted_officers,
      'deleted_remarks', v_deleted_remarks,
      'deleted_notifications', v_deleted_notifications,
      'deleted_sickbay', v_deleted_sickbay,
      'deleted_alerts', v_deleted_alerts,
      'deleted_reports', v_deleted_reports,
      'retained_admin_id', p_admin_id
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'deletedCadets', v_deleted_cadets,
    'deletedParadeRecords', v_deleted_parades,
    'deletedOfficers', v_deleted_officers,
    'message', 'Application data factory wipe complete.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_wipe_application_data(UUID, TEXT, TEXT) TO authenticated, anon;
