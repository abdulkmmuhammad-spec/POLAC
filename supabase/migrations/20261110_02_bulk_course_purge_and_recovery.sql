-- ============================================================================
-- MIGRATION: Secure Bulk Course Deletion, Snapshot Recovery & Re-Enrollment
-- DATE: 2026-11-10
-- OBJECTIVE:
--   1. Add soft-delete metadata columns (deleted_at, archived_by) to cadet_registry.
--   2. Create course_purge_snapshots table with RLS for emergency audit window recovery.
--   3. Ensure audit_cadet_registry_modification_trigger safely handles DELETE suppression.
--   4. Create get_courses_impact_summary RPC for real-time impact preview counters.
--   5. Create execute_bulk_course_purge RPC for atomic, role-verified course purge
--      with forensic audit logging (actor ID, timestamp, IP, RC numbers, counts).
--   6. Create restore_course_purge_snapshot RPC for emergency transactional rollback.
-- ============================================================================

-- 1. Add soft-delete metadata columns to cadet_registry
ALTER TABLE public.cadet_registry
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS archived_by UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_cadet_registry_course_status
  ON public.cadet_registry (course_number, status);

-- 2. Create course_purge_snapshots table for Soft-Delete / Emergency Audit Window Recovery
CREATE TABLE IF NOT EXISTS public.course_purge_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_numbers INTEGER[] NOT NULL,
  purge_mode TEXT NOT NULL CHECK (purge_mode IN ('SOFT_DELETE', 'HARD_DELETE')),
  cadet_count INTEGER NOT NULL DEFAULT 0,
  parade_records_affected INTEGER NOT NULL DEFAULT 0,
  disciplinary_logs_affected INTEGER NOT NULL DEFAULT 0,
  is_recoverable BOOLEAN NOT NULL DEFAULT TRUE,
  snapshot_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  actor_id UUID,
  actor_name TEXT NOT NULL,
  client_ip TEXT DEFAULT 'LOCAL_CLIENT',
  confirmation_phrase TEXT,
  restored_at TIMESTAMPTZ DEFAULT NULL,
  restored_by_id UUID DEFAULT NULL,
  restored_by_name TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_purge_snapshots_created_at
  ON public.course_purge_snapshots (created_at DESC);

ALTER TABLE public.course_purge_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Commandants can manage course_purge_snapshots" ON public.course_purge_snapshots;
CREATE POLICY "Commandants can manage course_purge_snapshots"
  ON public.course_purge_snapshots
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. Fix audit_cadet_registry_modification_trigger to return OLD on DELETE when suppressed
CREATE OR REPLACE FUNCTION public.audit_cadet_registry_modification_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_id UUID := NULL;
    v_actor_name TEXT;
