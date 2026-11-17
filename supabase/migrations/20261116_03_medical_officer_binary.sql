-- ============================================================================
-- MIGRATION: 20261116_03_medical_officer_binary.sql
-- DATE: 2026-11-16
-- OBJECTIVE:
--   1. Provision 'medical_officer' role in public.users constraint & enum.
--   2. Create binary enum medical_verification_status ('pending_verification', 'admitted', 'not_admitted').
--   3. Create public.sickbay_verifications table for live cross-cohort verification.
--   4. Add automated trigger on public.cadet_details to sync SICK cadets to sickbay_verifications.
--   5. Upgrade admin_register_officer to support commissioning Medical Officers.
--   6. Create RPC verify_sickbay_cadet for 1-tap disposition and targeted alerts.
--   7. Configure Row Level Security (RLS) policies.
-- ============================================================================

-- 1. Extend user_role type if it exists as an enum
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'medical_officer';
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Expand role check constraint on public.users
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
    CHECK (role IN ('admin', 'commandant', 'course_officer', 'medical_officer'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 3. Create binary enum for medical verification status (Strictly 3 values)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'medical_verification_status') THEN
    CREATE TYPE medical_verification_status AS ENUM (
      'pending_verification',
      'admitted',
      'not_admitted'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 4. Create public.sickbay_verifications table
CREATE TABLE IF NOT EXISTS public.sickbay_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadet_detail_id UUID REFERENCES public.cadet_details(id) ON DELETE CASCADE,
  parade_record_id UUID REFERENCES public.parade_records(id) ON DELETE CASCADE,
  course_number INT NOT NULL,
  cadet_name TEXT NOT NULL,
  squad TEXT,
  parade_date DATE NOT NULL DEFAULT CURRENT_DATE,
  parade_type TEXT NOT NULL,
  reported_by_officer TEXT NOT NULL,
  status medical_verification_status NOT NULL DEFAULT 'pending_verification',
  medical_officer_id UUID REFERENCES public.users(id),
  medical_officer_name TEXT,
  clinical_note TEXT,
  targeted_recipient_role TEXT CHECK (targeted_recipient_role IS NULL OR targeted_recipient_role IN ('commandant', 'dfs', 'course_officer')),
  targeted_recipient_id UUID REFERENCES public.users(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_sickbay_date_status
  ON public.sickbay_verifications(parade_date DESC, status);

CREATE INDEX IF NOT EXISTS idx_sickbay_course_cadet
  ON public.sickbay_verifications(course_number, cadet_name);

CREATE INDEX IF NOT EXISTS idx_sickbay_parade_record
  ON public.sickbay_verifications(parade_record_id);

CREATE INDEX IF NOT EXISTS idx_sickbay_cadet_detail
  ON public.sickbay_verifications(cadet_detail_id);

-- 5. Automated Sync Trigger: cadet_details -> sickbay_verifications
CREATE OR REPLACE FUNCTION public.sync_cadet_sickbay_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
BEGIN
  -- Only process sick cadets
  IF LOWER(TRIM(NEW.status)) <> 'sick' THEN
    RETURN NEW;
  END IF;

  -- Fetch parent parade record metadata
  SELECT
    id,
    COALESCE(course_number, year_group, 0) AS course_number,
    COALESCE(date::date, CURRENT_DATE) AS parade_date,
    COALESCE(parade_type, 'muster') AS parade_type,
    COALESCE(officer_name, 'Course Officer') AS officer_name
  INTO v_rec
  FROM public.parade_records
  WHERE id = NEW.record_id
  LIMIT 1;

  IF v_rec.id IS NOT NULL THEN
    -- Prevent duplicate entry for same cadet detail
    INSERT INTO public.sickbay_verifications (
      cadet_detail_id,
      parade_record_id,
      course_number,
      cadet_name,
      squad,
      parade_date,
      parade_type,
      reported_by_officer,
      status
    ) VALUES (
      NEW.id,
      v_rec.id,
      v_rec.course_number,
      TRIM(NEW.name),
      TRIM(COALESCE(NEW.squad, '')),
      v_rec.parade_date,
      v_rec.parade_type,
      v_rec.officer_name,
      'pending_verification'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never abort cadet detail insertion if verification sync has transient error
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_sickbay_verification ON public.cadet_details;
CREATE TRIGGER trigger_sync_sickbay_verification
  AFTER INSERT ON public.cadet_details
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_cadet_sickbay_verification();

-- 6. Backfill existing SICK cadets from recent parade records
DO $$
BEGIN
  INSERT INTO public.sickbay_verifications (
    cadet_detail_id,
    parade_record_id,
    course_number,
    cadet_name,
    squad,
    parade_date,
    parade_type,
    reported_by_officer,
    status
  )
  SELECT
    cd.id,
    pr.id,
    COALESCE(pr.course_number, pr.year_group, 0),
    TRIM(cd.name),
    TRIM(COALESCE(cd.squad, '')),
    COALESCE(pr.date::date, CURRENT_DATE),
    COALESCE(pr.parade_type, 'muster'),
    COALESCE(pr.officer_name, 'Course Officer'),
    'pending_verification'
  FROM public.cadet_details cd
  JOIN public.parade_records pr ON cd.record_id = pr.id
  WHERE LOWER(TRIM(cd.status)) = 'sick'
    AND NOT EXISTS (
      SELECT 1 FROM public.sickbay_verifications sv WHERE sv.cadet_detail_id = cd.id
    )
  ORDER BY pr.date DESC
  LIMIT 500;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 7. Upgrade admin_register_officer RPC to support 'medical_officer'
CREATE OR REPLACE FUNCTION public.admin_register_officer(
  p_commandant_id TEXT,
  p_email TEXT,
  p_password TEXT,
  p_username TEXT,
  p_role TEXT,
  p_full_name TEXT DEFAULT NULL,
  p_designation TEXT DEFAULT NULL,
  p_course_number INTEGER DEFAULT NULL
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
  v_new_id UUID;
BEGIN
  SELECT role, COALESCE(full_name, username, 'System Administrator')
  INTO v_caller_role, v_caller_name
  FROM public.users
  WHERE id::text = p_commandant_id AND COALESCE(is_active, TRUE) = TRUE;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'commandant') THEN
    RAISE EXCEPTION 'Unauthorized: Only the System Administrator can commission new officers.';
  END IF;

  IF p_role NOT IN ('commandant', 'course_officer', 'medical_officer') THEN
    RAISE EXCEPTION 'Invalid role specified: %. Must be commandant, course_officer, or medical_officer.', p_role;
  END IF;

  -- Enforce 5 active officer cap strictly on course_officer role only
  IF p_role = 'course_officer' THEN
    SELECT COUNT(*) INTO v_count
    FROM public.users
    WHERE role = 'course_officer' AND COALESCE(is_active, TRUE) = TRUE;

    IF v_count >= 5 THEN
      RAISE EXCEPTION 'Capacity limit reached: System permits max 5 active Course Officers.';
    END IF;
  END IF;

  -- Check duplicate email
  SELECT COUNT(*) INTO v_count FROM public.users WHERE LOWER(email) = LOWER(TRIM(p_email));
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Email already registered.';
  END IF;

  v_effective_full_name := COALESCE(NULLIF(TRIM(p_full_name), ''), TRIM(p_username));

  IF p_role = 'commandant' THEN
    v_effective_designation := COALESCE(NULLIF(TRIM(p_designation), ''), 'Senior Executive Officer');
    v_effective_course_name := 'Academy HQ';
  ELSIF p_role = 'medical_officer' THEN
    v_effective_designation := COALESCE(NULLIF(TRIM(p_designation), ''), 'Medical Officer');
    v_effective_course_name := 'Academy HQ';
  ELSE
    v_effective_designation := COALESCE(NULLIF(TRIM(p_designation), ''), 'Course Officer');
    v_effective_course_name := CASE
      WHEN p_course_number IS NOT NULL AND p_course_number > 0 THEN 'REGULAR COURSE ' || p_course_number::TEXT
      ELSE NULL
    END;
  END IF;

  PERFORM set_config('app.allow_identity_override', 'true', true);

  INSERT INTO public.users (
    id,
    email,
    password,
    username,
    full_name,
    role,
    designation,
    course_name,
    course_number,
    total_cadets,
    is_active,
    session_version
  ) VALUES (
    gen_random_uuid(),
    LOWER(TRIM(p_email)),
    p_password,
    TRIM(p_username),
    v_effective_full_name,
    p_role,
    v_effective_designation,
    v_effective_course_name,
    CASE WHEN p_role = 'course_officer' THEN p_course_number ELSE NULL END,
    0,
    TRUE,
    1
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.audit_events (action_type, actor_id, actor_name, target_id, payload, created_at)
  VALUES (
    'OFFICER_INVITED',
    NULLIF(p_commandant_id, '')::UUID,
    v_caller_name,
    v_new_id::TEXT,
    jsonb_build_object(
      'email', LOWER(TRIM(p_email)),
      'username', TRIM(p_username),
      'full_name', v_effective_full_name,
      'role', p_role,
      'designation', v_effective_designation,
      'course_number', p_course_number
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'id', v_new_id,
    'message', 'Officer commissioned securely.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_register_officer(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated, anon;

-- 8. RPC: verify_sickbay_cadet (Binary: 'admitted' | 'not_admitted' + Targeted Remark)
CREATE OR REPLACE FUNCTION public.verify_sickbay_cadet(
  p_verification_id UUID,
  p_medical_officer_id UUID,
  p_status TEXT,
  p_clinical_note TEXT DEFAULT NULL,
  p_targeted_recipient_role TEXT DEFAULT NULL,
  p_targeted_recipient_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_name TEXT;
  v_doctor_role TEXT;
  v_doctor_designation TEXT;
  v_rec RECORD;
  v_clean_status medical_verification_status;
  v_notif_title TEXT;
  v_notif_content TEXT;
  v_recipient_id UUID;
  v_recipient_name TEXT;
BEGIN
  -- Authenticate Doctor
  SELECT
    COALESCE(full_name, username, 'Medical Officer'),
    role,
    COALESCE(designation, 'Medical Officer')
  INTO v_doctor_name, v_doctor_role, v_doctor_designation
  FROM public.users
  WHERE id = p_medical_officer_id AND COALESCE(is_active, TRUE) = TRUE;

  IF v_doctor_role IS NULL OR v_doctor_role NOT IN ('medical_officer', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only Medical Officers or Administrators can submit clinical dispositions.';
  END IF;

  IF p_status NOT IN ('admitted', 'not_admitted') THEN
    RAISE EXCEPTION 'Invalid status. Must be strictly admitted or not_admitted.';
  END IF;

  v_clean_status := p_status::medical_verification_status;

  -- Fetch existing verification record
  SELECT *
  INTO v_rec
  FROM public.sickbay_verifications
  WHERE id = p_verification_id;

  IF v_rec.id IS NULL THEN
    RAISE EXCEPTION 'Verification record not found.';
  END IF;

  -- Update verification record
  UPDATE public.sickbay_verifications
  SET
    status = v_clean_status,
    medical_officer_id = p_medical_officer_id,
    medical_officer_name = v_doctor_name,
    clinical_note = NULLIF(TRIM(p_clinical_note), ''),
    targeted_recipient_role = p_targeted_recipient_role,
    targeted_recipient_id = p_targeted_recipient_id,
    verified_at = NOW(),
    updated_at = NOW()
  WHERE id = p_verification_id;

  -- If status is 'not_admitted' or a clinical note is targeted, dispatch alert notification
  IF v_clean_status = 'not_admitted' OR (p_clinical_note IS NOT NULL AND TRIM(p_clinical_note) <> '') THEN
    v_notif_title := CASE
      WHEN v_clean_status = 'not_admitted' THEN '⚠️ SICKBAY NO-SHOW: ' || v_rec.cadet_name
      ELSE 'Clinical Update: ' || v_rec.cadet_name
    END;

    v_notif_content := CASE
      WHEN v_clean_status = 'not_admitted' THEN
        'Cadet ' || v_rec.cadet_name || ' (RC ' || v_rec.course_number || ', Squad ' || COALESCE(v_rec.squad, '-') ||
        ') was marked NOT ADMITTED at Sickbay by ' || v_doctor_name || ' (' || v_doctor_designation || ').' ||
        CASE WHEN p_clinical_note IS NOT NULL AND TRIM(p_clinical_note) <> '' THEN ' Note: "' || TRIM(p_clinical_note) || '"' ELSE '' END
      ELSE
        'Cadet ' || v_rec.cadet_name || ' (RC ' || v_rec.course_number || ') verified by ' || v_doctor_name ||
        ': "' || TRIM(p_clinical_note) || '"'
    END;

    -- Determine recipient
    v_recipient_id := p_targeted_recipient_id;

    IF v_recipient_id IS NULL AND p_targeted_recipient_role IS NOT NULL THEN
      IF p_targeted_recipient_role = 'commandant' THEN
        SELECT id INTO v_recipient_id FROM public.users WHERE role = 'commandant' AND LOWER(designation) NOT LIKE '%field%' LIMIT 1;
      ELSIF p_targeted_recipient_role = 'dfs' THEN
        SELECT id INTO v_recipient_id FROM public.users WHERE role = 'commandant' AND LOWER(designation) LIKE '%field%' LIMIT 1;
      ELSIF p_targeted_recipient_role = 'course_officer' THEN
        SELECT id INTO v_recipient_id FROM public.users WHERE role = 'course_officer' AND course_number = v_rec.course_number LIMIT 1;
      END IF;
    END IF;

    -- Insert system notification
    INSERT INTO public.notifications (
      type,
      title,
      content,
      read,
      officer_name,
      course_number,
      metadata,
      created_at
    ) VALUES (
      'sickbay_verification',
      v_notif_title,
      v_notif_content,
      FALSE,
      v_doctor_name,
      v_rec.course_number,
      jsonb_build_object(
        'verification_id', p_verification_id,
        'parade_record_id', v_rec.parade_record_id,
        'cadet_name', v_rec.cadet_name,
        'squad', v_rec.squad,
        'course_number', v_rec.course_number,
        'status', p_status,
        'clinical_note', p_clinical_note,
        'medical_officer_name', v_doctor_name,
        'targeted_role', p_targeted_recipient_role,
        'recipient_id', v_recipient_id
      ),
      NOW()
    );

    -- Log Disciplinary / Audit Event
    INSERT INTO public.audit_events (action_type, actor_id, actor_name, target_id, payload, created_at)
    VALUES (
      'SICKBAY_VERIFICATION_LOGGED',
      p_medical_officer_id,
      v_doctor_name,
      p_verification_id::TEXT,
      jsonb_build_object(
        'cadet_name', v_rec.cadet_name,
        'course_number', v_rec.course_number,
        'status', p_status,
        'clinical_note', p_clinical_note,
        'targeted_recipient_role', p_targeted_recipient_role
      ),
      NOW()
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'verification_id', p_verification_id,
    'clinical_status', p_status,
    'message', 'Clinical verification recorded successfully.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_sickbay_cadet(UUID, UUID, TEXT, TEXT, TEXT, UUID) TO authenticated, anon;

-- 9. Row Level Security Policies
ALTER TABLE public.sickbay_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read sickbay_verifications" ON public.sickbay_verifications;
CREATE POLICY "Allow authenticated users to read sickbay_verifications"
  ON public.sickbay_verifications
  FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Allow medical officers and admins to insert sickbay_verifications" ON public.sickbay_verifications;
CREATE POLICY "Allow medical officers and admins to insert sickbay_verifications"
  ON public.sickbay_verifications
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow medical officers and admins to update sickbay_verifications" ON public.sickbay_verifications;
CREATE POLICY "Allow medical officers and admins to update sickbay_verifications"
  ON public.sickbay_verifications
  FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

