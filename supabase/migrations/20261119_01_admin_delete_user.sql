-- Migration: 20261119_01_admin_delete_user.sql
-- Purpose: Provide an atomic, audited RPC for System Administrators to permanently delete officer accounts
-- while preserving historical parade records and forensic audit logs.

DROP FUNCTION IF EXISTS public.admin_delete_user(UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_delete_user(
  p_admin_id UUID,
  p_target_user_id UUID,
  p_current_password TEXT,
  p_audit_details TEXT DEFAULT 'Deleted officer account from Users & Access'
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
  v_target_name VARCHAR;
  v_target_username VARCHAR;
  v_target_email VARCHAR;
  v_active_admin_count INTEGER;
BEGIN
  -- 1. Verify Admin Authority & Current Password
  SELECT role, COALESCE(full_name, username, 'System Administrator'), password
  INTO v_admin_role, v_admin_name, v_admin_password
  FROM public.users
  WHERE id = p_admin_id AND COALESCE(is_active, TRUE) = TRUE;

  IF v_admin_role IS NULL OR v_admin_role NOT IN ('admin', 'commandant') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only an active System Administrator can delete user accounts.';
  END IF;

  IF p_current_password IS NULL OR TRIM(p_current_password) = '' OR v_admin_password IS DISTINCT FROM p_current_password THEN
    RAISE EXCEPTION 'INVALID_CURRENT_PASSWORD: Administrator password verification failed.';
  END IF;

  -- 2. Prevent self-deletion
  IF p_target_user_id = p_admin_id THEN
    RAISE EXCEPTION 'CANNOT_DELETE_SELF: You cannot delete your own active administrator account.';
  END IF;

  -- 3. Capture Target State
  SELECT role, full_name, username, email
  INTO v_target_role, v_target_name, v_target_username, v_target_email
  FROM public.users
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found.';
  END IF;

  -- 4. Protect sole active System Administrator
  IF v_target_role = 'admin' THEN
    SELECT COUNT(*) INTO v_active_admin_count
    FROM public.users
    WHERE role = 'admin' AND COALESCE(is_active, TRUE) = TRUE;

    IF v_active_admin_count <= 1 THEN
      RAISE EXCEPTION 'CANNOT_DELETE_LAST_ADMIN: Cannot delete the sole active System Administrator.';
    END IF;
  END IF;

  -- 5. Preserve historical records & clean up dependent session/push rows
  UPDATE public.parade_records SET officer_id = NULL WHERE officer_id = p_target_user_id;
  UPDATE public.audit_events SET actor_id = NULL WHERE actor_id = p_target_user_id;

  BEGIN
    UPDATE public.sickbay_verifications SET medical_officer_id = NULL WHERE medical_officer_id = p_target_user_id;
    UPDATE public.sickbay_verifications SET targeted_recipient_id = NULL WHERE targeted_recipient_id = p_target_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.push_subscriptions WHERE user_id = p_target_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    DELETE FROM auth.refresh_tokens WHERE user_id::text = p_target_user_id::text;
    DELETE FROM auth.sessions WHERE user_id = p_target_user_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 6. Log Forensic Audit Event before removing user row
  INSERT INTO public.audit_events (action_type, actor_id, actor_name, payload, created_at)
  VALUES (
    'USER_DELETED',
    p_admin_id,
    v_admin_name,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'target_full_name', v_target_name,
      'target_username', v_target_username,
      'target_email', v_target_email,
      'target_role', v_target_role,
      'details', COALESCE(NULLIF(TRIM(p_audit_details), ''), 'Deleted officer account from Users & Access')
    ),
    NOW()
  );

  -- 7. Delete the user from public.users
  DELETE FROM public.users WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'deletedUserId', p_target_user_id,
    'message', 'User account permanently deleted.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID, UUID, TEXT, TEXT) TO authenticated, anon;