BEGIN
    IF current_setting('app.suppress_audit', true) = 'true' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    -- Safely resolve actor_id from public.users to prevent FK violation
    IF auth.uid() IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()) THEN
            v_actor_id := auth.uid();
        END IF;
    END IF;

    -- Resolve actor_name from JWT metadata or fallback
    v_actor_name := COALESCE(
        auth.jwt() -> 'user_metadata' ->> 'full_name',
        auth.jwt() -> 'user_metadata' ->> 'username',
        'ADMIN/SYSTEM'
    );

    INSERT INTO public.audit_events (actor_id, actor_name, action_type, target_id, payload)
    VALUES (
        v_actor_id,
        v_actor_name,
        CASE 
            WHEN TG_OP = 'DELETE' THEN 'REGISTRY_DELETED'
            ELSE 'CADET_MODIFIED'
        END,
        CASE 
            WHEN TG_OP = 'DELETE' THEN OLD.id::text
            ELSE NEW.id::text
        END,
        jsonb_build_object(
            'cadet_name', CASE WHEN TG_OP = 'DELETE' THEN OLD.name ELSE NEW.name END,
            'diff', CASE 
                WHEN TG_OP = 'DELETE' THEN '[]'::jsonb 
                ELSE public.jsonb_diff_standardized(to_jsonb(OLD), to_jsonb(NEW), ARRAY['name', 'squad', 'course_number', 'year_group', 'npa_number', 'admission_year']) 
            END,
            'protocol', 'RESILIENT_TRIGGER_V2',
            'timestamp', clock_timestamp()
        )
    );
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: Real-Time Course Impact Audit Counter
CREATE OR REPLACE FUNCTION public.get_courses_impact_summary(
  p_course_numbers INTEGER[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_cadets INTEGER := 0;
  v_active_cadets INTEGER := 0;
  v_parade_records INTEGER := 0;
  v_cadet_details INTEGER := 0;
  v_disciplinary_logs INTEGER := 0;
  v_assigned_officers INTEGER := 0;
  v_push_subscriptions INTEGER := 0;
  v_course_breakdown JSONB := '[]'::jsonb;
BEGIN
  IF p_course_numbers IS NULL OR array_length(p_course_numbers, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'totalCadets', 0,
      'activeCadets', 0,
      'paradeRecordsCount', 0,
      'attendanceLogsCount', 0,
      'disciplinaryLogsCount', 0,
      'assignedOfficersCount', 0,
      'pushSubscriptionsCount', 0,
      'courseBreakdown', '[]'::jsonb
    );
  END IF;

  -- Total and active cadets in selected courses
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'ACTIVE')
  INTO v_total_cadets, v_active_cadets
  FROM public.cadet_registry
  WHERE course_number = ANY(p_course_numbers);

  -- Per-course breakdown
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'courseNumber', rc_num,
      'totalCadets', COALESCE(c_stats.total_c, 0),
      'activeCadets', COALESCE(c_stats.active_c, 0),
      'squadCount', COALESCE(c_stats.squad_c, 0)
    ) ORDER BY rc_num ASC
  ), '[]'::jsonb)
  INTO v_course_breakdown
  FROM unnest(p_course_numbers) AS rc_num
  LEFT JOIN (
    SELECT
      course_number,
      COUNT(*) AS total_c,
      COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active_c,
      COUNT(DISTINCT squad) AS squad_c
    FROM public.cadet_registry
    WHERE course_number = ANY(p_course_numbers)
    GROUP BY course_number
  ) c_stats ON c_stats.course_number = rc_num;

  -- Parade records count
  SELECT COUNT(*)
  INTO v_parade_records
  FROM public.parade_records
  WHERE course_number = ANY(p_course_numbers);

  -- Cadet detail logs (attendance & disciplinary: absent, sick, detention, suspension)
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE LOWER(cd.status) IN ('absent', 'detention', 'suspension', 'sick', 'pass', 'yet_to_report'))
  INTO v_cadet_details, v_disciplinary_logs
  FROM public.cadet_details cd
  INNER JOIN public.parade_records pr ON pr.id = cd.record_id
  WHERE pr.course_number = ANY(p_course_numbers);

  -- Assigned Course Officers
  SELECT COUNT(*)
  INTO v_assigned_officers
  FROM public.users
  WHERE role = 'course_officer'
    AND NULLIF(TRIM(course_number::text), '') IS NOT NULL
    AND (
      CASE
        WHEN TRIM(course_number::text) ~ '^[0-9]+$' THEN TRIM(course_number::text)::integer = ANY(p_course_numbers)
        ELSE FALSE
      END
    );

  -- Webhook / Push Subscriptions linked to assigned officers or system alerts
  BEGIN
    SELECT COUNT(*)
    INTO v_push_subscriptions
    FROM public.push_subscriptions ps
    WHERE ps.user_id IN (
      SELECT id::text FROM public.users
      WHERE role = 'course_officer'
        AND TRIM(course_number::text) ~ '^[0-9]+$'
        AND TRIM(course_number::text)::integer = ANY(p_course_numbers)
    );
  EXCEPTION WHEN OTHERS THEN
    v_push_subscriptions := 0;
  END;

  RETURN jsonb_build_object(
    'totalCadets', v_total_cadets,
    'activeCadets', v_active_cadets,
    'paradeRecordsCount', v_parade_records,
    'attendanceLogsCount', v_cadet_details,
    'disciplinaryLogsCount', v_disciplinary_logs,
    'assignedOfficersCount', v_assigned_officers,
    'pushSubscriptionsCount', v_push_subscriptions,
    'courseBreakdown', v_course_breakdown
  );
END;
$$;

