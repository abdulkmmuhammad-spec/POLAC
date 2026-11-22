-- Migration: 20261122_01_admin_wipe_application_data.sql
-- Purpose: Provide an atomic, multi-safeguard RPC for System Administrators to perform a full
-- application data wipe (Factory Reset) while preserving the active System Administrator account
-- and core app_settings.

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

  -- 3. Wipe Application Tables in FK-Safe Order
  DELETE FROM public.cadet_details;
  DELETE FROM public.parade_records;
  GET DIAGNOSTICS v_deleted_parades = ROW_COUNT;

  BEGIN
    DELETE FROM public.sickbay_verifications;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.commandant_remarks;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.command_reports;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.cadet_alerts;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.notifications;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.notifications_archive;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.course_purge_snapshots;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.push_subscriptions WHERE user_id != p_admin_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  DELETE FROM public.cadet_registry;
  GET DIAGNOSTICS v_deleted_cadets = ROW_COUNT;

  -- Clear prior audit events, then log the factory wipe event itself
  DELETE FROM public.audit_events;

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
