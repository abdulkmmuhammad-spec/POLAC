-- ============================================================================
-- MIGRATION: 20261115_01_admin_and_senior_officers_rbac.sql
-- DATE: 2026-11-15
-- OBJECTIVE:
--   1. Decouple System Administrator ('admin') and Executive/Senior Officers ('commandant').
--   2. Add dedicated `designation` TEXT and `session_version` INTEGER columns to `public.users`
--      so `course_name` remains strictly for Regular Courses / 'Academy HQ'.
--   3. Provision default System Admin account (`admin@gmail.com` / `password`) while
--      preserving the existing Commandant login credentials untouched.
--   4. Add `trg_prevent_last_admin_lockout` to prevent deactivating, demoting, or deleting
--      the sole active System Administrator.
--   5. Upgrade `admin_override_credentials` with current-password verification,
--      `designation` updates, `session_version` increment, and `auth.sessions` purge.
--   6. Upgrade `admin_register_officer` to allow Admin to commission multiple Senior
--      Officers (e.g., Director Field Studies) with custom `designation`.
--   7. Add `issuer_role_title` to `public.commandant_remarks` and enforce strict RLS +
--      trigger guards so only `role = 'commandant'` can INSERT remarks and only the
--      strict UUID owner (`commandant_id`) can follow up or resolve their own thread.
-- ============================================================================

-- 1. Schema Expansions on public.users & public.audit_events
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS designation TEXT DEFAULT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS credentials_updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS target_id TEXT DEFAULT NULL;

-- Expand any existing role CHECK constraint on public.users to include 'admin'
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
    CHECK (role IN ('admin', 'commandant', 'course_officer'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Backfill designations and preserve course_name semantics on existing users
DO $$
BEGIN
  PERFORM set_config('app.allow_identity_override', 'true', true);

  UPDATE public.users
  SET
    designation = COALESCE(NULLIF(TRIM(designation), ''), 'Commandant'),
    course_name = 'Academy HQ'
  WHERE role = 'commandant';

  UPDATE public.users
  SET
    designation = COALESCE(NULLIF(TRIM(designation), ''), 'Course Officer')
  WHERE role = 'course_officer';

  -- Provision or update the System Administrator account (admin@gmail.com / password)
  IF EXISTS (SELECT 1 FROM public.users WHERE LOWER(email) = 'admin@gmail.com') THEN
    UPDATE public.users
    SET
      role = 'admin',
      password = COALESCE(NULLIF(password, ''), 'password'),
      username = COALESCE(NULLIF(username, ''), 'admin'),
      full_name = COALESCE(NULLIF(full_name, ''), 'SYSTEM ADMINISTRATOR'),
      designation = 'System Administrator',
      course_name = 'Academy HQ',
      course_number = NULL,
      is_active = TRUE
    WHERE LOWER(email) = 'admin@gmail.com';
  ELSE
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
      'admin@gmail.com',
      'password',
      'admin',
      'SYSTEM ADMINISTRATOR',
      'admin',
      'System Administrator',
      'Academy HQ',
      NULL,
      0,
      TRUE,
      1
    );
  END IF;
END $$;

-- 3. Trigger: Prevent Lockout of Sole Active System Administrator
CREATE OR REPLACE FUNCTION public.prevent_last_admin_lockout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining_admins INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin' AND COALESCE(OLD.is_active, TRUE) = TRUE THEN
      SELECT COUNT(*) INTO v_remaining_admins
      FROM public.users
      WHERE role = 'admin'
        AND COALESCE(is_active, TRUE) = TRUE
        AND id != OLD.id;

      IF v_remaining_admins < 1 THEN
        RAISE EXCEPTION 'LOCKOUT_PREVENTION: Cannot delete the sole active System Administrator account.';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'admin' AND COALESCE(OLD.is_active, TRUE) = TRUE THEN
      IF NEW.role != 'admin' OR COALESCE(NEW.is_active, TRUE) = FALSE THEN
        SELECT COUNT(*) INTO v_remaining_admins
        FROM public.users
        WHERE role = 'admin'
          AND COALESCE(is_active, TRUE) = TRUE
          AND id != OLD.id;

        IF v_remaining_admins < 1 THEN
          RAISE EXCEPTION 'LOCKOUT_PREVENTION: Cannot deactivate or demote the sole active System Administrator account.';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_admin_lockout ON public.users;
CREATE TRIGGER trg_prevent_last_admin_lockout
  BEFORE UPDATE OR DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_last_admin_lockout();

-- 4. Update get_commandant_parade_overview to Authorize Both 'admin' and 'commandant'
CREATE OR REPLACE FUNCTION public.get_commandant_parade_overview(p_viewer_id UUID)
RETURNS SETOF public.parade_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id::text = p_viewer_id::text AND COALESCE(is_active, TRUE) = TRUE;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'commandant') THEN
    RAISE EXCEPTION 'Unauthorized: Only Admin or Senior Officer accounts can view the global overview.';
  END IF;

  RETURN QUERY
  SELECT * FROM public.parade_records;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_commandant_parade_overview(UUID) TO anon, authenticated;

