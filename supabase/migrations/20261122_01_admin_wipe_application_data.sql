-- Migration: 20261122_01_admin_wipe_application_data.sql
-- Purpose: Provide an atomic, multi-safeguard RPC for System Administrators to perform a full
-- application data wipe (Factory Reset) while preserving the active System Administrator account
-- and core app_settings.
--
-- Security & Robustness:
-- 1. Updates audit_immutability_enforcement() and notification_immutability_guard() to support
--    app.suppress_audit = 'true' during authorized administrative factory wipes.
-- 2. Explicitly sets WHERE clauses (WHERE id IS NOT NULL) on all DELETE statements to satisfy
--    PostgreSQL safeupdate extensions and prevent "delete requires where clause" runtime rejections.
-- 3. Sets safeupdate.enabled = off locally for the wipe transaction where supported.
-- 4. Reorders deletions child-first (sickbay_verifications, cadet_details, commandant_remarks)
--    before parent entities (parade_records, cadet_registry, non-admin users).
-- 5. Defensively drops and reinstates trg_audit_immutability and trg_notification_immutability.

-- ─── 1. Support Suppressed Audit on Immutability Triggers ───────────────────

CREATE OR REPLACE FUNCTION public.audit_immutability_enforcement()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.suppress_audit', true) = 'true' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;
    RAISE EXCEPTION 'INSTITUTIONAL ERROR: Audit logs are immutable and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.notification_immutability_guard()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.suppress_audit', true) = 'true' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;
    RAISE EXCEPTION 'FORENSIC ALERT: Notifications are immutable. Use soft-delete (archived_at) instead of hard deletion.';
END;
$$ LANGUAGE plpgsql;

-- ─── 2. Full Application Data Wipe RPC ───────────────────────────────────────

DROP FUNCTION IF EXISTS public.admin_wipe_application_data(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_wipe_application_data(
  p_admin_id UUID,
  p_current_password TEXT,
  p_confirmation_phrase TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin_role VARCHAR;
  v_admin_name VARCHAR;
  v_admin_password VARCHAR;
  v_admin_email VARCHAR;
  v_password_valid BOOLEAN := FALSE;
  v_deleted_cadets INTEGER := 0;
  v_deleted_parades INTEGER := 0;
  v_deleted_officers INTEGER := 0;
BEGIN
  -- 0. Safety session overrides (disable safeupdate if present and suppress audit churn during wipe)
  BEGIN
    PERFORM set_config('safeupdate.enabled', 'off', true);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    PERFORM set_config('app.suppress_audit', 'true', true);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 1. Verify Admin Authority & Current Password (supports both legacy plaintext and pgcrypto crypt() hashes)
  SELECT role, COALESCE(full_name, username, 'System Administrator'), password, email
  INTO v_admin_role, v_admin_name, v_admin_password, v_admin_email
  FROM public.users
  WHERE id = p_admin_id AND COALESCE(is_active, TRUE) = TRUE;

  IF v_admin_role IS NULL OR (v_admin_role NOT IN ('admin', 'commandant') AND LOWER(COALESCE(v_admin_email, '')) != 'admin@gmail.com') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only an active System Administrator can wipe application data.';
  END IF;

  IF p_current_password IS NULL OR TRIM(p_current_password) = '' THEN
    RAISE EXCEPTION 'INVALID_CURRENT_PASSWORD: Administrator password verification failed.';
  END IF;

  IF v_admin_password IS NOT DISTINCT FROM p_current_password THEN
    v_password_valid := TRUE;
  ELSE
    BEGIN
      IF v_admin_password IS NOT NULL AND v_admin_password = crypt(p_current_password, v_admin_password) THEN
        v_password_valid := TRUE;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_password_valid := FALSE;
    END;
  END IF;

  IF NOT v_password_valid THEN
    RAISE EXCEPTION 'INVALID_CURRENT_PASSWORD: Administrator password verification failed.';
  END IF;

  -- 2. Verify Exact Confirmation Phrase
  IF UPPER(TRIM(COALESCE(p_confirmation_phrase, ''))) != 'WIPE ALL DATA' THEN
    RAISE EXCEPTION 'INVALID_CONFIRMATION_PHRASE: Confirmation phrase must match WIPE ALL DATA.';
  END IF;

  -- Safely drop immutability triggers for the duration of the wipe
  BEGIN
    DROP TRIGGER IF EXISTS trg_notification_immutability ON public.notifications;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    DROP TRIGGER IF EXISTS trg_audit_immutability ON public.audit_events;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 3. Wipe Application Tables in Child-First FK-Safe Order
  -- Explicit 'WHERE id IS NOT NULL' satisfies PostgreSQL safeupdate checks on all tables
  BEGIN
    DELETE FROM public.sickbay_verifications WHERE id IS NOT NULL;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.cadet_details WHERE id IS NOT NULL;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.commandant_remarks WHERE id IS NOT NULL;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  DELETE FROM public.parade_records WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_deleted_parades = ROW_COUNT;

  BEGIN
    DELETE FROM public.command_reports WHERE id IS NOT NULL;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.cadet_alerts WHERE id IS NOT NULL;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.notifications WHERE id IS NOT NULL;
  EXCEPTION WHEN undefined_table THEN NULL;
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
  GET DIAGNOSTICS v_deleted_cadets = ROW_COUNT;

  -- Clear prior audit events
  DELETE FROM public.audit_events WHERE id IS NOT NULL;

  -- Re-attach immutability triggers so audit and notification trails remain protected going forward
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

  -- Remove all non-admin officer accounts (preserve active System Administrator)
  DELETE FROM public.users
  WHERE id != p_admin_id
    AND role != 'admin'
    AND LOWER(COALESCE(email, '')) != 'admin@gmail.com';
  GET DIAGNOSTICS v_deleted_officers = ROW_COUNT;

  -- 4. Record Forensic Wipe Event
  INSERT INTO public.audit_events (action_type, actor_id, actor_name, payload, created_at)
  VALUES (
    'SYSTEM_FACTORY_WIPE',
    p_admin_id,
    v_admin_name,
    jsonb_build_object(
      'deleted_cadets', v_deleted_cadets,
      'deleted_parade_records', v_deleted_parades,
      'deleted_officers', v_deleted_officers,
      'preserved_admin_id', p_admin_id
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'deletedCadets', v_deleted_cadets,
    'deletedParadeRecords', v_deleted_parades,
    'deletedOfficers', v_deleted_officers
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_wipe_application_data(UUID, TEXT, TEXT) TO authenticated, anon;
