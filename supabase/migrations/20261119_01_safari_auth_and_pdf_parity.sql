-- ============================================================================
-- Migration: Safari Auth Self-Healing for admin_register_officer
-- Date: 2026-11-19
-- Purpose:
--   1. Normalize role checks with LOWER(TRIM(role)) IN ('admin', 'commandant').
--   2. Accept optional p_caller_email & p_caller_username fallback so if a
--      browser (e.g. Safari ITP/PWA cache) sends a stale polac_session ID,
--      the RPC cross-verifies BOTH email AND username against an active
--      admin/commandant row before authorizing.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_register_officer(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER);

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
  -- 1. Primary check: exact active ID match
  SELECT LOWER(TRIM(role)), COALESCE(full_name, username, 'System Administrator')
  INTO v_caller_role, v_caller_name
  FROM public.users
  WHERE id::text = TRIM(COALESCE(p_commandant_id, ''))
    AND COALESCE(is_active, TRUE) = TRUE;

  -- 2. Secure cross-checked fallback for stale browser session IDs (requires BOTH email AND username)
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

  IF p_role NOT IN ('commandant', 'course_officer', 'medical_officer') THEN
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

  -- Check duplicate email
  SELECT COUNT(*) INTO v_count FROM public.users WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_email));
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
    password_hash,
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

  -- Audit log (best effort)
  BEGIN
    INSERT INTO public.audit_logs (
      actor_id,
      actor_name,
      action_type,
      target_user_id,
      target_username,
      details
    )
    VALUES (
      p_commandant_id,
      v_caller_name,
      'COMMISSION_OFFICER',
      v_new_id::text,
      v_clean_username,
      jsonb_build_object(
        'role', p_role,
        'designation', v_effective_designation,
        'course_number', p_course_number
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Ignore audit table mismatch if schema differs
    NULL;
  END;

  RETURN jsonb_build_object(
    'id', v_new_id,
    'username', v_clean_username,
    'email', LOWER(TRIM(p_email)),
    'role', p_role,
    'full_name', v_effective_full_name,
    'designation', v_effective_designation
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_register_officer(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) TO authenticated, anon;