-- 5. Upgrade admin_override_credentials with Current-Password Check & Session Invalidation
DROP FUNCTION IF EXISTS admin_override_credentials(UUID, UUID, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS admin_override_credentials(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_override_credentials(
  p_admin_id UUID,
  p_target_user_id UUID,
  p_new_email TEXT,
  p_new_course_assignment TEXT,
  p_audit_action_details TEXT,
  p_new_password TEXT DEFAULT NULL,
  p_current_password TEXT DEFAULT NULL,
  p_new_designation TEXT DEFAULT NULL
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
  v_target_role VARCHAR;
  v_old_email VARCHAR;
  v_old_course INTEGER;
  v_old_designation TEXT;
  v_new_session_version INTEGER;
BEGIN
  -- 1. Verify Admin Authority & Current Password (if provided)
  SELECT role, COALESCE(full_name, username, 'System Administrator'), password
  INTO v_admin_role, v_admin_name, v_admin_password
  FROM public.users
  WHERE id = p_admin_id AND COALESCE(is_active, TRUE) = TRUE;

  IF v_admin_role IS NULL OR v_admin_role NOT IN ('admin', 'commandant') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only the System Administrator can override credentials.';
  END IF;

  IF p_current_password IS NOT NULL AND TRIM(p_current_password) != '' THEN
    IF v_admin_password IS DISTINCT FROM p_current_password THEN
      RAISE EXCEPTION 'INVALID_CURRENT_PASSWORD: Current administrator password verification failed.';
    END IF;
  END IF;

  -- 2. Capture Target State
  SELECT role, email, course_number, designation
  INTO v_target_role, v_old_email, v_old_course, v_old_designation
  FROM public.users
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found.';
  END IF;

  -- 3. Pre-validate email uniqueness
  IF p_new_email IS NOT NULL AND TRIM(p_new_email) != '' AND LOWER(TRIM(p_new_email)) != LOWER(COALESCE(v_old_email, '')) THEN
    IF EXISTS (
      SELECT 1 FROM public.users
      WHERE LOWER(email) = LOWER(TRIM(p_new_email))
        AND id != p_target_user_id
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_EMAIL: The email address "%" is already assigned to another user account.', TRIM(p_new_email);
    END IF;
  END IF;

  PERFORM set_config('app.allow_identity_override', 'true', true);

  -- 4. Execute Atomic Update & Increment session_version to Invalidate Active Sessions
  UPDATE public.users
  SET
    email = COALESCE(NULLIF(TRIM(p_new_email), ''), email),
    password = COALESCE(NULLIF(p_new_password, ''), password),
    designation = COALESCE(NULLIF(TRIM(p_new_designation), ''), designation),
    course_number = CASE
      WHEN v_target_role IN ('admin', 'commandant') THEN NULL
      ELSE NULLIF(COALESCE(p_new_course_assignment, course_number::TEXT), 'nil')::INTEGER
    END,
    course_name = CASE
      WHEN v_target_role IN ('admin', 'commandant') THEN 'Academy HQ'
      WHEN p_new_course_assignment IS NOT NULL AND p_new_course_assignment != 'nil' AND TRIM(p_new_course_assignment) != '' THEN 'REGULAR COURSE ' || TRIM(p_new_course_assignment)
      WHEN p_new_course_assignment = 'nil' THEN NULL
      ELSE course_name
    END,
    session_version = COALESCE(session_version, 1) + 1,
    credentials_updated_at = NOW()
  WHERE id = p_target_user_id
  RETURNING session_version INTO v_new_session_version;

  -- 5. Purge any active Supabase Auth sessions / refresh tokens for target user
  BEGIN
    DELETE FROM auth.refresh_tokens WHERE user_id::text = p_target_user_id::text;
    DELETE FROM auth.sessions WHERE user_id = p_target_user_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 6. Log Forensic Audit Event
  INSERT INTO public.audit_events (action_type, actor_id, actor_name, payload, created_at)
  VALUES (
    'CREDENTIAL_OVERRIDE',
    p_admin_id,
    v_admin_name,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'changes', jsonb_build_object(
        'old_email', v_old_email,
        'new_email', p_new_email,
        'old_course', v_old_course,
        'new_course', p_new_course_assignment,
        'old_designation', v_old_designation,
        'new_designation', p_new_designation,
        'password_updated', p_new_password IS NOT NULL,
        'invalidated_session_version', v_new_session_version
      ),
      'details', p_audit_action_details
    ),
    NOW()
  );

  -- 7. Insert System Notification (Scoped to target Course Officer / Admin)
  INSERT INTO public.notifications (id, type, title, content, timestamp, read, officer_name, course_number)
  VALUES (
    gen_random_uuid(),
    'profile_update',
    'Security Profile Updated',
    'An administrator has updated your official credential mappings.',
    NOW(),
    FALSE,
    v_admin_name,
    CASE
      WHEN v_target_role = 'course_officer' THEN NULLIF(COALESCE(p_new_course_assignment, v_old_course::TEXT), 'nil')::INTEGER
      ELSE NULL
    END
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'sessionVersion', v_new_session_version,
    'message', 'Credentials updated, active sessions invalidated, and forensic audit logged.'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Security Transaction Terminated: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_override_credentials(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;

-- 6. Upgrade admin_register_officer to Support Commissioning Senior Officers (e.g., Director Field Studies)
DROP FUNCTION IF EXISTS public.admin_register_officer(TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_register_officer(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER);

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

  IF p_role NOT IN ('commandant', 'course_officer') THEN
    RAISE EXCEPTION 'Invalid role specified: %. Must be commandant (Senior Officer) or course_officer.', p_role;
  END IF;

  -- Enforce 5 active officer cap strictly on course_officer role
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

-- 7. Ensure course_purge_snapshots Table Exists & Update Bulk Course Purge RPC to Authorize 'admin'
CREATE TABLE IF NOT EXISTS public.course_purge_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_numbers INTEGER[] NOT NULL DEFAULT '{}',
  purge_mode TEXT NOT NULL DEFAULT 'SOFT_DELETE',
  cadet_count INTEGER NOT NULL DEFAULT 0,
  parade_records_affected INTEGER NOT NULL DEFAULT 0,
  disciplinary_logs_affected INTEGER NOT NULL DEFAULT 0,
  is_recoverable BOOLEAN NOT NULL DEFAULT TRUE,
  snapshot_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  actor_id UUID NULL,
  actor_name TEXT NULL,
  client_ip TEXT NULL,
  confirmation_phrase TEXT NULL,
  restored_at TIMESTAMPTZ NULL,
  restored_by_name TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE ON public.course_purge_snapshots TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.execute_bulk_course_purge(
  p_course_numbers INTEGER[],
  p_actor_id UUID,
  p_actor_name TEXT,
  p_purge_mode TEXT DEFAULT 'SOFT_DELETE',
  p_purge_attendance BOOLEAN DEFAULT FALSE,
  p_client_ip TEXT DEFAULT 'LOCAL_CLIENT',
  p_confirmation_phrase TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_authorized BOOLEAN := FALSE;
  v_resolved_actor_id UUID := NULL;
  v_resolved_actor_name TEXT;
  v_snapshot_id UUID := NULL;
  v_snapshot_json JSONB := '[]'::jsonb;
  v_purged_cadets_count INTEGER := 0;
  v_purged_parades_count INTEGER := 0;
  v_purged_details_count INTEGER := 0;
BEGIN
  IF p_course_numbers IS NULL OR array_length(p_course_numbers, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one Regular Course (RC) must be selected for purge.';
  END IF;

  IF p_purge_mode NOT IN ('SOFT_DELETE', 'HARD_DELETE') THEN
    RAISE EXCEPTION 'Invalid purge mode: %. Expected SOFT_DELETE or HARD_DELETE.', p_purge_mode;
  END IF;

  IF p_actor_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE id = p_actor_id AND role IN ('admin', 'commandant') AND COALESCE(is_active, TRUE) = TRUE) THEN
      v_is_authorized := TRUE;
      v_resolved_actor_id := p_actor_id;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: Only the System Administrator can execute bulk course purge operations.';
  END IF;

  v_resolved_actor_name := COALESCE(NULLIF(TRIM(p_actor_name), ''), 'SYSTEM ADMINISTRATOR');

  PERFORM set_config('app.suppress_audit', 'true', true);

  SELECT
    COALESCE(jsonb_agg(to_jsonb(cr) ORDER BY cr.course_number ASC, cr.squad ASC, cr.name ASC), '[]'::jsonb),
    COUNT(*)
  INTO v_snapshot_json, v_purged_cadets_count
  FROM public.cadet_registry cr
  WHERE cr.course_number = ANY(p_course_numbers);

  IF p_purge_attendance THEN
    SELECT COUNT(*)
    INTO v_purged_details_count
    FROM public.cadet_details cd
    INNER JOIN public.parade_records pr ON pr.id = cd.record_id
    WHERE pr.course_number = ANY(p_course_numbers);

    DELETE FROM public.cadet_details
    WHERE record_id IN (
      SELECT id FROM public.parade_records WHERE course_number = ANY(p_course_numbers)
    );

    DELETE FROM public.parade_records
    WHERE course_number = ANY(p_course_numbers);
    GET DIAGNOSTICS v_purged_parades_count = ROW_COUNT;
  ELSE
    SELECT COUNT(*)
    INTO v_purged_parades_count
    FROM public.parade_records
    WHERE course_number = ANY(p_course_numbers);

    SELECT COUNT(*)
    INTO v_purged_details_count
    FROM public.cadet_details cd
    INNER JOIN public.parade_records pr ON pr.id = cd.record_id
    WHERE pr.course_number = ANY(p_course_numbers);
  END IF;

  INSERT INTO public.course_purge_snapshots (
    course_numbers,
    purge_mode,
    cadet_count,
    parade_records_affected,
    disciplinary_logs_affected,
    is_recoverable,
    snapshot_data,
    actor_id,
    actor_name,
    client_ip,
    confirmation_phrase
  ) VALUES (
    p_course_numbers,
    p_purge_mode,
    v_purged_cadets_count,
    v_purged_parades_count,
    v_purged_details_count,
    (p_purge_mode = 'SOFT_DELETE'),
    CASE WHEN p_purge_mode = 'SOFT_DELETE' THEN v_snapshot_json ELSE '[]'::jsonb END,
    v_resolved_actor_id,
    v_resolved_actor_name,
    COALESCE(p_client_ip, 'LOCAL_CLIENT'),
    p_confirmation_phrase
  )
  RETURNING id INTO v_snapshot_id;

  DELETE FROM public.cadet_registry
  WHERE course_number = ANY(p_course_numbers);

  INSERT INTO public.audit_events (
    actor_id,
    actor_name,
    action_type,
    target_id,
    payload,
    created_at
  ) VALUES (
    v_resolved_actor_id,
    v_resolved_actor_name,
    'COURSE_BULK_PURGED',
    'RC_' || array_to_string(p_course_numbers, '_'),
    jsonb_build_object(
      'snapshot_id', v_snapshot_id,
      'course_numbers', p_course_numbers,
      'purge_mode', p_purge_mode,
      'purge_attendance', p_purge_attendance,
      'purged_cadet_count', v_purged_cadets_count,
      'parade_records_affected', v_purged_parades_count,
      'disciplinary_logs_affected', v_purged_details_count,
      'is_recoverable', (p_purge_mode = 'SOFT_DELETE'),
      'client_ip', COALESCE(p_client_ip, 'LOCAL_CLIENT')
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'snapshotId', v_snapshot_id,
    'purgedCadetCount', v_purged_cadets_count,
    'paradeRecordsAffected', v_purged_parades_count,
    'disciplinaryLogsAffected', v_purged_details_count,
    'courseNumbers', p_course_numbers,
    'purgeMode', p_purge_mode,
    'isRecoverable', (p_purge_mode = 'SOFT_DELETE'),
    'timestamp', NOW()
  );
END;
$$;

-- 8. Non-Overlapping Multi-Authority Remarks Schema, RLS & Trigger Enforcement
CREATE TABLE IF NOT EXISTS public.commandant_remarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id TEXT NOT NULL,
  commandant_id UUID NULL,
  commandant_name TEXT NOT NULL DEFAULT 'COMMANDANT',
  issuer_role_title TEXT NOT NULL DEFAULT 'Commandant',
  course_officer_id UUID NULL,
  course_officer_name TEXT NULL,
  course_number INTEGER NULL,
  parade_type TEXT NULL DEFAULT 'muster',
  parade_date TEXT NULL,
  remark_text TEXT NOT NULL,
  officer_response TEXT NULL,
  responded_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_at TIMESTAMPTZ NULL,
  thread JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.commandant_remarks ADD COLUMN IF NOT EXISTS issuer_role_title TEXT NOT NULL DEFAULT 'Commandant';
ALTER TABLE public.commandant_remarks ADD COLUMN IF NOT EXISTS thread JSONB NOT NULL DEFAULT '[]'::jsonb;

GRANT SELECT, INSERT, UPDATE ON public.commandant_remarks TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_commandant_remarks_submission_id
  ON public.commandant_remarks (submission_id);

CREATE INDEX IF NOT EXISTS idx_commandant_remarks_course_number
  ON public.commandant_remarks (course_number, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_commandant_remarks_commandant_id
  ON public.commandant_remarks (commandant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_commandant_remarks_rbac()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role TEXT;
  v_actor_designation TEXT;
  v_jwt_uid UUID;
BEGIN
  v_jwt_uid := auth.uid();

  IF TG_OP = 'INSERT' THEN
    IF NEW.commandant_id IS NULL THEN
      RAISE EXCEPTION 'RBAC_VIOLATION: commandant_id is required when issuing a parade remark.';
    END IF;

    IF v_jwt_uid IS NOT NULL AND NEW.commandant_id != v_jwt_uid THEN
      RAISE EXCEPTION 'RBAC_VIOLATION: commandant_id must match authenticated user.';
    END IF;

    SELECT role, COALESCE(NULLIF(TRIM(designation), ''), 'Commandant')
    INTO v_actor_role, v_actor_designation
    FROM public.users
    WHERE id = NEW.commandant_id AND COALESCE(is_active, TRUE) = TRUE;

    IF v_actor_role IS NULL OR v_actor_role != 'commandant' THEN
      RAISE EXCEPTION 'RBAC_VIOLATION: Only Senior Officers (Commandant / Director Field Studies) may issue parade remarks. Admin accounts have view-only access.';
    END IF;

    NEW.issuer_role_title := COALESCE(NULLIF(TRIM(NEW.issuer_role_title), ''), v_actor_designation);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Prevent mutating thread ownership
    IF OLD.commandant_id IS NOT NULL AND NEW.commandant_id IS DISTINCT FROM OLD.commandant_id THEN
      RAISE EXCEPTION 'RBAC_VIOLATION: Cannot reassign ownership of an existing parade remark thread.';
    END IF;

    -- Case A: Senior Officer Follow-Up or Resolution
    IF (NEW.remark_text IS DISTINCT FROM OLD.remark_text)
       OR (NEW.status = 'resolved' AND OLD.status != 'resolved')
       OR (NEW.thread IS DISTINCT FROM OLD.thread) THEN

      IF v_jwt_uid IS NOT NULL AND OLD.commandant_id IS NOT NULL AND v_jwt_uid != OLD.commandant_id THEN
        RAISE EXCEPTION 'RBAC_VIOLATION: Only the issuing Senior Officer can follow up or resolve their own remark thread.';
      END IF;

      IF OLD.commandant_id IS NOT NULL THEN
        SELECT role INTO v_actor_role
        FROM public.users
        WHERE id = OLD.commandant_id AND COALESCE(is_active, TRUE) = TRUE;

        IF v_actor_role IS NULL OR v_actor_role != 'commandant' THEN
          RAISE EXCEPTION 'RBAC_VIOLATION: Only an active Senior Officer can update or resolve this remark thread.';
        END IF;
      END IF;
    END IF;

    -- Case B: Course Officer Justification Response
    IF (NEW.officer_response IS DISTINCT FROM OLD.officer_response AND NEW.officer_response IS NOT NULL) THEN
      IF v_jwt_uid IS NOT NULL THEN
        SELECT role INTO v_actor_role FROM public.users WHERE id = v_jwt_uid AND COALESCE(is_active, TRUE) = TRUE;
        IF v_actor_role IS NOT NULL AND v_actor_role != 'course_officer' THEN
          RAISE EXCEPTION 'RBAC_VIOLATION: Only Course Officers can submit justification responses.';
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_commandant_remarks_rbac ON public.commandant_remarks;
CREATE TRIGGER trg_enforce_commandant_remarks_rbac
  BEFORE INSERT OR UPDATE ON public.commandant_remarks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_commandant_remarks_rbac();

-- RLS Policies on public.commandant_remarks
ALTER TABLE public.commandant_remarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to commandant_remarks" ON public.commandant_remarks;
CREATE POLICY "Allow read access to commandant_remarks"
  ON public.commandant_remarks
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert access to commandant_remarks" ON public.commandant_remarks;
CREATE POLICY "Allow insert access to commandant_remarks"
  ON public.commandant_remarks
  FOR INSERT
  WITH CHECK (
    commandant_id IS NOT NULL
    AND (auth.uid() IS NULL OR commandant_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = commandant_remarks.commandant_id
        AND u.role = 'commandant'
        AND COALESCE(u.is_active, TRUE) = TRUE
    )
  );

DROP POLICY IF EXISTS "Allow update access to commandant_remarks" ON public.commandant_remarks;
CREATE POLICY "Allow update access to commandant_remarks"
  ON public.commandant_remarks
  FOR UPDATE
  USING (
    auth.uid() IS NULL
    OR commandant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'course_officer'
        AND COALESCE(u.is_active, TRUE) = TRUE
    )
  )
  WITH CHECK (
    auth.uid() IS NULL
    OR commandant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'course_officer'
        AND COALESCE(u.is_active, TRUE) = TRUE
    )
  );

-- =============================================================================
-- 10. CADET MISCONDUCT ALERTS (RLS & 5-Day / Same-Day Multi-Activity Trigger)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cadet_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadet_name TEXT NOT NULL,
  squad TEXT NOT NULL,
  course_number INT,
  alert_level TEXT CHECK (alert_level IN ('CRITICAL', 'FLAGRANT')) NOT NULL,
  status TEXT CHECK (status IN ('ACTIVE', 'RESOLVED')) NOT NULL DEFAULT 'ACTIVE',
  trigger_count INT NOT NULL DEFAULT 3,
  acknowledged_by TEXT,
  resolution_notes TEXT,
  commandant_directive TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.cadet_alerts ADD COLUMN IF NOT EXISTS commandant_directive TEXT;

ALTER TABLE public.cadet_alerts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cadet_alerts TO anon, authenticated;

DROP POLICY IF EXISTS "Allow authenticated read/write access" ON public.cadet_alerts;
CREATE POLICY "Allow authenticated read/write access"
  ON public.cadet_alerts
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.check_parade_absences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_absence_count INT;
  v_course_number INT;
  v_parade_date DATE;
  v_alert_level TEXT;
  v_existing_alert_id UUID;
BEGIN
  IF LOWER(TRIM(NEW.status)) != 'absent' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(date::date, CURRENT_DATE), COALESCE(course_number::int, year_group::int)
  INTO v_parade_date, v_course_number
  FROM public.parade_records
  WHERE id = NEW.record_id
  LIMIT 1;

  v_parade_date := COALESCE(v_parade_date, CURRENT_DATE);

  SELECT COUNT(*) INTO v_absence_count
  FROM public.cadet_details cd
  JOIN public.parade_records pr ON cd.record_id = pr.id
  WHERE LOWER(TRIM(cd.name)) = LOWER(TRIM(NEW.name))
    AND LOWER(TRIM(cd.squad)) = LOWER(TRIM(NEW.squad))
    AND LOWER(TRIM(cd.status)) = 'absent'
    AND pr.date::date >= (v_parade_date - INTERVAL '5 days')
    AND pr.date::date <= (v_parade_date + INTERVAL '1 day');

  IF v_absence_count >= 3 THEN
    IF v_absence_count >= 4 THEN
      v_alert_level := 'FLAGRANT';
    ELSE
      v_alert_level := 'CRITICAL';
    END IF;

    SELECT id INTO v_existing_alert_id
    FROM public.cadet_alerts
    WHERE LOWER(TRIM(cadet_name)) = LOWER(TRIM(NEW.name))
      AND LOWER(TRIM(squad)) = LOWER(TRIM(NEW.squad))
      AND status = 'ACTIVE'
    LIMIT 1;

    IF v_existing_alert_id IS NOT NULL THEN
      UPDATE public.cadet_alerts
      SET trigger_count = v_absence_count,
          alert_level = CASE WHEN v_absence_count >= 4 THEN 'FLAGRANT' ELSE alert_level END,
          updated_at = timezone('utc'::text, now())
      WHERE id = v_existing_alert_id;
    ELSE
      INSERT INTO public.cadet_alerts (
        cadet_name, squad, course_number, alert_level, status, trigger_count
      ) VALUES (
        TRIM(NEW.name), TRIM(NEW.squad), v_course_number, v_alert_level, 'ACTIVE', v_absence_count
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_absences ON public.cadet_details;
CREATE TRIGGER trigger_check_absences
  AFTER INSERT ON public.cadet_details
  FOR EACH ROW
  EXECUTE FUNCTION public.check_parade_absences();

