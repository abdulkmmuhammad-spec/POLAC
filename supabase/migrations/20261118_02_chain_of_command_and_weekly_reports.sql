-- ============================================================================
-- MIGRATION: 20261118_02_chain_of_command_and_weekly_reports.sql
-- DATE: 2026-11-18
-- OBJECTIVE:
--   1. Create public.command_reports for Weekly Command Reports & two-way
--      Executive Chat between Director Field Studies (DFS) and
--      Commandant / Deputy Commandant.
--   2. Enforce normalized DFS designation matching
--      (LOWER(COALESCE(designation, '')) LIKE '%director%field%studies%' OR 'dfs').
--   3. Add send_weekly_command_report & reply_command_report RPCs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.command_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('commandant', 'deputy_commandant', 'both')),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  summary_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  executive_note TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'acknowledged')),
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_command_reports_created_at
  ON public.command_reports (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_command_reports_recipient
  ON public.command_reports (recipient_role, status);

ALTER TABLE public.command_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read command_reports for authenticated/anon" ON public.command_reports;
CREATE POLICY "Allow read command_reports for authenticated/anon"
  ON public.command_reports FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Allow insert/update command_reports" ON public.command_reports;
CREATE POLICY "Allow insert/update command_reports"
  ON public.command_reports FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- Helper check: is caller DFS?
CREATE OR REPLACE FUNCTION public.is_dfs_designation(p_designation TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LOWER(COALESCE(p_designation, '')) LIKE '%director%field%studies%'
      OR LOWER(TRIM(COALESCE(p_designation, ''))) = 'dfs';
$$;

-- RPC: send_weekly_command_report (Strictly DFS only)
CREATE OR REPLACE FUNCTION public.send_weekly_command_report(
  p_sender_id UUID,
  p_recipient_role TEXT,
  p_week_start DATE,
  p_week_end DATE,
  p_summary_payload JSONB,
  p_executive_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_name TEXT;
  v_sender_role TEXT;
  v_sender_designation TEXT;
  v_clean_note TEXT;
  v_initial_messages JSONB;
  v_report_id UUID;
BEGIN
  SELECT
    COALESCE(full_name, username, 'Director Field Studies'),
    role,
    COALESCE(designation, '')
  INTO v_sender_name, v_sender_role, v_sender_designation
  FROM public.users
  WHERE id = p_sender_id AND COALESCE(is_active, TRUE) = TRUE;

  IF v_sender_role IS NULL OR v_sender_role <> 'commandant' OR NOT public.is_dfs_designation(v_sender_designation) THEN
    RAISE EXCEPTION 'Unauthorized: Only the Director Field Studies can dispatch Weekly Command Reports.';
  END IF;

  IF p_recipient_role NOT IN ('commandant', 'deputy_commandant', 'both') THEN
    RAISE EXCEPTION 'Invalid recipient_role: %.', p_recipient_role;
  END IF;

  v_clean_note := NULLIF(TRIM(p_executive_note), '');
  v_initial_messages := '[]'::jsonb;

  IF v_clean_note IS NOT NULL THEN
    v_initial_messages := jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::TEXT,
        'senderId', p_sender_id::TEXT,
        'senderName', v_sender_name,
        'senderDesignation', v_sender_designation,
        'text', v_clean_note,
        'createdAt', NOW()
      )
    );
  END IF;

  INSERT INTO public.command_reports (
    sender_id,
    sender_name,
    recipient_role,
    week_start,
    week_end,
    summary_payload,
    executive_note,
    messages,
    status
  ) VALUES (
    p_sender_id,
    v_sender_name,
    p_recipient_role,
    p_week_start,
    p_week_end,
    COALESCE(p_summary_payload, '{}'::jsonb),
    v_clean_note,
    v_initial_messages,
    'sent'
  )
  RETURNING id INTO v_report_id;

  INSERT INTO public.notifications (
    type, title, content, read, officer_name, course_number, metadata, created_at
  ) VALUES (
    'command_report',
    'Weekly Command Report (' || p_week_start::TEXT || ' to ' || p_week_end::TEXT || ')',
    v_sender_name || ' submitted a Weekly Command Report' ||
    CASE WHEN v_clean_note IS NOT NULL THEN ': "' || v_clean_note || '"' ELSE '.' END,
    FALSE,
    v_sender_name,
    0,
    jsonb_build_object(
      'report_id', v_report_id,
      'recipient_role', p_recipient_role,
      'week_start', p_week_start,
      'week_end', p_week_end
    ),
    NOW()
  );

  INSERT INTO public.audit_events (action_type, actor_id, actor_name, target_id, payload, created_at)
  VALUES (
    'WEEKLY_COMMAND_REPORT_SENT',
    p_sender_id,
    v_sender_name,
    v_report_id::TEXT,
    jsonb_build_object(
      'recipient_role', p_recipient_role,
      'week_start', p_week_start,
      'week_end', p_week_end
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'id', v_report_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_weekly_command_report(UUID, TEXT, DATE, DATE, JSONB, TEXT) TO authenticated, anon;

-- RPC: reply_command_report (DFS, Commandant, or Deputy Commandant)
CREATE OR REPLACE FUNCTION public.reply_command_report(
  p_report_id UUID,
  p_sender_id UUID,
  p_message TEXT,
  p_acknowledge BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_name TEXT;
  v_sender_role TEXT;
  v_sender_designation TEXT;
  v_rec RECORD;
  v_clean_msg TEXT;
  v_next_messages JSONB;
  v_next_status TEXT;
BEGIN
  SELECT
    COALESCE(full_name, username, 'Senior Officer'),
    role,
    COALESCE(designation, 'Commandant')
  INTO v_sender_name, v_sender_role, v_sender_designation
  FROM public.users
  WHERE id = p_sender_id AND COALESCE(is_active, TRUE) = TRUE;

  IF v_sender_role IS NULL OR v_sender_role <> 'commandant' THEN
    RAISE EXCEPTION 'Unauthorized: Only Executive Command or DFS may reply to Command Reports.';
  END IF;

  SELECT * INTO v_rec FROM public.command_reports WHERE id = p_report_id;
  IF v_rec.id IS NULL THEN
    RAISE EXCEPTION 'Command report not found.';
  END IF;

  v_clean_msg := NULLIF(TRIM(p_message), '');
  v_next_messages := COALESCE(v_rec.messages, '[]'::jsonb);

  IF v_clean_msg IS NOT NULL THEN
    v_next_messages := v_next_messages || jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::TEXT,
        'senderId', p_sender_id::TEXT,
        'senderName', v_sender_name,
        'senderDesignation', v_sender_designation,
        'text', v_clean_msg,
        'createdAt', NOW()
      )
    );
  END IF;

  v_next_status := CASE
    WHEN p_acknowledge THEN 'acknowledged'
    ELSE v_rec.status
  END;

  UPDATE public.command_reports
  SET
    messages = v_next_messages,
    status = v_next_status,
    acknowledged_by = CASE WHEN p_acknowledge THEN v_sender_name ELSE acknowledged_by END,
    acknowledged_at = CASE WHEN p_acknowledge THEN NOW() ELSE acknowledged_at END,
    updated_at = NOW()
  WHERE id = p_report_id;

  IF v_clean_msg IS NOT NULL THEN
    INSERT INTO public.notifications (
      type, title, content, read, officer_name, course_number, metadata, created_at
    ) VALUES (
      'command_report',
      'Executive Reply from ' || v_sender_designation,
      v_sender_name || ': "' || v_clean_msg || '"',
      FALSE,
      v_sender_name,
      0,
      jsonb_build_object(
        'report_id', p_report_id,
        'reply_by_designation', v_sender_designation
      ),
      NOW()
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'report_status', v_next_status,
    'messages', v_next_messages
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reply_command_report(UUID, UUID, TEXT, BOOLEAN) TO authenticated, anon;

