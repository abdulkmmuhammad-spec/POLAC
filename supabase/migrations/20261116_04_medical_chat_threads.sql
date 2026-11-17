-- ============================================================================
-- MIGRATION: 20261116_04_medical_chat_threads.sql
-- DATE: 2026-11-16
-- OBJECTIVE:
--   Add WhatsApp-style multi-turn chat thread support (`messages` JSONB +
--   `thread_status`) to `public.sickbay_verifications`, update
--   `verify_sickbay_cadet` to seed the initial message, and add
--   `reply_sickbay_thread` RPC so Commandant, DFS, Course Officers, and
--   Medical Officers can reply in-thread using the same chat UX.
-- ============================================================================

-- 1. Add chat thread columns to public.sickbay_verifications
ALTER TABLE public.sickbay_verifications
  ADD COLUMN IF NOT EXISTS messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS thread_status TEXT NOT NULL DEFAULT 'open';

-- 2. Backfill initial message for existing records that have a clinical_note
UPDATE public.sickbay_verifications
SET messages = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::TEXT,
    'senderId', COALESCE(medical_officer_id::TEXT, ''),
    'senderName', COALESCE(medical_officer_name, 'Medical Officer'),
    'senderRole', 'medical_officer',
    'text', clinical_note,
    'createdAt', COALESCE(verified_at, updated_at, created_at, NOW())
  )
)
WHERE jsonb_array_length(messages) = 0
  AND clinical_note IS NOT NULL
  AND TRIM(clinical_note) <> '';

-- 3. Upgrade verify_sickbay_cadet so it seeds the chat messages array
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

  IF p_status NOT IN ('admitted', 'not_admitted') THEN
    RAISE EXCEPTION 'Invalid status. Must be strictly admitted or not_admitted.';
  END IF;

  v_clean_status := p_status::medical_verification_status;
  v_clean_note := NULLIF(TRIM(p_clinical_note), '');

  SELECT *
  INTO v_rec
  FROM public.sickbay_verifications
  WHERE id = p_verification_id;

  IF v_rec.id IS NULL THEN
    RAISE EXCEPTION 'Verification record not found.';
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

-- 4. RPC: reply_sickbay_thread (WhatsApp-style two-way replies + resolve)
CREATE OR REPLACE FUNCTION public.reply_sickbay_thread(
  p_verification_id UUID,
  p_sender_id UUID,
  p_message TEXT,
  p_resolve BOOLEAN DEFAULT FALSE
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
    COALESCE(full_name, username, 'Officer'),
    role,
    COALESCE(designation, role)
  INTO v_sender_name, v_sender_role, v_sender_designation
  FROM public.users
  WHERE id = p_sender_id AND COALESCE(is_active, TRUE) = TRUE;

  IF v_sender_role IS NULL OR v_sender_role NOT IN ('commandant', 'course_officer', 'medical_officer', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Invalid user role for sickbay thread reply.';
  END IF;

  SELECT * INTO v_rec FROM public.sickbay_verifications WHERE id = p_verification_id;
  IF v_rec.id IS NULL THEN
    RAISE EXCEPTION 'Verification record not found.';
  END IF;

  v_clean_msg := NULLIF(TRIM(p_message), '');
  v_next_messages := COALESCE(v_rec.messages, '[]'::jsonb);

  IF v_clean_msg IS NOT NULL THEN
    v_next_messages := v_next_messages || jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::TEXT,
        'senderId', p_sender_id::TEXT,
        'senderName', v_sender_name,
        'senderRole', v_sender_role,
        'senderDesignation', v_sender_designation,
        'text', v_clean_msg,
        'createdAt', NOW()
      )
    );
  END IF;

  v_next_status := CASE
    WHEN p_resolve THEN 'resolved'
    WHEN v_sender_role IN ('commandant', 'course_officer') THEN 'replied'
    ELSE 'open'
  END;

  UPDATE public.sickbay_verifications
  SET
    messages = v_next_messages,
    thread_status = v_next_status,
    updated_at = NOW()
  WHERE id = p_verification_id;

  IF v_clean_msg IS NOT NULL THEN
    INSERT INTO public.notifications (
      type, title, content, read, officer_name, course_number, metadata, created_at
    ) VALUES (
      'sickbay_verification',
      '💬 Sickbay Thread Reply: ' || v_rec.cadet_name,
      v_sender_name || ' (' || v_sender_designation || ') replied on ' || v_rec.cadet_name ||
      ' (RC ' || v_rec.course_number || '): "' || v_clean_msg || '"',
      FALSE,
      v_sender_name,
      v_rec.course_number,
      jsonb_build_object(
        'verification_id', p_verification_id,
        'cadet_name', v_rec.cadet_name,
        'course_number', v_rec.course_number,
        'reply_by_role', v_sender_role
      ),
      NOW()
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'thread_status', v_next_status,
    'messages', v_next_messages
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reply_sickbay_thread(UUID, UUID, TEXT, BOOLEAN) TO authenticated, anon;

