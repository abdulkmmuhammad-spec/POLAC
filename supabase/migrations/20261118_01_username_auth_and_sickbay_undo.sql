-- ============================================================================
-- MIGRATION: 20261118_01_username_auth_and_sickbay_undo.sql
-- DATE: 2026-11-18
-- OBJECTIVE:
--   1. Enforce lowercase, unique usernames in admin_register_officer with a
--      clear "Username is already taken." error.
--   2. Allow verify_sickbay_cadet to revert back to 'pending_verification'
--      for the 4-second Undo disposition toast.
-- ============================================================================

-- 1. Unique case-insensitive index on username (ignoring NULL/empty)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower_unique
  ON public.users (LOWER(TRIM(username)))
  WHERE username IS NOT NULL AND TRIM(username) <> '';

-- 2. Upgrade admin_register_officer to store LOWER(TRIM(p_username)) & check uniqueness
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
  v_clean_username TEXT;
  v_new_id UUID;
BEGIN
  SELECT role, COALESCE(full_name, username, 'System Administrator')
  INTO v_caller_role, v_caller_name
  FROM public.users
  WHERE id::text = p_commandant_id AND COALESCE(is_active, TRUE) = TRUE;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'commandant') THEN
    RAISE EXCEPTION 'Unauthorized: Only the System Administrator can add new officers.';
  END IF;

  IF p_role NOT IN ('commandant', 'course_officer', 'medical_officer') THEN
    RAISE EXCEPTION 'Invalid role specified: %.', p_role;
  END IF;

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

  -- Check duplicate username
  v_clean_username := LOWER(TRIM(COALESCE(p_username, '')));
  IF v_clean_username = '' THEN
    RAISE EXCEPTION 'Username is required.';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.users WHERE LOWER(TRIM(username)) = v_clean_username;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Username is already taken.';
  END IF;

  v_effective_full_name := COALESCE(NULLIF(TRIM(p_full_name), ''), v_clean_username);

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
    id, email, password, username, full_name, role, designation,
    course_name, course_number, total_cadets, is_active, session_version
  ) VALUES (
    gen_random_uuid(),
    LOWER(TRIM(p_email)),
    p_password,
    v_clean_username,
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
      'username', v_clean_username,
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
    'message', 'Officer added successfully.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_register_officer(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated, anon;

-- 3. Upgrade verify_sickbay_cadet to allow Undo back to 'pending_verification'
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
  v_clean_note TEXT;
  v_initial_messages JSONB;
BEGIN
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

  IF p_status NOT IN ('pending_verification', 'admitted', 'not_admitted') THEN
    RAISE EXCEPTION 'Invalid status.';
  END IF;

  v_clean_status := p_status::medical_verification_status;
  v_clean_note := NULLIF(TRIM(p_clinical_note), '');

  SELECT * INTO v_rec FROM public.sickbay_verifications WHERE id = p_verification_id;
  IF v_rec.id IS NULL THEN
    RAISE EXCEPTION 'Verification record not found.';
  END IF;

  IF v_clean_status = 'pending_verification' THEN
    UPDATE public.sickbay_verifications
    SET
      status = 'pending_verification',
      medical_officer_id = NULL,
      medical_officer_name = NULL,
      verified_at = NULL,
      updated_at = NOW()
    WHERE id = p_verification_id;

    RETURN jsonb_build_object(
      'status', 'success',
      'verification_id', p_verification_id,
      'disposition', 'pending_verification'
    );
  END IF;

  v_initial_messages := COALESCE(v_rec.messages, '[]'::jsonb);
  IF v_clean_note IS NOT NULL THEN
    v_initial_messages := v_initial_messages || jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::TEXT,
        'senderId', p_medical_officer_id::TEXT,
        'senderName', v_doctor_name,
        'senderRole', 'medical_officer',
        'text', v_clean_note,
        'createdAt', NOW()
      )
    );
  END IF;

  UPDATE public.sickbay_verifications
  SET
    status = v_clean_status,
    medical_officer_id = p_medical_officer_id,
    medical_officer_name = v_doctor_name,
    clinical_note = COALESCE(v_clean_note, clinical_note),
    targeted_recipient_role = COALESCE(p_targeted_recipient_role, targeted_recipient_role),
    targeted_recipient_id = COALESCE(p_targeted_recipient_id, targeted_recipient_id),
    messages = v_initial_messages,
    thread_status = CASE WHEN v_clean_status = 'not_admitted' THEN 'open' ELSE thread_status END,
    verified_at = NOW(),
    updated_at = NOW()
  WHERE id = p_verification_id;

  IF v_clean_status = 'not_admitted' OR v_clean_note IS NOT NULL THEN
    v_notif_title := CASE
      WHEN v_clean_status = 'not_admitted' THEN '⚠️ SICKBAY NO-SHOW: ' || v_rec.cadet_name
      ELSE 'Clinical Update: ' || v_rec.cadet_name
    END;

    v_notif_content := CASE
      WHEN v_clean_status = 'not_admitted' THEN
        'Cadet ' || v_rec.cadet_name || ' (RC ' || v_rec.course_number || ', Squad ' || COALESCE(v_rec.squad, '-') ||
        ') was marked NOT ADMITTED at Sickbay by ' || v_doctor_name || ' (' || v_doctor_designation || ').' ||
        CASE WHEN v_clean_note IS NOT NULL THEN ' Note: "' || v_clean_note || '"' ELSE '' END
      ELSE
        'Cadet ' || v_rec.cadet_name || ' (RC ' || v_rec.course_number || ') verified by ' || v_doctor_name ||
        ': "' || v_clean_note || '"'
    END;

    v_recipient_id := p_targeted_recipient_id;
    IF v_recipient_id IS NULL AND p_targeted_recipient_role IS NOT NULL THEN
      IF p_targeted_recipient_role = 'commandant' THEN
        SELECT id INTO v_recipient_id FROM public.users WHERE role = 'commandant' AND LOWER(COALESCE(designation, '')) NOT LIKE '%field%' LIMIT 1;
      ELSIF p_targeted_recipient_role = 'dfs' THEN
        SELECT id INTO v_recipient_id FROM public.users WHERE role = 'commandant' AND LOWER(COALESCE(designation, '')) LIKE '%field%' LIMIT 1;
      ELSIF p_targeted_recipient_role = 'course_officer' THEN
        SELECT id INTO v_recipient_id FROM public.users WHERE role = 'course_officer' AND course_number = v_rec.course_number LIMIT 1;
      END IF;
    END IF;

    INSERT INTO public.notifications (
      type, title, content, read, officer_name, course_number, metadata, created_at
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
        'clinical_note', v_clean_note,
        'medical_officer_name', v_doctor_name,
        'targeted_role', p_targeted_recipient_role,
        'recipient_id', v_recipient_id
      ),
      NOW()
    );

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
        'clinical_note', v_clean_note,
        'targeted_recipient_role', p_targeted_recipient_role
      ),
      NOW()
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'verification_id', p_verification_id,
    'disposition', p_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_sickbay_cadet(UUID, UUID, TEXT, TEXT, TEXT, UUID) TO authenticated, anon;