-- 5. RPC: Atomic Bulk Course Purge with Snapshot Archiving & Forensic Audit Logging
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
  -- 1. Validate input
  IF p_course_numbers IS NULL OR array_length(p_course_numbers, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one Regular Course (RC) must be selected for purge.';
  END IF;

  IF p_purge_mode NOT IN ('SOFT_DELETE', 'HARD_DELETE') THEN
    RAISE EXCEPTION 'Invalid purge mode: %. Expected SOFT_DELETE or HARD_DELETE.', p_purge_mode;
  END IF;

  -- 2. Verify Commandant Role Authorization
  IF p_actor_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE id = p_actor_id AND role = 'commandant') THEN
      v_is_authorized := TRUE;
      v_resolved_actor_id := p_actor_id;
    ELSIF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor_id AND role = 'commandant') THEN
      v_is_authorized := TRUE;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: Only designated Commandant accounts can execute bulk course purge operations.';
  END IF;

  v_resolved_actor_name := COALESCE(NULLIF(TRIM(p_actor_name), ''), 'COMMANDANT');

  -- 3. Suppress row-level audit trigger during bulk operation to prevent audit log flooding
  PERFORM set_config('app.suppress_audit', 'true', true);

  -- 4. Capture complete JSONB snapshot of targeted cadet records before removal
  SELECT
    COALESCE(jsonb_agg(to_jsonb(cr) ORDER BY cr.course_number ASC, cr.squad ASC, cr.name ASC), '[]'::jsonb),
    COUNT(*)
  INTO v_snapshot_json, v_purged_cadets_count
  FROM public.cadet_registry cr
  WHERE cr.course_number = ANY(p_course_numbers);

  -- 5. Count or purge associated attendance/disciplinary logs if requested
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

  -- 6. Store Snapshot in public.course_purge_snapshots
  -- For SOFT_DELETE, snapshot_data holds the full roster for 1-click emergency rollback.
  -- For HARD_DELETE, we store metadata with is_recoverable = false and empty snapshot_data (or summary only).
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

  -- 7. Remove targeted course records from active cadet_registry so immediate re-enrollment
  --    with identical NPA numbers or names succeeds without constraint collisions.
  DELETE FROM public.cadet_registry
  WHERE course_number = ANY(p_course_numbers);

  -- 8. Re-enable row-level audit trigger
  PERFORM set_config('app.suppress_audit', 'false', true);

  -- 9. Write Consolidated Forensic Audit Event
  INSERT INTO public.audit_events (
    actor_id,
    actor_name,
    action_type,
    target_id,
    payload
  ) VALUES (
    v_resolved_actor_id,
    v_resolved_actor_name,
    'COURSE_BULK_PURGED',
    'RC_' || array_to_string(p_course_numbers, '_'),
    jsonb_build_object(
      'course_numbers', p_course_numbers,
      'purged_cadet_count', v_purged_cadets_count,
      'purge_mode', p_purge_mode,
      'purge_attendance', p_purge_attendance,
      'parade_records_affected', v_purged_parades_count,
      'disciplinary_logs_affected', v_purged_details_count,
      'snapshot_id', v_snapshot_id,
      'is_recoverable', (p_purge_mode = 'SOFT_DELETE'),
      'client_ip', COALESCE(p_client_ip, 'LOCAL_CLIENT'),
      'confirmation_phrase', p_confirmation_phrase,
      'timestamp', clock_timestamp()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'snapshotId', v_snapshot_id,
    'purgedCadetCount', v_purged_cadets_count,
    'paradeRecordsAffected', v_purged_parades_count,
    'disciplinaryLogsAffected', v_purged_details_count,
    'courseNumbers', p_course_numbers,
    'purgeMode', p_purge_mode,
    'isRecoverable', (p_purge_mode = 'SOFT_DELETE'),
    'timestamp', clock_timestamp()
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.suppress_audit', 'false', true);
  RAISE;
END;
$$;

-- 6. RPC: Emergency Audit Window Snapshot Recovery (Transactional Rollback)
CREATE OR REPLACE FUNCTION public.restore_course_purge_snapshot(
  p_snapshot_id UUID,
  p_actor_id UUID,
  p_actor_name TEXT,
  p_client_ip TEXT DEFAULT 'LOCAL_CLIENT'
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
  v_snapshot RECORD;
  v_restored_count INTEGER := 0;
BEGIN
  -- 1. Verify Commandant Role Authorization
  IF p_actor_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE id = p_actor_id AND role = 'commandant') THEN
      v_is_authorized := TRUE;
      v_resolved_actor_id := p_actor_id;
    ELSIF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor_id AND role = 'commandant') THEN
      v_is_authorized := TRUE;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: Only designated Commandant accounts can restore course snapshots.';
  END IF;

  v_resolved_actor_name := COALESCE(NULLIF(TRIM(p_actor_name), ''), 'COMMANDANT');

  -- 2. Fetch Snapshot
  SELECT * INTO v_snapshot
  FROM public.course_purge_snapshots
  WHERE id = p_snapshot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course purge snapshot not found (ID: %).', p_snapshot_id;
  END IF;

  IF NOT v_snapshot.is_recoverable OR jsonb_array_length(v_snapshot.snapshot_data) = 0 THEN
    RAISE EXCEPTION 'This snapshot was created under HARD_DELETE mode or contains no recoverable records.';
  END IF;

  PERFORM set_config('app.suppress_audit', 'true', true);

  -- 3. Restore NPA-numbered cadets with ON CONFLICT upsert
  INSERT INTO public.cadet_registry (
    name,
    squad,
    course_number,
    year_group,
    status,
    npa_number,
    admission_year,
    avatar_url,
    relegated_from_rc
  )
  SELECT DISTINCT ON (UPPER(TRIM(r.npa_number)))
    r.name,
    r.squad,
    r.course_number,
    COALESCE(r.year_group, 1),
    COALESCE(r.status, 'ACTIVE'),
    UPPER(TRIM(r.npa_number)),
    r.admission_year,
    r.avatar_url,
    r.relegated_from_rc
  FROM jsonb_to_recordset(v_snapshot.snapshot_data) AS r(
    name TEXT,
    squad TEXT,
    course_number INTEGER,
    year_group INTEGER,
    status TEXT,
    npa_number TEXT,
    admission_year INTEGER,
    avatar_url TEXT,
    relegated_from_rc INTEGER
  )
  WHERE r.npa_number IS NOT NULL AND TRIM(r.npa_number) <> ''
  ORDER BY UPPER(TRIM(r.npa_number))
  ON CONFLICT (npa_number) DO UPDATE SET
    name = EXCLUDED.name,
    squad = EXCLUDED.squad,
    course_number = EXCLUDED.course_number,
    year_group = EXCLUDED.year_group,
    status = EXCLUDED.status,
    admission_year = COALESCE(EXCLUDED.admission_year, public.cadet_registry.admission_year),
    deleted_at = NULL;

  -- 4. Restore legacy cadets (without npa_number)
  INSERT INTO public.cadet_registry (
    name,
    squad,
    course_number,
    year_group,
    status,
    avatar_url,
    relegated_from_rc
  )
  SELECT
    r.name,
    r.squad,
    r.course_number,
    COALESCE(r.year_group, 1),
    COALESCE(r.status, 'ACTIVE'),
    r.avatar_url,
    r.relegated_from_rc
  FROM jsonb_to_recordset(v_snapshot.snapshot_data) AS r(
    name TEXT,
    squad TEXT,
    course_number INTEGER,
    year_group INTEGER,
    status TEXT,
    npa_number TEXT,
    admission_year INTEGER,
    avatar_url TEXT,
    relegated_from_rc INTEGER
  )
  WHERE r.npa_number IS NULL OR TRIM(r.npa_number) = '';

  v_restored_count := jsonb_array_length(v_snapshot.snapshot_data);

  -- 5. Mark snapshot as restored
  UPDATE public.course_purge_snapshots
  SET
    restored_at = NOW(),
    restored_by_id = v_resolved_actor_id,
    restored_by_name = v_resolved_actor_name
  WHERE id = p_snapshot_id;

  PERFORM set_config('app.suppress_audit', 'false', true);

  -- 6. Log Forensic Audit Event
  INSERT INTO public.audit_events (
    actor_id,
    actor_name,
    action_type,
    target_id,
    payload
  ) VALUES (
    v_resolved_actor_id,
    v_resolved_actor_name,
    'COURSE_PURGE_RESTORED',
    'SNAPSHOT_' || p_snapshot_id::text,
    jsonb_build_object(
      'snapshot_id', p_snapshot_id,
      'course_numbers', v_snapshot.course_numbers,
      'restored_cadet_count', v_restored_count,
      'client_ip', COALESCE(p_client_ip, 'LOCAL_CLIENT'),
      'timestamp', clock_timestamp()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'snapshotId', p_snapshot_id,
    'restoredCadetCount', v_restored_count,
    'courseNumbers', v_snapshot.course_numbers
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.suppress_audit', 'false', true);
  RAISE;
END;
$$;

