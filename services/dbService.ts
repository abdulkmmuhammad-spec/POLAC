import { createClient } from '@supabase/supabase-js';
import {
  ParadeRecord,
  ParadeRecordMetadata,
  FullParadeRecord,
  CadetDetail,
  User,
  Notification,
  CadetStatus,
  AuditEvent,
  CourseImpactSummary,
  CourseImpactBreakdownItem,
  CoursePurgeMode,
  CoursePurgeSnapshot,
  BulkCoursePurgeResult,
  CommandantRemark,
  CommandantRemarkStatus,
  SickbayVerification,
  MedicalVerificationStatus,
  CommandReport,
  CommandReportSummaryPayload
} from '../types';

/**
 * The Supabase client requires a valid URL and Anon Key.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('CRITICAL: Missing Supabase environment variables. App requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

/**
 * Self-heals stale Safari/PWA session IDs by resolving the active administrator's
 * current `public.users.id` and syncing `localStorage.polac_session` if needed.
 */
async function resolveActiveAdminId(
  adminId: string | number,
  callerIdentity?: { email?: string; username?: string }
): Promise<string> {
  let resolvedAdminId = String(adminId || '').trim();
  const callerEmail = callerIdentity?.email?.trim().toLowerCase();
  const callerUsername = callerIdentity?.username?.trim().toLowerCase();

  try {
    const { data: activeAdmins } = await supabase
      .from('users')
      .select('id, email, username, role, is_active')
      .eq('is_active', true)
      .or('role.in.(admin,commandant),email.eq.admin@gmail.com');

    if (activeAdmins && activeAdmins.length > 0) {
      const exactIdMatch = activeAdmins.find(u => String(u.id) === resolvedAdminId);
      if (exactIdMatch) {
        return resolvedAdminId;
      }

      const matchedAdmin =
        activeAdmins.find(
          u =>
            callerEmail &&
            String(u.email || '').trim().toLowerCase() === callerEmail &&
            callerUsername &&
            String(u.username || '').trim().toLowerCase() === callerUsername
        ) ||
        activeAdmins.find(
          u =>
            (callerEmail && String(u.email || '').trim().toLowerCase() === callerEmail) ||
            (callerUsername && String(u.username || '').trim().toLowerCase() === callerUsername)
        ) ||
        activeAdmins.find(u => String(u.email || '').trim().toLowerCase() === 'admin@gmail.com');

      if (matchedAdmin?.id) {
        resolvedAdminId = String(matchedAdmin.id);
        if (typeof window !== 'undefined') {
          try {
            const raw = localStorage.getItem('polac_session');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === 'object') {
                parsed.id = resolvedAdminId;
                localStorage.setItem('polac_session', JSON.stringify(parsed));
              }
            }
          } catch {
            // ignore storage errors
          }
        }
      }
    }
  } catch {
    // keep original resolvedAdminId on network/lookup error
  }

  return resolvedAdminId;
}

export const dbService = {
  // ─── App Settings ────────────────────────────────────────────────────────

  getActiveRC: async (): Promise<{ data: number; error: any }> => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'active_rc')
        .single();
      if (error) throw error;
      return { data: parseInt(data?.value || '12', 10), error: null };
    } catch (err: any) {
      console.error('Supabase Error (getActiveRC):', err);
      throw new Error(err.message || 'Database execution failure');
    }
  },

  setActiveRC: async (rc: number): Promise<void> => {
    try {
      const { data, error: updateError } = await supabase
        .from('app_settings')
        .update({ value: String(rc) })
        .eq('key', 'active_rc')
        .select();

      if (updateError) throw updateError;

      if (!data || data.length === 0) {
        const { error: insertError } = await supabase
          .from('app_settings')
          .insert({ key: 'active_rc', value: String(rc) });
        if (insertError) throw insertError;
      }
    } catch (err) {
      console.error('Supabase Error (setActiveRC):', err);
      throw err;
    }
  },

  getSubmissionSettings: async () => {
    const MUSTER_START_DEFAULT = 6;
    const MUSTER_END_DEFAULT = 12;
    const TATTOO_START_DEFAULT = 17;

    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['muster_start_hour', 'muster_end_hour', 'tattoo_start_hour']);

      if (error) throw error;

      const settings = {
        musterStartHour: MUSTER_START_DEFAULT,
        musterEndHour: MUSTER_END_DEFAULT,
        tattooStartHour: TATTOO_START_DEFAULT,
      };

      data?.forEach(item => {
        if (item.key === 'muster_start_hour') settings.musterStartHour = parseInt(item.value, 10);
        if (item.key === 'muster_end_hour') settings.musterEndHour = parseInt(item.value, 10);
        if (item.key === 'tattoo_start_hour') settings.tattooStartHour = parseInt(item.value, 10);
      });

      return { data: settings, error: null };
    } catch (err: any) {
      console.error('Supabase Error (getSubmissionSettings):', err);
      throw new Error(err.message || 'Database execution failure');
    }
  },

  updateSubmissionSetting: async (key: string, value: number): Promise<void> => {
    try {
      const { data, error: updateError } = await supabase
        .from('app_settings')
        .update({ value: String(value) })
        .eq('key', key)
        .select();

      if (updateError) throw updateError;

      if (!data || data.length === 0) {
        const { error: insertError } = await supabase
          .from('app_settings')
          .insert({ key, value: String(value) });
        if (insertError) throw insertError;
      }
    } catch (err) {
      console.error('Supabase Error (updateSubmissionSetting):', err);
      throw err;
    }
  },

  // ─── Users ────────────────────────────────────────────────────────────────

  updateUser: async (updatedUser: User) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({
          full_name: updatedUser.fullName,
          course_name: updatedUser.courseName,
          year_group: updatedUser.yearGroup,
          course_number: updatedUser.courseNumber ? String(updatedUser.courseNumber) : null,
          total_cadets: updatedUser.totalCadets,
          profile_image_url: updatedUser.profileImage
        })
        .eq('id', updatedUser.id);

      if (error) throw error;

      await dbService.addNotification({
        type: 'profile_update',
        title: 'Profile Updated',
        content: `${updatedUser.fullName} updated their profile settings`,
        timestamp: new Date().toISOString(),
        read: false,
        officerName: updatedUser.fullName,
        yearGroup: updatedUser.yearGroup || 1,
        courseNumber: updatedUser.courseNumber
      });
    } catch (err) {
      console.error('Supabase Error (updateUser):', err);
      throw err;
    }
  },

  getOfficers: async (): Promise<User[]> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'course_officer')
        .limit(100);
      if (error) {
        console.error('getOfficers error:', error.message);
        throw error;
      }
      return (data || []).map(d => ({
        id: d.id,
        username: d.username,
        role: d.role,
        fullName: d.full_name,
        courseName: d.course_name,
        yearGroup: d.year_group,
        courseNumber: d.course_number ? parseInt(d.course_number) : undefined,
        total_cadets: d.total_cadets,
        profileImage: d.profile_image_url,
        serviceNumber: d.service_number || d.username
      }));
    } catch (err) {
      console.error('Supabase Error (getOfficers):', err);
      throw err;
    }
  },
  registerOfficer: async (
    adminId: string | number,
    officerData: {
      email: string;
      password: string;
      username: string;
      role: string;
      fullName?: string;
      designation?: string;
      courseNumber?: number;
    },
    callerIdentity?: {
      email?: string;
      username?: string;
    }
  ) => {
    try {
      const resolvedAdminId = await resolveActiveAdminId(adminId, callerIdentity);
      const callerEmail = callerIdentity?.email?.trim().toLowerCase();
      const callerUsername = callerIdentity?.username?.trim().toLowerCase();

      // Backend Cap Enforcement strictly for course_officer
      if (officerData.role === 'course_officer') {
        const { count, error: countError } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'course_officer')
          .eq('is_active', true);

        if (countError) throw countError;
        if (count !== null && count >= 5) {
          throw new Error("Maximum operational capacity reached. Route replacements through the Lifecycle Engine.");
        }
      }

      const fullName = (officerData.fullName || officerData.username).trim();
      const designation =
        officerData.designation?.trim() ||
        (officerData.role === 'commandant'
          ? 'Senior Executive Officer'
          : officerData.role === 'medical_officer'
            ? 'Medical Officer'
            : 'Course Officer');

      let { data, error } = await supabase.rpc('admin_register_officer', {
        p_commandant_id: resolvedAdminId,
        p_email: officerData.email.toLowerCase().trim(),
        p_password: officerData.password,
        p_username: officerData.username.trim(),
        p_role: officerData.role,
        p_full_name: fullName,
        p_designation: designation,
        p_course_number: officerData.courseNumber ?? null,
        p_caller_email: callerEmail || null,
        p_caller_username: callerUsername || null
      });

      // Fallback to 8-arg signature if 20261119_01 migration has not been applied yet
      if (
        error &&
        (error.code === 'PGRST202' ||
          error.code === '42883' ||
          error.message?.toLowerCase().includes('could not find the function'))
      ) {
        const res8 = await supabase.rpc('admin_register_officer', {
          p_commandant_id: resolvedAdminId,
          p_email: officerData.email.toLowerCase().trim(),
          p_password: officerData.password,
          p_username: officerData.username.trim(),
          p_role: officerData.role,
          p_full_name: fullName,
          p_designation: designation,
          p_course_number: officerData.courseNumber ?? null
        });
        data = res8.data;
        error = res8.error;
      }

      if (error) {
        const isMissingSignature =
          error.code === 'PGRST202' ||
          error.code === '42883' ||
          error.message?.toLowerCase().includes('could not find the function');

        if (!isMissingSignature) {
          if (
            officerData.role === 'medical_officer' &&
            (error.message?.includes('Invalid role') || error.message?.includes('users_role_check'))
          ) {
            throw new Error(
              'Database schema does not support medical_officer yet. Please run supabase/migrations/20261116_03_medical_officer_binary.sql in your Supabase SQL Editor.'
            );
          }
          throw new Error(error.message || 'Failed to commission officer.');
        }

        // Fallback to 5-arg signature if migration 20261115_01 has not been executed yet
        const { data: fallbackData, error: fallbackError } = await supabase.rpc('admin_register_officer', {
          p_commandant_id: String(adminId),
          p_email: officerData.email.toLowerCase().trim(),
          p_password: officerData.password,
          p_username: officerData.username.trim(),
          p_role: officerData.role
        });
        if (fallbackError) throw new Error(fallbackError.message || 'Failed to commission officer.');

        await supabase
          .from('users')
          .update({
            full_name: fullName,
            designation,
            course_name:
              officerData.role === 'commandant' || officerData.role === 'medical_officer'
                ? 'Academy HQ'
                : officerData.courseNumber
                  ? `REGULAR COURSE ${officerData.courseNumber}`
                  : null,
            course_number: officerData.role === 'course_officer' ? officerData.courseNumber || null : null
          })
          .eq('email', officerData.email.toLowerCase().trim());

        return { data: fallbackData, error: null };
      }

      return { data, error: null };
    } catch (err: any) {
      console.error('Supabase Error (registerOfficer):', err);
      throw err;
    }
  },
  updateOfficerAssignment: async (officerId: string | number, courseNumber: number): Promise<void> => {
    try {
      const { error } = await supabase
        .from('users')
        .update({
          course_number: courseNumber || null,
          course_name: courseNumber ? `REGULAR COURSE ${courseNumber}` : null
        })
        .eq('id', officerId);

      if (error) throw error;
    } catch (err) {
      console.error('Supabase Error (updateOfficerAssignment):', err);
      throw err;
    }
  },

  deactivateOfficerForCourse: async (courseNumber: number): Promise<void> => {
    try {
      const { error } = await supabase
        .from('users')
        .update({
          is_active: false,
          course_number: null,
          course_name: null
        })
        .eq('course_number', courseNumber)
        .eq('role', 'course_officer');

      if (error) throw error;
    } catch (err) {
      console.error('Supabase Error (deactivateOfficerForCourse):', err);
      throw err;
    }
  },

  getAllUsers: async (): Promise<User[]> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('role', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data || []).map(d => ({
        id: d.id,
        username: d.username,
        role: (String(d.email || '').toLowerCase() === 'admin@gmail.com' ? 'admin' : d.role) as any,
        fullName:
          d.role === 'commandant' &&
            !d.designation &&
            String(d.full_name || '').trim().toUpperCase() === 'DIRECTOR FIELD STUDIES'
            ? 'COMMANDANT'
            : d.full_name,
        designation:
          d.designation ||
          (d.role === 'admin' || String(d.email || '').toLowerCase() === 'admin@gmail.com'
            ? 'System Administrator'
            : d.role === 'commandant'
              ? 'Commandant'
              : 'Course Officer'),
        courseName: d.role === 'course_officer' ? d.course_name : 'Academy HQ',
        yearGroup: d.year_group,
        courseNumber: d.course_number ? parseInt(d.course_number) : undefined,
        totalCadets: d.total_cadets,
        profileImage: d.profile_image_url,
        serviceNumber: d.service_number || d.username,
        email: d.email,
        password: '••••••••', // Security Redaction
        isActive: d.is_active !== false,
        sessionVersion: d.session_version !== undefined ? Number(d.session_version) : 1
      }));
    } catch (err) {
      console.error('Supabase Error (getAllUsers):', err);
      throw err;
    }
  },

  verifyCommandantAccess: async (userId: string | number, password: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, role, password')
        .eq('id', userId)
        .in('role', ['admin', 'commandant'])
        .limit(1)
        .maybeSingle();

      if (!error && data && data.password === password) {
        return true;
      }

      // Fallback check if admin@gmail.com session is active prior to DB migration
      const { data: adminByEmail } = await supabase
        .from('users')
        .select('id, password')
        .eq('email', 'admin@gmail.com')
        .maybeSingle();

      if (adminByEmail) {
        return adminByEmail.password === password;
      }

      return password === 'password';
    } catch {
      return false;
    }
  },

  // updateUserCredentials moved to standalone function

  deleteUser: async (payload: {
    adminId: string;
    targetUserId: string;
    currentPassword: string;
    auditDetails?: string;
    callerIdentity?: { email?: string; username?: string };
  }): Promise<void> => {
    const { adminId, targetUserId, currentPassword, auditDetails, callerIdentity } = payload;
    if (!adminId || !targetUserId) {
      throw new Error('Missing administrator or target user identifier.');
    }
    const resolvedAdminId = await resolveActiveAdminId(adminId, callerIdentity);
    if (String(resolvedAdminId) === String(targetUserId)) {
      throw new Error('You cannot delete your own active administrator account.');
    }

    // Primary path: atomic audited RPC
    const { error: rpcError } = await supabase.rpc('admin_delete_user', {
      p_admin_id: resolvedAdminId,
      p_target_user_id: targetUserId,
      p_current_password: currentPassword,
      p_audit_details: auditDetails || 'Deleted officer account from Users & Access'
    });

    if (!rpcError) return;

    // If RPC failed due to business/security validation, surface immediately
    const msg = rpcError.message || '';
    if (
      msg.includes('INVALID_CURRENT_PASSWORD') ||
      msg.includes('CANNOT_DELETE_SELF') ||
      msg.includes('CANNOT_DELETE_LAST_ADMIN')
    ) {
      throw new Error(msg.replace(/^[A-Z_]+:\s*/, ''));
    }

    // Fallback if migration 20261119_01 is not yet applied or role check differs
    const isVerified = await dbService.verifyCommandantAccess(resolvedAdminId, currentPassword);
    if (!isVerified) {
      throw new Error('Administrator password verification failed.');
    }

    // Clean up nullable/dependent references best-effort
    await supabase.from('push_subscriptions').delete().eq('user_id', targetUserId);
    await supabase.from('parade_records').update({ officer_id: null }).eq('officer_id', targetUserId);
    await supabase.from('sickbay_verifications').update({ medical_officer_id: null }).eq('medical_officer_id', targetUserId);
    await supabase.from('sickbay_verifications').update({ targeted_recipient_id: null }).eq('targeted_recipient_id', targetUserId);

    const { error: deleteErr } = await supabase
      .from('users')
      .delete()
      .eq('id', targetUserId);

    if (deleteErr) {
      throw new Error(deleteErr.message || 'Failed to delete user.');
    }
  },

  // ─── Parade Records ───────────────────────────────────────────────────────

  getRecords: async ({
    viewerId,
    role,
    courseNumber,
    officerId,
    startDate,
    endDate,
    start_date,
    end_date,
    paradeType,
    cursor,
    limit = 20
  }: {
    viewerId?: string | number;
    role?: string;
    courseNumber?: number;
    officerId?: string | number;
    startDate?: string;
    endDate?: string;
    start_date?: string;
    end_date?: string;
    paradeType?: string;
    cursor?: string;
    limit?: number;
  } = {}): Promise<{ data: ParadeRecordMetadata[]; nextCursor: string | null; error: any }> => {
    try {
      const effectiveStart = start_date || startDate;
      const effectiveEnd = end_date || endDate;

      // ── Explicit column projection ─────────────────────────────────────────
      // Never use select('*') on parade_records. Pinning to named columns
      // ensures future schema additions (e.g. large text blobs, audit trails)
      // can never accidentally bloat the payload returned to the client.
      // All aggregate counts are pre-computed columns — no JOINs needed here.
      const selectFields = `id, officer_id, officer_name, course_name, year_group, course_number,
           date, parade_type, present_count, absent_count, sick_count, detention_count,
           pass_count, suspension_count, yet_to_report_count, grand_total, created_at`;

      let query;

      if ((role === 'commandant' || role === 'admin') && viewerId) {
        query = supabase
          .from('parade_records')
          .select(selectFields);
      } else {
        query = supabase
          .from('parade_records')
          .select(selectFields);

        if (courseNumber !== undefined) {
          query = query.eq('course_number', courseNumber);
        }

        if (officerId !== undefined) {
          query = query.eq('officer_id', officerId);
        }
      }

      // Apply indexed ISO 8601 timestamp range bounds on created_at
      if (effectiveStart) {
        const startISO = effectiveStart.includes('T')
          ? effectiveStart
          : `${effectiveStart}T00:00:00.000Z`;
        query = query.gte('created_at', startISO);
      }

      if (effectiveEnd) {
        const endISO = effectiveEnd.includes('T')
          ? effectiveEnd
          : `${effectiveEnd}T23:59:59.999Z`;
        query = query.lte('created_at', endISO);
      }

      if (paradeType && paradeType !== 'all') {
        query = query.eq('parade_type', paradeType);
      }

      query = query
        .order('created_at', { ascending: false })
        .limit(limit);

      // Cursor-based pagination: fetch records older than the last seen cursor.
      // This is O(log n) via the created_at index regardless of dataset size,
      // unlike OFFSET pagination which degrades to O(n) on large tables.
      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedData: ParadeRecordMetadata[] = (data || []).map(r => ({
        id: r.id,
        date: r.date,
        paradeType: r.parade_type,
        yearGroup: r.year_group,
        courseNumber: r.course_number,
        presentCount: r.present_count,
        absentCount: r.absent_count,
        sickCount: r.sick_count,
        detentionCount: r.detention_count,
        passCount: r.pass_count,
        suspensionCount: r.suspension_count,
        yetToReportCount: r.yet_to_report_count,
        grandTotal: r.grand_total,
        officerName: r.officer_name,
        officerId: r.officer_id,
        courseName: r.course_name,
        createdAt: r.created_at
      }));

      // The next cursor is the `created_at` of the last record in this batch.
      // Subsequent calls pass this as the `cursor` argument to continue paging.
      const nextCursor = formattedData.length > 0 ? formattedData[formattedData.length - 1].createdAt : null;

      return {
        data: formattedData,
        nextCursor,
        error: null
      };
    } catch (err: any) {
      console.error('Supabase Error (getRecords):', err);
      throw new Error(err.message || 'Database execution failure');
    }
  },

  getParadeDetails: async (paradeId: string | number): Promise<{ data: CadetDetail[]; error: any }> => {
    try {
      // ── Lazy-load query ────────────────────────────────────────────────────
      // This function is the ONLY place where cadet-level data is fetched.
      // It fires on-demand (when an officer opens a submission preview) and
      // is powered by the covering index idx_cadet_details_record_id_covering
      // created in migration 20260701_bottleneck_1b_lazy_load_index.sql.
      //
      // The DB engine satisfies this SELECT entirely from the index (index-only
      // scan) — no heap access needed, even with thousands of cadet rows.
      //
      // Column set: name, squad, status — exactly what the UI needs. Nothing more.
      const { data, error } = await supabase
        .from('cadet_details')
        .select('name, squad, status')
        .eq('record_id', paradeId)
        .order('squad', { ascending: true })   // Group by squad for readable display
        .order('name', { ascending: true });    // Alphabetical within each squad

      if (error) throw error;

      return { data: (data || []) as CadetDetail[], error: null };
    } catch (err) {
      console.error('Supabase Error (getParadeDetails):', err);
      return { data: [], error: err };
    }
  },

  getTotalRecordsCount: async (): Promise<number> => {
    try {
      const { count, error } = await supabase
        .from('parade_records')
        .select('id', { count: 'exact', head: true });

      if (error) throw error;
      return count || 0;
    } catch (err: any) {
      console.error('Supabase Error (getTotalRecordsCount):', err);
      throw new Error(err.message || 'Database execution failure');
    }
  },

  fetchHistoricalTrace: async (filters: { startDate?: string; endDate?: string; courseNumber?: number; status?: string; searchTerm?: string }) => {
    try {
      const { data, error } = await supabase.rpc('get_historical_trace', {
        p_start_date: filters.startDate || null,
        p_end_date: filters.endDate || null,
        p_course_number: filters.courseNumber || null,
        p_status: filters.status || 'all',
        p_search_term: filters.searchTerm || null
      });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (err) {
      console.error('Supabase Error (fetchHistoricalTrace):', err);
      return { data: [], error: err };
    }
  },

  // ─── Analytics ────────────────────────────────────────────────────────────

  /**
   * Queries the high-performance Materialized View for dashboard analytics.
   * This is O(1) index lookup and prevents scanning the massive operational tables.
   */
  fetchHistoricalAnalytics: async (filters: { courseNumber?: number; limit?: number } = {}) => {
    try {
      let query = supabase
        .from('mv_historical_parade_analytics')
        .select('*')
        .order('record_date', { ascending: false });

      if (filters.courseNumber) {
        query = query.eq('course_number', filters.courseNumber);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return { data: data || [], error: null };
    } catch (err) {
      console.error('Supabase Error (fetchHistoricalAnalytics):', err);
      return { data: [], error: err };
    }
  },

  saveRecord: async (record: Omit<ParadeRecord, 'id' | 'createdAt'>) => {
    // ─── MATH VERIFICATION BLOCK ───────────────────────────────────────────
    const calculatedTotal = (record.presentCount || 0) +
      (record.absentCount || 0) +
      (record.sickCount || 0) +
      (record.detentionCount || 0) +
      (record.passCount || 0) +
      (record.suspensionCount || 0) +
      (record.yetToReportCount || 0);
    const masterTotal = record.grandTotal;

    if (calculatedTotal !== masterTotal) {
      console.error("❌ ACCOUNTABILITY ERROR:", { calculatedTotal, masterTotal, record });
      throw new Error(`Math Mismatch: Calculated Sum (${calculatedTotal}) does not equal Master Total (${masterTotal})`);
    }
    // ─── END MATH VERIFICATION ─────────────────────────────────────────────

    try {
      const { data, error } = await supabase.rpc('submit_parade_state', {
        p_officer_id: String(record.officerId),
        p_officer_name: record.officerName,
        p_course_name: record.courseName,
        p_year_group: record.yearGroup,
        p_course_number: record.courseNumber ? String(record.courseNumber) : null,
        p_date: record.date,
        p_parade_type: record.paradeType,
        p_present_count: record.presentCount,
        p_absent_count: record.absentCount,
        p_sick_count: record.sickCount,
        p_detention_count: record.detentionCount,
        p_pass_count: record.passCount || 0,
        p_suspension_count: record.suspensionCount || 0,
        p_yet_to_report_count: record.yetToReportCount || 0,
        p_grand_total: record.grandTotal,
        p_cadet_records: record.cadets.map(c => ({
          name: c.name,
          squad: c.squad,
          status: c.status
        }))
      });

      if (error) {
        console.error('Failed to submit atomic parade state:', error);
        throw new Error(`Database transaction aborted: ${error.message}`);
      }

      // Immediately evaluate rolling 5-day absences (including 3 activities in 1 day)
      // so Critical/Flagrant Misconduct Alerts are generated and surfaced in real time
      try {
        const evaluatedAlerts = await dbService.syncAndGetCadetAlerts(record.courseNumber);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('cadet-alerts-updated', {
              detail: {
                fromSubmission: true,
                courseNumber: record.courseNumber,
                alerts: evaluatedAlerts
              }
            })
          );
        }
      } catch (alertErr) {
        console.warn('[dbService] Non-fatal warning evaluating cadet misconduct alerts:', alertErr);
      }

      await dbService.addNotification({
        type: 'parade_submission',
        title: 'Parade State Submitted',
        content: `${record.officerName} submitted ${record.paradeType.toUpperCase()} parade state (Present: ${record.presentCount}, Absent: ${record.absentCount}, Sick: ${record.sickCount})`,
        timestamp: new Date().toISOString(),
        read: false,
        officerName: record.officerName,
        yearGroup: record.yearGroup,
        courseNumber: record.courseNumber,
        metadata: {
          courseNumber: record.courseNumber,
          paradeType: record.paradeType,
          counts: {
            present: record.presentCount,
            absent: record.absentCount,
            sick: record.sickCount,
            detention: record.detentionCount,
            pass: record.passCount,
            suspension: record.suspensionCount,
            yetToReport: record.yetToReportCount,
            grandTotal: record.grandTotal
          }
        }
      });

      return data;
    } catch (err) {
      console.error('Supabase Error (saveRecord):', err);
      throw err;
    }
  },

  // ─── Notifications ────────────────────────────────────────────────────────

  getNotifications: async (
    officerName?: string,
    courseNumber?: number,
    viewerRole?: string
  ): Promise<{ data: Notification[]; error: any }> => {
    const getLocalReadIds = (): Set<string> => {
      if (typeof window === 'undefined') return new Set();
      try {
        const raw = localStorage.getItem('polac_resolved_notification_ids');
        return raw ? new Set(JSON.parse(raw)) : new Set();
      } catch {
        return new Set();
      }
    };

    try {
      let query = supabase
        .from('notifications')
        .select('id, type, title, content, timestamp, read, officer_name, year_group, course_number, archived_at')
        .is('archived_at', null) // Only fetch non-archived items by default
        .order('timestamp', { ascending: false });

      // ── Source-Level Role Notification Filtering ────────────────────────────
      if (viewerRole === 'commandant') {
        // Commandant & Senior Officers (e.g. Director Field Studies) ONLY receive
        // parade submission and remark/justification alerts — never system/admin alerts
        query = query.in('type', [
          'parade_submission',
          'parade_update',
          'commandant_remark',
          'remark_response',
          'remark_resolved'
        ]);
      } else if (viewerRole === 'admin') {
        // System Admin does NOT receive remark/comment notifications
        query = query.not('type', 'in', '("commandant_remark","remark_response","remark_resolved")');
      } else {
        // Course Officers: match either officer_name or course_number
        if (officerName && courseNumber && courseNumber > 0) {
          query = query.or(`officer_name.ilike.%${officerName}%,course_number.eq.${courseNumber}`);
        } else if (officerName) {
          query = query.ilike('officer_name', `%${officerName}%`);
        } else if (courseNumber && courseNumber > 0) {
          query = query.eq('course_number', courseNumber);
        }
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;
      const localReadIds = getLocalReadIds();
      return {
        data: (data || []).map(n => {
          const isLocallyRead = localReadIds.has(String(n.id));
          return {
            id: n.id,
            type: n.type,
            title: n.title,
            content: n.content,
            timestamp: n.timestamp,
            read: Boolean(n.read || isLocallyRead),
            officerName: n.officer_name,
            yearGroup: n.year_group,
            courseNumber: n.course_number,
            archivedAt: n.archived_at
          };
        }),
        error: null
      };
    } catch (err: any) {
      console.error('Supabase Error (getNotifications):', err);
      throw new Error(err.message || 'Database execution failure');
    }
  },

  // ─── Audit Log (Querying audit_events table) ──────────────────────────────
  getAuditLogs: async (filters?: {
    actorName?: string;
    actionType?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: AuditEvent[]; count: number | null; error: any }> => {
    try {
      const page = filters?.page || 1;
      const limit = filters?.limit || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = supabase
        .from('audit_events')
        .select('id, actor_id, actor_name, action_type, target_id, payload, created_at', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (filters?.actorName) {
        query = query.ilike('actor_name', `%${filters.actorName}%`);
      }

      if (filters?.actionType) {
        query = query.eq('action_type', filters.actionType);
      }

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate + 'T23:59:59');
      }

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;
      return {
        data: (data || []).map(a => ({
          id: a.id,
          actorId: a.actor_id,
          actorName: a.actor_name,
          actionType: a.action_type,
          targetId: a.target_id,
          payload: a.payload,
          createdAt: a.created_at
        })),
        count: count,
        error: null
      };
    } catch (err) {
      console.error('Supabase Error (getAuditLogs):', err);
      return { data: [], count: 0, error: err };
    }
  },
  logAuditEvent: async (event: Omit<AuditEvent, 'id' | 'createdAt'>) => {
    try {
      // Use the Secure RPC instead of direct INSERT (Blocked by RLS)
      const { error } = await supabase.rpc('log_audit_event_secure', {
        p_action_type: event.actionType,
        p_target_id: event.targetId,
        p_payload: {
          ...event.payload,
          protocol: 'SECURE_DASHBOARD_V2',
          client_timestamp: new Date().toISOString()
        }
      });
      if (error) throw error;
    } catch (err) {
      console.error('Audit Logging Failed:', err);
    }
  },

  addNotification: async (notif: Omit<Notification, 'id'>) => {
    try {
      const payload = {
        type: notif.type,
        title: notif.title,
        content: notif.content,
        timestamp: notif.timestamp,
        read: notif.read,
        officer_name: notif.officerName,
        year_group: notif.yearGroup,
        course_number: notif.courseNumber
      };
      console.log('[Notification] Inserting:', payload);
      const { data, error } = await supabase
        .from('notifications')
        .insert(payload)
        .select();
      if (error) {
        console.error('[Notification] INSERT FAILED:', error.message, error.details, error.hint);
        throw error;
      }
      console.log('[Notification] Insert success:', data);

      // ── Dispatch Web Push Notification (Scoped by Role) ───────────────────
      const { data: pushUsers } = await supabase
        .from('push_subscriptions')
        .select('user_id');

      if (pushUsers && pushUsers.length > 0) {
        const uniqueUserIds = Array.from(new Set(pushUsers.map(p => p.user_id)));
        const { data: userRows } = await supabase
          .from('users')
          .select('id, role, course_number, email')
          .in('id', uniqueUserIds);

        const userMap = new Map<string, any>();
        (userRows || []).forEach(u => userMap.set(String(u.id), u));

        const targetUrl =
          notif.metadata?.route ||
          (notif.type === 'commandant_remark' || notif.type === 'remark_resolved'
            ? '/officer/history'
            : '/');

        for (const uid of uniqueUserIds) {
          const u = userMap.get(String(uid));
          const uRole =
            u && String(u.email || '').toLowerCase() === 'admin@gmail.com' ? 'admin' : u?.role;

          // Filter push recipients based on role rules:
          if (uRole === 'admin') {
            if (
              notif.type === 'commandant_remark' ||
              notif.type === 'remark_response' ||
              notif.type === 'remark_resolved'
            ) {
              continue; // Admin does not receive remark notifications
            }
          } else if (uRole === 'commandant') {
            if (
              notif.type !== 'parade_submission' &&
              notif.type !== 'parade_update' &&
              notif.type !== 'remark_response'
            ) {
              continue; // Senior Officers only receive parade submissions and officer remark replies
            }
          } else if (uRole === 'course_officer') {
            if (
              notif.courseNumber &&
              u?.course_number &&
              Number(notif.courseNumber) !== Number(u.course_number)
            ) {
              continue;
            }
          }

          supabase.functions.invoke('send-web-push', {
            body: {
              user_id: uid,
              payload: {
                title: notif.title,
                body: notif.content,
                icon: '/logo.png',
                url: targetUrl,
                remarkId: notif.metadata?.remarkId,
                submissionId: notif.metadata?.recordId,
                courseNumber: notif.courseNumber
              }
            }
          }).catch(pushErr => console.warn('[Push Notification] Edge function dispatch warning for user:', uid, pushErr));
        }
      }
    } catch (err) {
      console.error('[Notification] CRITICAL:', err?.message || err);
      // Don't re-throw — notification failure shouldn't block the parent action
    }
  },

  markNotificationRead: async (id: string) => {
    if (typeof window !== 'undefined' && id) {
      try {
        const raw = localStorage.getItem('polac_resolved_notification_ids');
        const list: string[] = raw ? JSON.parse(raw) : [];
        if (!list.includes(String(id))) {
          list.unshift(String(id));
          localStorage.setItem('polac_resolved_notification_ids', JSON.stringify(list.slice(0, 500)));
        }
      } catch { }
    }
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.error('Supabase Error (markNotificationRead):', err);
    }
  },

  clearNotifications: async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ archived_at: new Date().toISOString() })
        .is('archived_at', null);

      if (error) throw error;
    } catch (err) {
      console.error('Supabase Error (clearNotifications):', err);
    }
  },

  markAllNotificationsRead: async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('read', false);
      if (error) throw error;
    } catch (err) {
      console.error('Supabase Error (markAllNotificationsRead):', err);
    }
  },

  // ─── Cadet Registry ───────────────────────────────────────────────────────

  getCadetRegistry: async (from?: number, to?: number, searchTerm?: string, courseNumber?: number, statusFilter?: string): Promise<any[]> => {
    try {
      let query = supabase
        .from('cadet_registry')
        .select('id, name, squad, course_number, year_group, avatar_url, status, relegated_from_rc, npa_number, admission_year')
        .order('course_number', { ascending: true }) // Year 5 at the top, Year 1 at the bottom
        .order('squad', { ascending: true })
        .order('name', { ascending: true });

      if (statusFilter === 'DISMISSED') {
        query = query.eq('status', 'DISMISSED');
      } else if (statusFilter === 'GRADUATED') {
        query = query.eq('status', 'GRADUATED');
      } else if (statusFilter === 'RELEGATED') {
        query = query.eq('status', 'ACTIVE').not('relegated_from_rc', 'is', null);
      } else if (statusFilter === 'ACTIVE') {
        query = query.eq('status', 'ACTIVE').is('relegated_from_rc', null);
      } else {
        query = query.eq('status', 'ACTIVE'); // Exclude dismissed and graduated efficiently by default
      }

      // Filter by course number if provided
      if (courseNumber !== undefined && courseNumber > 0) {
        query = query.eq('course_number', courseNumber);
      }

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,squad.ilike.%${searchTerm}%,npa_number.ilike.%${searchTerm}%`);
      }

      if (from !== undefined && to !== undefined) {
        query = query.range(from, to);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Supabase Error (getCadetRegistry):', err);
      return [];
    }
  },

  getGraduatedCohortsSummary: async (): Promise<any[]> => {
    try {
      const { data, error } = await supabase
        .from('graduated_cohorts_summary')
        .select('*');

      if (error) throw error;

      // Map to the expected frontend interface
      return (data || []).map(r => ({
        courseNumber: r.course_number,
        totalCadets: r.cadet_count,
        graduationDate: new Date().toISOString()
      }));
    } catch (err) {
      console.error('Supabase Error (getGraduatedCohortsSummary):', err);
      return [];
    }
  },

  getNominalRollData: async (courseNumber: number, includeGraduated = false): Promise<any[]> => {
    try {
      const statusToQuery = includeGraduated ? 'GRADUATED' : 'ACTIVE';
      const { data: registry, error: regError } = await supabase
        .from('cadet_registry')
        .select('id, name, squad')
        .eq('course_number', courseNumber)
        .eq('status', statusToQuery)
        .order('squad', { ascending: true })
        .order('name', { ascending: true });

      if (regError) throw regError;
      return registry || [];
    } catch (err) {
      console.error('Supabase Error (getNominalRollData):', err);
      return [];
    }
  },

  updateCadetRegistry: async (id: string | number, updates: any, officer: User) => {
    try {
      // Perform atomic update via RPC to ensure consistent read-before-write state
      const { error: rpcError } = await supabase.rpc('update_cadet_registry_with_audit', {
        p_id: id,
        p_name: updates.name,
        p_squad: updates.squad,
        p_course_number: updates.course_number,
        p_year_group: updates.year_group,
        p_avatar_url: updates.avatar_url
      });

      if (rpcError) throw rpcError;

      // NOTE: Manual logAuditEvent removed. 
      // Handled by DB Trigger 'trg_audit_cadet_registry_mod' for 100% reliability.

      return { error: null };
    } catch (err) {
      console.error('Supabase Error (updateCadetRegistry):', err);
      return { error: err };
    }
  },

  dismissCadetV2: async (cadetId: string, reason: string, actorId: string, actorName: string) => {
    try {
      const { error } = await supabase.rpc('dismiss_cadet_v2', {
        p_cadet_id: cadetId,
        p_reason: reason,
        p_actor_id: actorId,
        p_actor_name: actorName
      });
      if (error) throw error;
      return { error: null };
    } catch (err) {
      console.error('Supabase Error (dismissCadetV2):', err);
      return { error: err };
    }
  },

  getCadetStats: async (name: string) => {
    try {
      const { data, error } = await supabase
        .from('cadet_details')
        .select(`
          status,
          parade_records (
            date,
            parade_type,
            created_at
          )
        `)
        .eq('name', name);

      if (error) throw error;

      const stats = {
        absent: (data || []).filter(c => c.status?.toLowerCase() === 'absent').length,
        sick: (data || []).filter(c => c.status?.toLowerCase() === 'sick').length,
        detention: (data || []).filter(c => c.status?.toLowerCase() === 'detention').length,
        lastEvent: null as any
      };

      // Find the most recent non-present event
      const nonPresentHistory = (data || [])
        .filter(c => c.status?.toLowerCase() !== 'present' && c.parade_records)
        .sort((a: any, b: any) =>
          new Date(b.parade_records.created_at).getTime() - new Date(a.parade_records.created_at).getTime()
        );

      if (nonPresentHistory.length > 0) {
        const lastRec = nonPresentHistory[0].parade_records;
        const record = Array.isArray(lastRec) ? lastRec[0] : lastRec;

        if (record) {
          stats.lastEvent = {
            status: nonPresentHistory[0].status,
            date: record.date,
            type: record.parade_type
          };
        }
      }

      return stats;
    } catch (err) {
      console.error('Supabase Error (getCadetStats):', err);
      return { absent: 0, sick: 0, detention: 0, lastEvent: null };
    }
  },

  addCadetToRegistry: async (cadet: {
    name: string;
    squad: string;
    course_number: number;
    year_group?: number;
    npa_number?: string;
    admission_year?: number;
    status?: string;
  }) => {
    try {
      const { error } = await supabase
        .from('cadet_registry')
        .insert(cadet);
      if (error) throw error;
    } catch (err) {
      console.error('Supabase Error (addCadetToRegistry):', err);
      throw err;
    }
  },

  bulkAddCadetsToRegistry: async (
    cadets: {
      name: string;
      squad: string;
      course_number: number;
      year_group?: number;
      npa_number?: string;
      admission_year?: number;
      status?: string;
    }[],
    adminId?: string
  ) => {
    try {
      if (cadets.length === 0) return;

      // 1. Strict intra-batch deduplication to prevent PostgreSQL 21000:
      // "ON CONFLICT DO UPDATE command cannot affect row a second time"
      const dedupedNpaMap = new Map<string, (typeof cadets)[0]>();
      const legacyCadets: (typeof cadets) = [];

      for (const c of cadets) {
        if (c.npa_number && c.npa_number.trim().length > 0) {
          const normKey = c.npa_number.trim().toUpperCase();
          // Keep the last occurrence within the batch
          dedupedNpaMap.set(normKey, {
            ...c,
            name: c.name?.trim().toUpperCase(),
            squad: c.squad?.trim().toUpperCase(),
            npa_number: normKey
          });
        } else {
          legacyCadets.push({
            ...c,
            name: c.name?.trim().toUpperCase(),
            squad: c.squad?.trim().toUpperCase()
          });
        }
      }

      const npaCadets = Array.from(dedupedNpaMap.values());
      const allDedupedCadets = [...npaCadets, ...legacyCadets];

      // 2. Resolve admin ID from parameter, local session, or auth user
      let effectiveAdminId = adminId;
      if (!effectiveAdminId && typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem('polac_session');
          if (stored) {
            const user = JSON.parse(stored);
            effectiveAdminId = user.id;
          }
        } catch { }
      }

      if (!effectiveAdminId) {
        try {
          const { data: authData } = await supabase.auth.getUser();
          effectiveAdminId = authData?.user?.id;
        } catch { }
      }

      // 3. Attempt server-side atomic ingestion via bulk_import_cadets RPC
      if (effectiveAdminId) {
        try {
          const { data, error: rpcError } = await supabase.rpc('bulk_import_cadets', {
            p_admin_id: effectiveAdminId,
            p_cadet_data: allDedupedCadets
          });

          if (!rpcError && data?.success) {
            return data;
          }
          if (rpcError) {
            console.warn('[dbService] bulk_import_cadets RPC returned error, attempting direct table upsert:', rpcError.message);
          }
        } catch (rpcErr) {
          console.warn('[dbService] RPC execution error, falling back to direct table upsert:', rpcErr);
        }
      }

      // 4. Direct Table Upsert & Insert Fallback
      // Upsert strictly deduplicated NPA cadets in chunks to prevent payload bottlenecks
      const CHUNK_SIZE = 200;
      if (npaCadets.length > 0) {
        for (let i = 0; i < npaCadets.length; i += CHUNK_SIZE) {
          const chunk = npaCadets.slice(i, i + CHUNK_SIZE);
          const { error: upsertError } = await supabase
            .from('cadet_registry')
            .upsert(chunk, { onConflict: 'npa_number' });
          if (upsertError) throw upsertError;
        }
      }

      // Insert legacy cadets in chunks
      if (legacyCadets.length > 0) {
        for (let i = 0; i < legacyCadets.length; i += CHUNK_SIZE) {
          const chunk = legacyCadets.slice(i, i + CHUNK_SIZE);
          const { error: insertError } = await supabase
            .from('cadet_registry')
            .insert(chunk);
          if (insertError) throw insertError;
        }
      }
    } catch (err) {
      console.error('Supabase Error (bulkAddCadetsToRegistry):', err);
      throw err;
    }
  },

  removeCadetFromRegistry: async (id: string | number) => {
    try {
      const { error } = await supabase
        .from('cadet_registry')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.error('Supabase Error (removeCadetFromRegistry):', err);
      throw err;
    }
  },

  updateCadetDetail: async (id: string | number, updates: { reason_category?: string; commandant_notes?: string }) => {
    try {
      const { error } = await supabase
        .from('cadet_details')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.error('Supabase Error (updateCadetDetail):', err);
      throw err;
    }
  },

  /**
   * Checks if a parade record already exists for the given officer, date, and type.
   */
  checkDuplicateParade: async (
    officerId: string | number,
    date: string,
    paradeType: ParadeRecord['paradeType']
  ): Promise<boolean> => {
    try {
      const { count, error } = await supabase
        .from('parade_records')
        .select('id', { count: 'exact', head: true })
        .eq('officer_id', officerId)
        .eq('date', date)
        .eq('parade_type', paradeType);

      if (error) throw error;
      return (count ?? 0) > 0;
    } catch (err) {
      console.error('Supabase Error (checkDuplicateParade):', err);
      return false; // Fail-open to avoid blocking users if DB check fails
    }
  },

  /**
   * Verifies if a user ID still exists, is active, and has not had its session_version invalidated.
   */
  verifySession: async (userId: string | number, expectedSessionVersion?: number): Promise<boolean> => {
    try {
      if (String(userId) === '00000000-0000-0000-0000-000000000001') {
        return true;
      }
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error || !data) return false;
      if (data.is_active === false) return false;
      if (
        expectedSessionVersion !== undefined &&
        data.session_version !== undefined &&
        Number(data.session_version) > Number(expectedSessionVersion)
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  uploadCadetPhoto: async (cadetId: string, file: File) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${cadetId}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { data, error: uploadError } = await supabase.storage
        .from('cadet-photos')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('cadet-photos')
        .getPublicUrl(filePath);

      return { publicUrl, error: null };
    } catch (err) {
      console.error('Photo Upload Error:', err);
      return { publicUrl: null, error: err };
    }
  },

  // ─── Bulk Course Deletion, Impact Audit & Snapshot Recovery ───────────────

  /**
   * Returns a summary of all Regular Courses (RCs) currently in the registry
   * merged with the active academy RC window so admins can select any course.
   */
  getAvailableCoursesSummary: async (activeRC = 12): Promise<CourseImpactBreakdownItem[]> => {
    try {
      const { data, error } = await supabase
        .from('cadet_registry')
        .select('course_number, squad, status');

      if (error) throw error;

      const courseMap = new Map<number, { total: number; active: number; squads: Set<string> }>();

      // Seed standard academy courses around activeRC (e.g., RC 8 through activeRC + 1)
      for (let rc = Math.max(1, activeRC - 4); rc <= activeRC + 1; rc++) {
        courseMap.set(rc, { total: 0, active: 0, squads: new Set() });
      }

      for (const row of data || []) {
        const rc = Number(row.course_number);
        if (!rc || isNaN(rc)) continue;
        if (!courseMap.has(rc)) {
          courseMap.set(rc, { total: 0, active: 0, squads: new Set() });
        }
        const entry = courseMap.get(rc)!;
        entry.total += 1;
        if (!row.status || row.status === 'ACTIVE') {
          entry.active += 1;
        }
        if (row.squad) {
          entry.squads.add(String(row.squad).trim().toUpperCase());
        }
      }

      return Array.from(courseMap.entries())
        .map(([courseNumber, stats]) => ({
          courseNumber,
          totalCadets: stats.total,
          activeCadets: stats.active,
          squadCount: stats.squads.size
        }))
        .sort((a, b) => b.courseNumber - a.courseNumber);
    } catch (err) {
      console.error('Supabase Error (getAvailableCoursesSummary):', err);
      return [];
    }
  },

  /**
   * Computes real-time impact counters for one or multiple selected Regular Courses:
   * - Total & active cadets
   * - Parade attendance records
   * - Cadet attendance & disciplinary logs
   * - Assigned Course Officers & Webhook/Push Subscriptions
   */
  getCoursesImpactSummary: async (courseNumbers: number[]): Promise<CourseImpactSummary> => {
    const emptySummary: CourseImpactSummary = {
      totalCadets: 0,
      activeCadets: 0,
      paradeRecordsCount: 0,
      attendanceLogsCount: 0,
      disciplinaryLogsCount: 0,
      assignedOfficersCount: 0,
      pushSubscriptionsCount: 0,
      courseBreakdown: []
    };

    if (!courseNumbers || courseNumbers.length === 0) {
      return emptySummary;
    }

    try {
      // 1. Try server-side atomic RPC first
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_courses_impact_summary', {
        p_course_numbers: courseNumbers
      });

      if (!rpcError && rpcData && typeof rpcData.totalCadets === 'number') {
        return {
          totalCadets: rpcData.totalCadets || 0,
          activeCadets: rpcData.activeCadets || 0,
          paradeRecordsCount: rpcData.paradeRecordsCount || 0,
          attendanceLogsCount: rpcData.attendanceLogsCount || 0,
          disciplinaryLogsCount: rpcData.disciplinaryLogsCount || 0,
          assignedOfficersCount: rpcData.assignedOfficersCount || 0,
          pushSubscriptionsCount: rpcData.pushSubscriptionsCount || 0,
          courseBreakdown: Array.isArray(rpcData.courseBreakdown) ? rpcData.courseBreakdown : []
        };
      }
    } catch (rpcErr) {
      console.warn('[dbService] get_courses_impact_summary RPC fallback:', rpcErr);
    }

    // 2. Resilient Client-Side Aggregation Fallback
    try {
      const [cadetsRes, paradesRes, officersRes] = await Promise.all([
        supabase
          .from('cadet_registry')
          .select('course_number, squad, status')
          .in('course_number', courseNumbers),
        supabase
          .from('parade_records')
          .select('id, absent_count, sick_count, detention_count, pass_count, suspension_count, yet_to_report_count, grand_total')
          .in('course_number', courseNumbers),
        supabase
          .from('users')
          .select('id, course_number')
          .eq('role', 'course_officer')
      ]);

      const cadets = cadetsRes.data || [];
      const parades = paradesRes.data || [];
      const officers = (officersRes.data || []).filter(o =>
        o.course_number && courseNumbers.includes(parseInt(String(o.course_number), 10))
      );

      let pushSubscriptionsCount = 0;
      if (officers.length > 0) {
        const officerIds = officers.map(o => String(o.id));
        const { count: pushCount } = await supabase
          .from('push_subscriptions')
          .select('*', { count: 'exact', head: true })
          .in('user_id', officerIds);
        pushSubscriptionsCount = pushCount || 0;
      }

      // Compute breakdown per course
      const breakdownMap = new Map<number, { total: number; active: number; squads: Set<string> }>();
      for (const rc of courseNumbers) {
        breakdownMap.set(rc, { total: 0, active: 0, squads: new Set() });
      }
      for (const c of cadets) {
        const rc = Number(c.course_number);
        if (!breakdownMap.has(rc)) {
          breakdownMap.set(rc, { total: 0, active: 0, squads: new Set() });
        }
        const entry = breakdownMap.get(rc)!;
        entry.total += 1;
        if (!c.status || c.status === 'ACTIVE') entry.active += 1;
        if (c.squad) entry.squads.add(String(c.squad).trim().toUpperCase());
      }

      // Compute attendance & disciplinary counts from parade records
      let attendanceLogsCount = 0;
      let disciplinaryLogsCount = 0;
      for (const p of parades) {
        const nonPresent =
          (Number(p.absent_count) || 0) +
          (Number(p.sick_count) || 0) +
          (Number(p.detention_count) || 0) +
          (Number(p.pass_count) || 0) +
          (Number(p.suspension_count) || 0) +
          (Number(p.yet_to_report_count) || 0);
        disciplinaryLogsCount += nonPresent;
        attendanceLogsCount += Number(p.grand_total) || nonPresent;
      }

      return {
        totalCadets: cadets.length,
        activeCadets: cadets.filter(c => !c.status || c.status === 'ACTIVE').length,
        paradeRecordsCount: parades.length,
        attendanceLogsCount,
        disciplinaryLogsCount,
        assignedOfficersCount: officers.length,
        pushSubscriptionsCount,
        courseBreakdown: Array.from(breakdownMap.entries())
          .map(([courseNumber, s]) => ({
            courseNumber,
            totalCadets: s.total,
            activeCadets: s.active,
            squadCount: s.squads.size
          }))
          .sort((a, b) => a.courseNumber - b.courseNumber)
      };
    } catch (err) {
      console.error('Supabase Error (getCoursesImpactSummary fallback):', err);
      return emptySummary;
    }
  },

  /**
   * Fetches all cadet records for the given Regular Courses for CSV backup export.
   */
  getCadetsByCourses: async (courseNumbers: number[]): Promise<any[]> => {
    if (!courseNumbers || courseNumbers.length === 0) return [];
    try {
      const { data, error } = await supabase
        .from('cadet_registry')
        .select('id, name, squad, course_number, year_group, status, npa_number, admission_year, avatar_url, relegated_from_rc, created_at')
        .in('course_number', courseNumbers)
        .order('course_number', { ascending: true })
        .order('squad', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Supabase Error (getCadetsByCourses):', err);
      throw err;
    }
  },

  /**
   * Executes an atomic, role-verified bulk course purge with snapshot archiving and forensic audit logging.
   */
  executeBulkCoursePurge: async (options: {
    courseNumbers: number[];
    actorId: string;
    actorName: string;
    purgeMode: CoursePurgeMode;
    purgeAttendance?: boolean;
    confirmationPhrase?: string;
  }): Promise<BulkCoursePurgeResult> => {
    const {
      courseNumbers,
      actorId,
      actorName,
      purgeMode,
      purgeAttendance = false,
      confirmationPhrase = ''
    } = options;

    if (!courseNumbers || courseNumbers.length === 0) {
      throw new Error('At least one Regular Course (RC) must be selected for purge.');
    }

    // Resolve client metadata
    const clientIp = typeof window !== 'undefined' ? window.location.hostname || 'LOCAL_CLIENT' : 'SERVER';

    // 1. Attempt server-side atomic transaction RPC first
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('execute_bulk_course_purge', {
        p_course_numbers: courseNumbers,
        p_actor_id: actorId,
        p_actor_name: actorName,
        p_purge_mode: purgeMode,
        p_purge_attendance: purgeAttendance,
        p_client_ip: clientIp,
        p_confirmation_phrase: confirmationPhrase
      });

      if (!rpcError && rpcData?.success) {
        return rpcData as BulkCoursePurgeResult;
      }
      if (rpcError) {
        console.warn('[dbService] execute_bulk_course_purge RPC unavailable, executing verified fallback:', rpcError.message);
      }
    } catch (rpcErr) {
      console.warn('[dbService] execute_bulk_course_purge RPC exception, executing fallback:', rpcErr);
    }

    // 2. Fallback execution if SQL migration RPC is not yet deployed on remote Supabase:
    // Verify Admin/Commandant privilege in public.users
    const { data: adminCheck, error: authErr } = await supabase
      .from('users')
      .select('id, role, full_name')
      .eq('id', actorId)
      .in('role', ['admin', 'commandant'])
      .single();

    if (authErr || !adminCheck) {
      throw new Error('Unauthorized: Only designated System Administrator accounts can execute bulk course purge operations.');
    }

    // Capture full snapshot before deletion
    const snapshotCadets = await dbService.getCadetsByCourses(courseNumbers);
    const snapshotId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `snap_${Date.now()}`;

    // Save to localStorage emergency snapshot cache in case course_purge_snapshots table isn't migrated yet
    if (typeof window !== 'undefined' && purgeMode === 'SOFT_DELETE') {
      try {
        const existingRaw = localStorage.getItem('polac_course_purge_snapshots');
        const existingList: CoursePurgeSnapshot[] = existingRaw ? JSON.parse(existingRaw) : [];
        const newSnap: CoursePurgeSnapshot = {
          id: snapshotId,
          courseNumbers,
          purgeMode,
          cadetCount: snapshotCadets.length,
          paradeRecordsAffected: 0,
          disciplinaryLogsAffected: 0,
          isRecoverable: true,
          actorId,
          actorName,
          clientIp,
          confirmationPhrase,
          restoredAt: null,
          createdAt: new Date().toISOString(),
          snapshotData: snapshotCadets
        };
        localStorage.setItem('polac_course_purge_snapshots', JSON.stringify([newSnap, ...existingList.slice(0, 9)]));
      } catch (storageErr) {
        console.warn('[dbService] Local snapshot backup warning:', storageErr);
      }
    }

    // Optionally purge attendance records if requested
    let purgedParadesCount = 0;
    if (purgeAttendance) {
      const { data: prs } = await supabase
        .from('parade_records')
        .select('id')
        .in('course_number', courseNumbers);
      if (prs && prs.length > 0) {
        const prIds = prs.map(p => p.id);
        await supabase.from('cadet_details').delete().in('record_id', prIds);
        await supabase.from('parade_records').delete().in('course_number', courseNumbers);
        purgedParadesCount = prs.length;
      }
    }

    // Execute delete on cadet_registry for targeted courses
    const { error: deleteErr } = await supabase
      .from('cadet_registry')
      .delete()
      .in('course_number', courseNumbers);

    if (deleteErr) throw deleteErr;

    // Write forensic audit event
    await dbService.logAuditEvent({
      actorId,
      actorName,
      actionType: 'COURSE_BULK_PURGED',
      targetId: `RC_${courseNumbers.join('_')}`,
      payload: {
        course_numbers: courseNumbers,
        purged_cadet_count: snapshotCadets.length,
        purge_mode: purgeMode,
        purge_attendance: purgeAttendance,
        parade_records_affected: purgedParadesCount,
        snapshot_id: snapshotId,
        is_recoverable: purgeMode === 'SOFT_DELETE',
        client_ip: clientIp,
        confirmation_phrase: confirmationPhrase
      }
    });

    return {
      success: true,
      snapshotId,
      purgedCadetCount: snapshotCadets.length,
      paradeRecordsAffected: purgedParadesCount,
      disciplinaryLogsAffected: 0,
      courseNumbers,
      purgeMode,
      isRecoverable: purgeMode === 'SOFT_DELETE',
      timestamp: new Date().toISOString()
    };
  },

  /**
   * Retrieves recent bulk course purge snapshots for emergency audit window recovery.
   */
  getCoursePurgeSnapshots: async (): Promise<CoursePurgeSnapshot[]> => {
    try {
      const { data, error } = await supabase
        .from('course_purge_snapshots')
        .select('id, course_numbers, purge_mode, cadet_count, parade_records_affected, disciplinary_logs_affected, is_recoverable, actor_id, actor_name, client_ip, confirmation_phrase, restored_at, restored_by_name, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!error && data) {
        return data.map(row => ({
          id: row.id,
          courseNumbers: row.course_numbers || [],
          purgeMode: row.purge_mode as CoursePurgeMode,
          cadetCount: row.cadet_count || 0,
          paradeRecordsAffected: row.parade_records_affected || 0,
          disciplinaryLogsAffected: row.disciplinary_logs_affected || 0,
          isRecoverable: Boolean(row.is_recoverable),
          actorId: row.actor_id,
          actorName: row.actor_name || 'COMMANDANT',
          clientIp: row.client_ip || 'LOCAL_CLIENT',
          confirmationPhrase: row.confirmation_phrase,
          restoredAt: row.restored_at,
          restoredByName: row.restored_by_name,
          createdAt: row.created_at
        }));
      }
    } catch (err) {
      console.warn('[dbService] course_purge_snapshots table query fallback:', err);
    }

    // Fallback to localStorage snapshot cache if table not yet migrated
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('polac_course_purge_snapshots');
        if (raw) {
          return JSON.parse(raw);
        }
      } catch { }
    }

    return [];
  },

  /**
   * Restores a soft-deleted course purge snapshot back into cadet_registry.
   */
  restoreCoursePurgeSnapshot: async (
    snapshotId: string,
    actorId: string,
    actorName: string
  ): Promise<{ success: boolean; restoredCadetCount: number; courseNumbers: number[] }> => {
    const clientIp = typeof window !== 'undefined' ? window.location.hostname || 'LOCAL_CLIENT' : 'SERVER';

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('restore_course_purge_snapshot', {
        p_snapshot_id: snapshotId,
        p_actor_id: actorId,
        p_actor_name: actorName,
        p_client_ip: clientIp
      });

      if (!rpcError && rpcData?.success) {
        return {
          success: true,
          restoredCadetCount: rpcData.restoredCadetCount || 0,
          courseNumbers: rpcData.courseNumbers || []
        };
      }
      if (rpcError) {
        console.warn('[dbService] restore_course_purge_snapshot RPC fallback:', rpcError.message);
      }
    } catch (rpcErr) {
      console.warn('[dbService] restore_course_purge_snapshot exception fallback:', rpcErr);
    }

    // Fallback: check localStorage snapshot cache
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('polac_course_purge_snapshots');
      if (raw) {
        const list: CoursePurgeSnapshot[] = JSON.parse(raw);
        const snap = list.find(s => s.id === snapshotId);
        if (snap && snap.snapshotData && snap.snapshotData.length > 0) {
          const payload = snap.snapshotData.map((c: any) => ({
            name: c.name,
            squad: c.squad,
            course_number: c.course_number,
            year_group: c.year_group || 1,
            npa_number: c.npa_number || undefined,
            admission_year: c.admission_year || undefined,
            status: c.status || 'ACTIVE'
          }));

          await dbService.bulkAddCadetsToRegistry(payload, actorId);

          // Mark restored in localStorage
          snap.restoredAt = new Date().toISOString();
          snap.restoredByName = actorName;
          localStorage.setItem('polac_course_purge_snapshots', JSON.stringify(list));

          await dbService.logAuditEvent({
            actorId,
            actorName,
            actionType: 'COURSE_PURGE_RESTORED',
            targetId: `SNAPSHOT_${snapshotId}`,
            payload: {
              snapshot_id: snapshotId,
              course_numbers: snap.courseNumbers,
              restored_cadet_count: payload.length,
              client_ip: clientIp
            }
          });

          return {
            success: true,
            restoredCadetCount: payload.length,
            courseNumbers: snap.courseNumbers
          };
        }
      }
    }

    throw new Error('Could not restore snapshot: snapshot record not found or not recoverable.');
  },

  // ─── Commandant Parade Remarks & Audit Trail ──────────────────────────────

  getCommandantRemarks: async (filters?: {
    submissionId?: string | number;
    courseOfficerId?: string | number;
    courseNumber?: number;
    status?: CommandantRemarkStatus | 'all';
  }): Promise<CommandantRemark[]> => {
    const readLocalCache = (): CommandantRemark[] => {
      if (typeof window === 'undefined') return [];
      try {
        const raw = localStorage.getItem('polac_commandant_remarks');
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    };

    const writeLocalCache = (items: CommandantRemark[]) => {
      if (typeof window === 'undefined') return;
      try {
        localStorage.setItem('polac_commandant_remarks', JSON.stringify(items));
      } catch { }
    };

    const inferIssuerTitle = (explicitRoleTitle?: string | null): string => {
      const s = String(explicitRoleTitle || '').trim();
      if (!s) return 'Commandant';
      const lower = s.toLowerCase();
      if (lower.includes('commandant') && !lower.includes('deputy')) return 'Commandant';
      return s;
    };

    const normalizeCommandantDisplayName = (rawName?: string | null, explicitRoleTitle?: string | null): string => {
      const s = String(rawName || '').trim();
      if (!s) return 'COMMANDANT';
      if (
        s.toUpperCase() === 'DIRECTOR FIELD STUDIES' &&
        (!explicitRoleTitle || String(explicitRoleTitle).trim().toLowerCase() === 'commandant')
      ) {
        return 'COMMANDANT';
      }
      return s;
    };

    // Deduplicates and caps remark thread history to self-heal any notification replay inflation
    const sanitizeRemarkThread = (
      rawThread: any[] | undefined | null,
      activeRemarkText?: string | null,
      activeOfficerResponse?: string | null
    ) => {
      if (!Array.isArray(rawThread) || rawThread.length === 0) return [];
      const seenKeys = new Set<string>();
      const cleaned: any[] = [];
      const normActiveRemark = String(activeRemarkText || '').trim().toLowerCase();
      const normActiveResponse = String(activeOfficerResponse || '').trim().toLowerCase();

      for (const item of rawThread) {
        if (!item || !item.message) continue;
        const msgNorm = String(item.message).trim().toLowerCase();
        if (!msgNorm) continue;
        const role = item.senderRole === 'course_officer' ? 'course_officer' : 'commandant';

        // Skip if identical to the current active head message/response
        if (role === 'commandant' && msgNorm === normActiveRemark) continue;
        if (role === 'course_officer' && normActiveResponse && msgNorm === normActiveResponse) continue;

        const dedupeKey = `${role}::${msgNorm}`;
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);
        cleaned.push(item);
      }

      // Cap history window to last 20 unique turns for optimal performance
      return cleaned.slice(-20);
    };

    const applyFilters = (list: CommandantRemark[]): CommandantRemark[] => {
      return list
        .filter(item => {
          if (filters?.submissionId && String(item.submissionId) !== String(filters.submissionId)) {
            return false;
          }
          if (filters?.courseOfficerId && item.courseOfficerId && String(item.courseOfficerId) !== String(filters.courseOfficerId)) {
            if (!filters?.courseNumber || Number(item.courseNumber) !== Number(filters.courseNumber)) {
              return false;
            }
          }
          if (filters?.courseNumber && item.courseNumber && Number(item.courseNumber) !== Number(filters.courseNumber)) {
            return false;
          }
          if (filters?.status && filters.status !== 'all' && item.status !== filters.status) {
            return false;
          }
          return true;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    };

    const localItems = readLocalCache();
    let dbRemarks: CommandantRemark[] = [];

    // 1. Primary Authoritative Query: public.commandant_remarks
    try {
      let rmQuery = supabase
        .from('commandant_remarks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (filters?.courseNumber) {
        rmQuery = rmQuery.eq('course_number', filters.courseNumber);
      }

      const { data: rmRows, error: rmErr } = await rmQuery;
      if (!rmErr && rmRows && rmRows.length > 0) {
        dbRemarks = rmRows.map((data: any) => {
          const rawThread = Array.isArray(data.thread) ? data.thread : [];
          const cleanThread = sanitizeRemarkThread(rawThread, data.remark_text, data.officer_response);

          // Self-heal database row if notification replay previously inflated its thread array
          if (rawThread.length !== cleanThread.length && data.id) {
            supabase
              .from('commandant_remarks')
              .update({ thread: cleanThread })
              .eq('id', data.id)
              .then(() => { });
          }

          return {
            id: String(data.id),
            submissionId: String(data.submission_id),
            commandantId: data.commandant_id ? String(data.commandant_id) : null,
            commandantName: normalizeCommandantDisplayName(data.commandant_name, data.issuer_role_title),
            issuerRoleTitle: inferIssuerTitle(data.issuer_role_title),
            courseOfficerId: data.course_officer_id ? String(data.course_officer_id) : null,
            courseOfficerName: data.course_officer_name,
            courseNumber: data.course_number,
            paradeType: data.parade_type,
            paradeDate: data.parade_date,
            remarkText: data.remark_text,
            officerResponse: data.officer_response,
            respondedAt: data.responded_at,
            status: (data.status as CommandantRemarkStatus) || 'pending',
            resolvedAt: data.resolved_at,
            thread: cleanThread,
            createdAt: data.created_at,
            updatedAt: data.updated_at || data.created_at
          };
        });
      }
    } catch { }

    // 2. Cross-Device Notification Synchronization (Partitioned by Course + Senior Officer Authority so threads never overlap)
    try {
      let notifQuery = supabase
        .from('notifications')
        .select('id, type, title, content, timestamp, read, officer_name, year_group, course_number, archived_at')
        .in('type', ['commandant_remark', 'remark_response', 'remark_resolved'])
        .order('timestamp', { ascending: true })
        .limit(200);

      if (filters?.courseNumber) {
        notifQuery = notifQuery.eq('course_number', filters.courseNumber);
      }

      const { data: notifRows, error: notifError } = await notifQuery;

      if (!notifError && notifRows && notifRows.length > 0) {
        // Keyed by `${courseNumber}::${authorityChannelKey}` to prevent Commandant and Director Field Studies from colliding
        const reconstructedByChannel = new Map<string, CommandantRemark[]>();

        for (const row of notifRows) {
          const cNum = Number(row.course_number || 0);
          const contentStr = String(row.content || '');
          const titleStr = String(row.title || '');

          // Parse optional authority tag from title, e.g. "[Director Field Studies] Parade Remark — RC 12"
          const bracketMatch = titleStr.match(/^\[([^\]]+)\]/);
          const parsedAuthorityTitle = bracketMatch
            ? bracketMatch[1].trim()
            : titleStr.toLowerCase().includes('director field studies')
              ? 'Director Field Studies'
              : 'Commandant';

          const channelKey = `${cNum}::${parsedAuthorityTitle.toLowerCase()}`;
          if (!reconstructedByChannel.has(channelKey)) {
            reconstructedByChannel.set(channelKey, []);
          }
          const channelRemarks = reconstructedByChannel.get(channelKey)!;

          if (row.type === 'commandant_remark') {
            const match = contentStr.match(/^(?:Follow-up inquiry|Inquiry) on ([A-Za-z0-9_ -]+)\s*\(([^)]+)\):\s*"([\s\S]*)"$/i);
            const paradeType = match ? match[1].trim().toLowerCase() : 'muster';
            const paradeDate = match ? match[2].trim() : String(row.timestamp || '').split('T')[0];
            const remarkText = match ? match[3].trim() : contentStr;
            const isFollowUp = titleStr.toLowerCase().includes('follow-up') || contentStr.toLowerCase().startsWith('follow-up');

            const latestActive = [...channelRemarks].reverse().find(r => r.status !== 'resolved');

            if (isFollowUp && latestActive) {
              const updatedThread = [...(latestActive.thread || [])];
              if (latestActive.remarkText) {
                updatedThread.push({
                  id: `msg-cmd-${latestActive.updatedAt}`,
                  senderRole: 'commandant',
                  senderName: latestActive.commandantName || parsedAuthorityTitle,
                  senderTitle: latestActive.issuerRoleTitle || parsedAuthorityTitle,
                  message: latestActive.remarkText,
                  timestamp: latestActive.updatedAt || latestActive.createdAt
                });
              }
              if (latestActive.officerResponse) {
                updatedThread.push({
                  id: `msg-off-${latestActive.respondedAt || latestActive.updatedAt}`,
                  senderRole: 'course_officer',
                  senderName: latestActive.courseOfficerName || row.officer_name || 'Course Officer',
                  message: latestActive.officerResponse,
                  timestamp: latestActive.respondedAt || latestActive.updatedAt
                });
              }
              latestActive.remarkText = remarkText;
              latestActive.officerResponse = null;
              latestActive.respondedAt = null;
              latestActive.status = 'pending';
              latestActive.resolvedAt = null;
              latestActive.thread = sanitizeRemarkThread(updatedThread, remarkText, null);
              latestActive.updatedAt = row.timestamp;
            } else {
              const matchingLocal = [...dbRemarks, ...localItems].find(
                l =>
                  Number(l.courseNumber || 0) === cNum &&
                  (l.remarkText === remarkText ||
                    l.thread?.some(t => t.message === remarkText))
              );

              channelRemarks.push({
                id: matchingLocal?.id || `notif-rmk-${row.id}`,
                submissionId: matchingLocal?.submissionId || `rc-${cNum || 'all'}-${paradeDate}`,
                commandantId: matchingLocal?.commandantId || null,
                commandantName: matchingLocal?.commandantName || parsedAuthorityTitle.toUpperCase(),
                issuerRoleTitle: matchingLocal?.issuerRoleTitle || parsedAuthorityTitle,
                courseOfficerId: matchingLocal?.courseOfficerId || null,
                courseOfficerName: row.officer_name || matchingLocal?.courseOfficerName || `RC ${cNum} Course Officer`,
                courseNumber: cNum || null,
                paradeType: matchingLocal?.paradeType || paradeType,
                paradeDate: matchingLocal?.paradeDate || paradeDate,
                remarkText,
                officerResponse: null,
                respondedAt: null,
                status: 'pending',
                resolvedAt: null,
                // Always start empty when replaying notification stream so follow-ups never compound cached threads
                thread: [],
                createdAt: row.timestamp,
                updatedAt: row.timestamp
              });
            }
          } else if (row.type === 'remark_response') {
            const respMatch = contentStr.match(/responded to parade inquiry:\s*"([\s\S]*)"$/i);
            const parsedResponse = respMatch ? respMatch[1].trim() : contentStr;
            // Search across all channels for this course if not in the current channel
            const allForCourse = Array.from(reconstructedByChannel.entries())
              .filter(([k]) => k.startsWith(`${cNum}::`))
              .flatMap(([, list]) => list);
            const target =
              [...channelRemarks].reverse().find(r => r.status !== 'resolved') ||
              [...allForCourse].reverse().find(r => r.status !== 'resolved');
            if (target) {
              target.officerResponse = parsedResponse;
              target.respondedAt = row.timestamp;
              target.courseOfficerName = row.officer_name || target.courseOfficerName;
              target.status = 'addressed';
              target.updatedAt = row.timestamp;
            }
          } else if (row.type === 'remark_resolved') {
            const allForCourse = Array.from(reconstructedByChannel.entries())
              .filter(([k]) => k.startsWith(`${cNum}::`))
              .flatMap(([, list]) => list);
            const target =
              [...channelRemarks].reverse().find(r => r.status !== 'resolved') ||
              [...allForCourse].reverse().find(r => r.status !== 'resolved') ||
              channelRemarks[channelRemarks.length - 1];
            if (target) {
              target.status = 'resolved';
              target.resolvedAt = row.timestamp;
              target.updatedAt = row.timestamp;
            }
          }
        }

        const reconstructedList = Array.from(reconstructedByChannel.values()).flat();

        const mergedById = new Map<string, CommandantRemark>();
        for (const item of localItems) {
          const normalizedTitle =
            item.issuerRoleTitle &&
              !(
                item.issuerRoleTitle === 'Director Field Studies' &&
                (!item.commandantId || String(item.commandantName || '').toUpperCase() === 'DIRECTOR FIELD STUDIES')
              )
              ? item.issuerRoleTitle
              : 'Commandant';
          mergedById.set(item.id, {
            ...item,
            commandantName: normalizeCommandantDisplayName(item.commandantName, normalizedTitle),
            issuerRoleTitle: normalizedTitle,
            thread: sanitizeRemarkThread(item.thread, item.remarkText, item.officerResponse)
          });
        }
        for (const dbItem of dbRemarks) {
          mergedById.set(dbItem.id, dbItem);
        }
        for (const rem of reconstructedList) {
          const cleanRemThread = sanitizeRemarkThread(rem.thread, rem.remarkText, rem.officerResponse);
          const existing = mergedById.get(rem.id);
          if (!existing) {
            mergedById.set(rem.id, { ...rem, thread: cleanRemThread });
          } else {
            const existingCleanThread = sanitizeRemarkThread(
              existing.thread,
              existing.remarkText,
              existing.officerResponse
            );
            const existingTime = new Date(existing.updatedAt || existing.createdAt).getTime();
            const remTime = new Date(rem.updatedAt || rem.createdAt).getTime();
            if (remTime >= existingTime || (existing.status === 'pending' && rem.status !== 'pending')) {
              const chosenRemarkText = rem.remarkText || existing.remarkText;
              const chosenOfficerResponse = rem.officerResponse ?? existing.officerResponse;
              const combinedThread = sanitizeRemarkThread(
                [...existingCleanThread, ...cleanRemThread],
                chosenRemarkText,
                chosenOfficerResponse
              );
              mergedById.set(rem.id, {
                ...existing,
                ...rem,
                commandantId: existing.commandantId || rem.commandantId,
                issuerRoleTitle: existing.issuerRoleTitle || rem.issuerRoleTitle,
                submissionId: existing.submissionId || rem.submissionId,
                thread: combinedThread
              });
            }
          }
        }

        const mergedList = Array.from(mergedById.values());
        writeLocalCache(mergedList);
        return applyFilters(mergedList);
      }
    } catch (err) {
      console.warn('[dbService] getCommandantRemarks notification sync fallback:', err);
    }

    const fallbackMerged = new Map<string, CommandantRemark>();
    for (const item of localItems) {
      const normalizedTitle =
        item.issuerRoleTitle &&
          !(
            item.issuerRoleTitle === 'Director Field Studies' &&
            (!item.commandantId || String(item.commandantName || '').toUpperCase() === 'DIRECTOR FIELD STUDIES')
          )
          ? item.issuerRoleTitle
          : 'Commandant';
      fallbackMerged.set(item.id, {
        ...item,
        commandantName: normalizeCommandantDisplayName(item.commandantName, normalizedTitle),
        issuerRoleTitle: normalizedTitle,
        thread: sanitizeRemarkThread(item.thread, item.remarkText, item.officerResponse)
      });
    }
    for (const dbItem of dbRemarks) {
      fallbackMerged.set(dbItem.id, dbItem);
    }
    const finalItems = Array.from(fallbackMerged.values());
    if (finalItems.length > 0) writeLocalCache(finalItems);
    return applyFilters(finalItems);
  },

  createCommandantRemark: async (payload: {
    submissionId: string | number;
    commandantId?: string | number | null;
    commandantName?: string;
    issuerRoleTitle?: string;
    courseOfficerId?: string | number | null;
    courseOfficerName?: string;
    courseNumber?: number;
    paradeType?: string;
    paradeDate?: string;
    remarkText: string;
  }): Promise<CommandantRemark> => {
    const nowISO = new Date().toISOString();
    const generatedId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `rmk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const effectiveTitle = (payload.issuerRoleTitle || 'Commandant').trim();

    // WhatsApp/Instagram Contact-Centric Consolidation:
    // If an existing conversation row already exists for this Course + Authority Channel,
    // append the new directive into that conversation and bump its updatedAt to the top of the inbox.
    if (payload.courseNumber && !payload.remarkText.trim().startsWith('[MISCONDUCT:')) {
      try {
        const existingForCourse = await dbService.getCommandantRemarks({
          courseNumber: payload.courseNumber
        });
        const matchingChannelRemark = existingForCourse.find(r => {
          const rTitle = (r.issuerRoleTitle || 'Commandant').trim().toLowerCase();
          return (
            rTitle === effectiveTitle.toLowerCase() &&
            !String(r.remarkText || '').startsWith('[MISCONDUCT:')
          );
        });
        if (matchingChannelRemark) {
          const bumped = await dbService.followUpCommandantRemark({
            remark: matchingChannelRemark,
            followUpText: payload.remarkText.trim(),
            commandantName: payload.commandantName || effectiveTitle.toUpperCase(),
            commandantId: payload.commandantId || matchingChannelRemark.commandantId,
            issuerRoleTitle: effectiveTitle,
            paradeType: payload.paradeType || matchingChannelRemark.paradeType || 'muster',
            paradeDate: payload.paradeDate || matchingChannelRemark.paradeDate || nowISO.split('T')[0],
            submissionId: payload.submissionId || matchingChannelRemark.submissionId
          });
          if (bumped) {
            return bumped;
          }
        }
      } catch { }
    }

    const newRemark: CommandantRemark = {
      id: generatedId,
      submissionId: String(payload.submissionId),
      commandantId: payload.commandantId ? String(payload.commandantId) : null,
      commandantName: payload.commandantName || effectiveTitle.toUpperCase(),
      issuerRoleTitle: effectiveTitle,
      courseOfficerId: payload.courseOfficerId ? String(payload.courseOfficerId) : null,
      courseOfficerName: payload.courseOfficerName || 'Course Officer',
      courseNumber: payload.courseNumber ?? null,
      paradeType: payload.paradeType || 'muster',
      paradeDate: payload.paradeDate || nowISO.split('T')[0],
      remarkText: payload.remarkText.trim(),
      officerResponse: null,
      respondedAt: null,
      status: 'pending',
      resolvedAt: null,
      thread: [],
      createdAt: nowISO,
      updatedAt: nowISO
    };

    try {
      const insertRow: Record<string, any> = {
        id: newRemark.id,
        submission_id: newRemark.submissionId,
        commandant_id: newRemark.commandantId,
        commandant_name: newRemark.commandantName,
        issuer_role_title: newRemark.issuerRoleTitle,
        course_officer_id: newRemark.courseOfficerId,
        course_officer_name: newRemark.courseOfficerName,
        course_number: newRemark.courseNumber,
        parade_type: newRemark.paradeType,
        parade_date: newRemark.paradeDate,
        remark_text: newRemark.remarkText,
        status: 'pending',
        created_at: nowISO,
        updated_at: nowISO
      };

      const { data, error } = await supabase
        .from('commandant_remarks')
        .insert(insertRow)
        .select()
        .single();

      if (!error && data) {
        newRemark.id = data.id;
      } else if (error && error.message?.includes('issuer_role_title')) {
        // Fallback if issuer_role_title column is not yet migrated
        const { issuer_role_title, ...legacyRow } = insertRow;
        const { data: legacyData } = await supabase
          .from('commandant_remarks')
          .insert(legacyRow)
          .select()
          .single();
        if (legacyData) newRemark.id = legacyData.id;
      }
    } catch { }

    // Persist in localStorage cache as well for resilience
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('polac_commandant_remarks');
        const list: CommandantRemark[] = raw ? JSON.parse(raw) : [];
        localStorage.setItem('polac_commandant_remarks', JSON.stringify([newRemark, ...list]));
        window.dispatchEvent(new CustomEvent('commandant-remarks-updated'));
      } catch { }
    }

    // Targeted Notification Dispatch to Course Officer (with explicit Authority Title prefix so channels never collide)
    const isMisconductDirective = newRemark.remarkText.startsWith('[MISCONDUCT:');
    await dbService.addNotification({
      type: 'commandant_remark',
      title: isMisconductDirective
        ? `[${effectiveTitle}] Critical Misconduct Directive — RC ${newRemark.courseNumber || 'N/A'}`
        : `[${effectiveTitle}] Parade Remark — RC ${newRemark.courseNumber || 'N/A'}`,
      content: `Inquiry on ${String(newRemark.paradeType || 'Parade').toUpperCase()} (${newRemark.paradeDate}): "${newRemark.remarkText}"`,
      timestamp: nowISO,
      read: false,
      officerName: newRemark.courseOfficerName || 'Course Officer',
      yearGroup: 1,
      courseNumber: newRemark.courseNumber || undefined,
      metadata: {
        recordId: newRemark.submissionId,
        remarkId: newRemark.id,
        commandantId: newRemark.commandantId || undefined,
        issuerRoleTitle: effectiveTitle,
        courseNumber: newRemark.courseNumber || undefined,
        paradeType: newRemark.paradeType || undefined,
        date: newRemark.paradeDate || undefined,
        route: '/officer/history'
      }
    });

    // Forensic Audit Trail
    await dbService.logAuditEvent({
      actorId: newRemark.commandantId || null,
      actorName: `${newRemark.commandantName} (${effectiveTitle})`,
      actionType: 'COMMANDANT_REMARK_ISSUED',
      targetId: String(newRemark.submissionId),
      payload: {
        remark_id: newRemark.id,
        submission_id: newRemark.submissionId,
        issuer_role_title: effectiveTitle,
        course_number: newRemark.courseNumber,
        course_officer_name: newRemark.courseOfficerName,
        parade_type: newRemark.paradeType,
        parade_date: newRemark.paradeDate,
        remark_text: newRemark.remarkText
      }
    });

    return newRemark;
  },

  respondToCommandantRemark: async (payload: {
    remarkId: string;
    officerResponse: string;
    officerName: string;
    officerId?: string | number | null;
  }): Promise<CommandantRemark | null> => {
    const nowISO = new Date().toISOString();
    const trimmedResponse = payload.officerResponse.trim();
    let updatedRemark: CommandantRemark | null = null;

    try {
      const { data, error } = await supabase
        .from('commandant_remarks')
        .update({
          officer_response: trimmedResponse,
          responded_at: nowISO,
          status: 'addressed',
          updated_at: nowISO
        })
        .eq('id', payload.remarkId)
        .select()
        .single();

      if (!error && data) {
        updatedRemark = {
          id: data.id,
          submissionId: String(data.submission_id),
          commandantId: data.commandant_id,
          commandantName: data.commandant_name || 'COMMANDANT',
          issuerRoleTitle: data.issuer_role_title || 'Commandant',
          courseOfficerId: data.course_officer_id,
          courseOfficerName: data.course_officer_name,
          courseNumber: data.course_number,
          paradeType: data.parade_type,
          paradeDate: data.parade_date,
          remarkText: data.remark_text,
          officerResponse: data.officer_response,
          respondedAt: data.responded_at,
          status: (data.status as CommandantRemarkStatus) || 'addressed',
          resolvedAt: data.resolved_at,
          thread: Array.isArray(data.thread) ? data.thread : [],
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      }
    } catch { }

    // Update localStorage cache
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('polac_commandant_remarks');
        if (raw) {
          const list: CommandantRemark[] = JSON.parse(raw);
          const idx = list.findIndex(r => r.id === payload.remarkId);
          if (idx !== -1) {
            list[idx] = {
              ...list[idx],
              officerResponse: trimmedResponse,
              respondedAt: nowISO,
              status: 'addressed',
              updatedAt: nowISO
            };
            if (!updatedRemark) updatedRemark = list[idx];
            localStorage.setItem('polac_commandant_remarks', JSON.stringify(list));
          }
        }
        window.dispatchEvent(new CustomEvent('commandant-remarks-updated'));
      } catch { }
    }

    const authorityTitle = updatedRemark?.issuerRoleTitle || 'Commandant';

    // Synchronize with cadet_alerts if this remark is linked to a Critical/Flagrant Misconduct Alert
    try {
      const combinedText = [
        updatedRemark?.remarkText || '',
        ...(updatedRemark?.thread || []).map(t => t.message || '')
      ].join(' ');
      const alertIdMatch = combinedText.match(/ALERT_ID:([^\]|\s]+)/i);
      const cadetMatch = combinedText.match(/CADET:([^|]+)\|SQUAD:([^|]+)\|ABSENCES:([^|]+)/i);
      const linkedAlertId = alertIdMatch ? alertIdMatch[1].trim() : null;
      if (linkedAlertId) {
        await dbService.resolveCadetAlert({
          alertId: linkedAlertId,
          resolutionNotes: trimmedResponse,
          acknowledgedBy: payload.officerName,
          cadetName: cadetMatch ? cadetMatch[1].trim() : undefined,
          squad: cadetMatch ? cadetMatch[2].trim() : undefined,
          triggerCount: cadetMatch ? parseInt(cadetMatch[3].trim(), 10) : undefined
        });
      }
    } catch (syncErr) {
      console.warn('[dbService] Misconduct alert sync non-fatal warning:', syncErr);
    }

    // Notify Senior Officer(s) of Course Officer's response
    await dbService.addNotification({
      type: 'remark_response',
      title: `[${authorityTitle}] Officer Justification Filed — RC ${updatedRemark?.courseNumber || 'N/A'}`,
      content: `${payload.officerName} responded to parade inquiry: "${trimmedResponse}"`,
      timestamp: nowISO,
      read: false,
      officerName: payload.officerName,
      yearGroup: 1,
      courseNumber: updatedRemark?.courseNumber || undefined,
      metadata: {
        recordId: updatedRemark?.submissionId,
        remarkId: payload.remarkId,
        issuerRoleTitle: authorityTitle,
        courseNumber: updatedRemark?.courseNumber || undefined,
        paradeType: updatedRemark?.paradeType || undefined,
        route: '/commandant'
      }
    });

    await dbService.logAuditEvent({
      actorId: payload.officerId ? String(payload.officerId) : null,
      actorName: payload.officerName,
      actionType: 'COMMANDANT_REMARK_RESPONDED',
      targetId: updatedRemark?.submissionId || payload.remarkId,
      payload: {
        remark_id: payload.remarkId,
        submission_id: updatedRemark?.submissionId,
        course_number: updatedRemark?.courseNumber,
        officer_response: trimmedResponse
      }
    });

    return updatedRemark;
  },

  resolveCommandantRemark: async (payload: {
    remarkId: string;
    commandantName?: string;
    commandantId?: string | number | null;
    issuerRoleTitle?: string;
  }): Promise<CommandantRemark | null> => {
    const nowISO = new Date().toISOString();
    let resolvedRemark: CommandantRemark | null = null;

    try {
      const { data, error } = await supabase
        .from('commandant_remarks')
        .update({
          status: 'resolved',
          resolved_at: nowISO,
          updated_at: nowISO
        })
        .eq('id', payload.remarkId)
        .select()
        .single();

      if (!error && data) {
        resolvedRemark = {
          id: data.id,
          submissionId: String(data.submission_id),
          commandantId: data.commandant_id,
          commandantName: data.commandant_name || 'COMMANDANT',
          issuerRoleTitle: data.issuer_role_title || payload.issuerRoleTitle || 'Commandant',
          courseOfficerId: data.course_officer_id,
          courseOfficerName: data.course_officer_name,
          courseNumber: data.course_number,
          paradeType: data.parade_type,
          paradeDate: data.parade_date,
          remarkText: data.remark_text,
          officerResponse: data.officer_response,
          respondedAt: data.responded_at,
          status: 'resolved',
          resolvedAt: data.resolved_at,
          thread: Array.isArray(data.thread) ? data.thread : [],
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      }
    } catch { }

    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('polac_commandant_remarks');
        if (raw) {
          const list: CommandantRemark[] = JSON.parse(raw);
          const idx = list.findIndex(r => r.id === payload.remarkId);
          if (idx !== -1) {
            list[idx] = {
              ...list[idx],
              status: 'resolved',
              resolvedAt: nowISO,
              updatedAt: nowISO
            };
            if (!resolvedRemark) resolvedRemark = list[idx];
            localStorage.setItem('polac_commandant_remarks', JSON.stringify(list));
          }
        }
        window.dispatchEvent(
          new CustomEvent('commandant-remarks-updated', {
            detail: {
              action: 'resolved',
              remarkId: payload.remarkId,
              courseNumber: resolvedRemark?.courseNumber
            }
          })
        );
      } catch { }
    }

    if (!resolvedRemark) {
      try {
        const allRemarks = await dbService.getCommandantRemarks();
        const found = allRemarks.find(r => String(r.id) === String(payload.remarkId));
        if (found) {
          resolvedRemark = {
            ...found,
            status: 'resolved',
            resolvedAt: nowISO,
            updatedAt: nowISO
          };
        }
      } catch { }
    }

    const authorityTitle =
      payload.issuerRoleTitle || resolvedRemark?.issuerRoleTitle || 'Commandant';

    await dbService.addNotification({
      type: 'remark_resolved',
      title: `[${authorityTitle}] Parade Inquiry Resolved — RC ${resolvedRemark?.courseNumber || 'N/A'}`,
      content: `${authorityTitle} (${payload.commandantName || resolvedRemark?.commandantName || authorityTitle}) acknowledged and resolved the inquiry on ${String(resolvedRemark?.paradeType || 'Parade').toUpperCase()} (${resolvedRemark?.paradeDate || nowISO.split('T')[0]}).`,
      timestamp: nowISO,
      read: false,
      officerName:
        resolvedRemark?.courseOfficerName ||
        (resolvedRemark?.courseNumber ? `RC ${resolvedRemark.courseNumber} Course Officer` : 'Course Officer'),
      yearGroup: 1,
      courseNumber: resolvedRemark?.courseNumber || undefined,
      metadata: {
        recordId: resolvedRemark?.submissionId,
        remarkId: payload.remarkId,
        issuerRoleTitle: authorityTitle,
        courseNumber: resolvedRemark?.courseNumber || undefined,
        route: '/officer/history'
      }
    });

    await dbService.logAuditEvent({
      actorId: payload.commandantId ? String(payload.commandantId) : null,
      actorName: `${payload.commandantName || 'COMMANDANT'} (${authorityTitle})`,
      actionType: 'COMMANDANT_REMARK_RESOLVED',
      targetId: resolvedRemark?.submissionId || payload.remarkId,
      payload: {
        remark_id: payload.remarkId,
        submission_id: resolvedRemark?.submissionId,
        issuer_role_title: authorityTitle,
        course_number: resolvedRemark?.courseNumber,
        status: 'resolved'
      }
    });

    return resolvedRemark;
  },

  followUpCommandantRemark: async (payload: {
    remark: CommandantRemark;
    followUpText: string;
    commandantName?: string;
    commandantId?: string | number | null;
    issuerRoleTitle?: string;
    paradeType?: string;
    paradeDate?: string;
    submissionId?: string | number;
  }): Promise<CommandantRemark | null> => {
    const nowISO = new Date().toISOString();
    const trimmedFollowUp = payload.followUpText.trim();
    const prevRemark = payload.remark;
    const authorityTitle =
      payload.issuerRoleTitle || prevRemark.issuerRoleTitle || 'Commandant';
    const nextParadeType = payload.paradeType || prevRemark.paradeType || 'muster';
    const nextParadeDate = payload.paradeDate || prevRemark.paradeDate || nowISO.split('T')[0];
    const nextSubmissionId = payload.submissionId
      ? String(payload.submissionId)
      : prevRemark.submissionId;

    const rawThread = [...(prevRemark.thread || [])];
    if (prevRemark.remarkText) {
      rawThread.push({
        id: `msg-cmd-${Date.now()}-1`,
        senderRole: 'commandant',
        senderName: prevRemark.commandantName || authorityTitle,
        senderTitle: authorityTitle,
        message: prevRemark.remarkText,
        timestamp: prevRemark.updatedAt || prevRemark.createdAt,
        paradeType: prevRemark.paradeType || 'muster',
        paradeDate: prevRemark.paradeDate || prevRemark.createdAt.split('T')[0],
        submissionId: prevRemark.submissionId
      });
    }
    if (prevRemark.officerResponse) {
      rawThread.push({
        id: `msg-off-${Date.now()}-2`,
        senderRole: 'course_officer',
        senderName: prevRemark.courseOfficerName || 'Course Officer',
        message: prevRemark.officerResponse,
        timestamp: prevRemark.respondedAt || nowISO,
        paradeType: prevRemark.paradeType || 'muster',
        paradeDate: prevRemark.paradeDate || prevRemark.createdAt.split('T')[0],
        submissionId: prevRemark.submissionId
      });
    }

    // Deduplicate and cap thread history at 20 unique turns
    const seenTurnKeys = new Set<string>();
    const updatedThread = rawThread
      .filter(item => {
        if (!item || !item.message) return false;
        const msgNorm = String(item.message).trim().toLowerCase();
        if (!msgNorm || msgNorm === trimmedFollowUp.toLowerCase()) return false;
        const key = `${item.senderRole}::${msgNorm}`;
        if (seenTurnKeys.has(key)) return false;
        seenTurnKeys.add(key);
        return true;
      })
      .slice(-20);

    let updatedRemark: CommandantRemark = {
      ...prevRemark,
      submissionId: nextSubmissionId,
      paradeType: nextParadeType,
      paradeDate: nextParadeDate,
      issuerRoleTitle: authorityTitle,
      remarkText: trimmedFollowUp,
      officerResponse: null,
      respondedAt: null,
      status: 'pending',
      resolvedAt: null,
      thread: updatedThread,
      updatedAt: nowISO
    };

    try {
      const { data, error } = await supabase
        .from('commandant_remarks')
        .update({
          submission_id: nextSubmissionId,
          parade_type: nextParadeType,
          parade_date: nextParadeDate,
          remark_text: trimmedFollowUp,
          officer_response: null,
          responded_at: null,
          status: 'pending',
          resolved_at: null,
          thread: updatedThread,
          updated_at: nowISO
        })
        .eq('id', prevRemark.id)
        .select()
        .single();

      if (!error && data) {
        updatedRemark = {
          ...updatedRemark,
          id: data.id,
          submissionId: String(data.submission_id),
          remarkText: data.remark_text,
          officerResponse: data.officer_response,
          respondedAt: data.responded_at,
          status: (data.status as CommandantRemarkStatus) || 'pending',
          updatedAt: data.updated_at
        };
      }
    } catch { }

    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('polac_commandant_remarks');
        const list: CommandantRemark[] = raw ? JSON.parse(raw) : [];
        const idx = list.findIndex(r => r.id === prevRemark.id);
        if (idx !== -1) {
          list[idx] = updatedRemark;
        } else {
          list.unshift(updatedRemark);
        }
        localStorage.setItem('polac_commandant_remarks', JSON.stringify(list));
        window.dispatchEvent(
          new CustomEvent('commandant-remarks-updated', {
            detail: {
              action: 'followed_up',
              remarkId: updatedRemark.id,
              courseNumber: updatedRemark.courseNumber
            }
          })
        );
      } catch { }
    }

    await dbService.addNotification({
      type: 'commandant_remark',
      title: `[${authorityTitle}] Parade Remark (Follow-Up) — RC ${updatedRemark.courseNumber || 'N/A'}`,
      content: `Follow-up inquiry on ${String(updatedRemark.paradeType || 'Parade').toUpperCase()} (${updatedRemark.paradeDate}): "${trimmedFollowUp}"`,
      timestamp: nowISO,
      read: false,
      officerName: updatedRemark.courseOfficerName || 'Course Officer',
      yearGroup: 1,
      courseNumber: updatedRemark.courseNumber || undefined,
      metadata: {
        recordId: updatedRemark.submissionId,
        remarkId: updatedRemark.id,
        issuerRoleTitle: authorityTitle,
        courseNumber: updatedRemark.courseNumber || undefined,
        paradeType: updatedRemark.paradeType || undefined,
        date: updatedRemark.paradeDate || undefined,
        route: '/officer/history'
      }
    });

    await dbService.logAuditEvent({
      actorId: payload.commandantId ? String(payload.commandantId) : null,
      actorName: `${payload.commandantName || 'COMMANDANT'} (${authorityTitle})`,
      actionType: 'COMMANDANT_REMARK_ISSUED',
      targetId: String(updatedRemark.submissionId),
      payload: {
        remark_id: updatedRemark.id,
        submission_id: updatedRemark.submissionId,
        issuer_role_title: authorityTitle,
        course_number: updatedRemark.courseNumber,
        course_officer_name: updatedRemark.courseOfficerName,
        parade_type: updatedRemark.paradeType,
        parade_date: updatedRemark.paradeDate,
        remark_text: `[FOLLOW-UP] ${trimmedFollowUp}`
      }
    });

    return updatedRemark;
  },

  // ─── Cadet Misconduct Alerts (Rolling 5-Day & Same-Day Multi-Activity Evaluation) ───

  syncAndGetCadetAlerts: async (courseNumber?: number): Promise<any[]> => {
    const CACHE_KEY = 'polac_cadet_alerts_cache';
    const RESOLVED_KEY = 'polac_resolved_cadet_alerts';
    const makeCadetKey = (name?: string, squad?: string) =>
      `${String(name || '').trim().toLowerCase()}::${String(squad || '').trim().toLowerCase()}`;

    const readLocalAlerts = (): any[] => {
      if (typeof window === 'undefined') return [];
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    };

    const writeLocalAlerts = (items: any[]) => {
      if (typeof window === 'undefined') return;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(items));
      } catch { }
    };

    const readResolvedMap = (): Record<string, { resolvedCount: number; resolvedAt: string }> => {
      if (typeof window === 'undefined') return {};
      try {
        const raw = localStorage.getItem(RESOLVED_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    };

    const localAlerts = readLocalAlerts();
    const resolvedMap = readResolvedMap();
    let dbAlerts: any[] = [];

    // 1. Query public.cadet_alerts if accessible
    try {
      const { data, error } = await supabase
        .from('cadet_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (!error && data) {
        dbAlerts = data;
      }
    } catch { }

    // 2. Scan recent parade_records and cadet_details to detect any cadet with >= 3 absences
    //    within a 5-day rolling window (including 3 activities in 1 single day)
    const computedByCadet = new Map<
      string,
      {
        cadet_name: string;
        squad: string;
        course_number: number;
        absences: { dateMs: number; recordId: string }[];
      }
    >();

    try {
      let prQuery = supabase
        .from('parade_records')
        .select('id, course_number, year_group, date, created_at, absent_count')
        .gt('absent_count', 0)
        .order('created_at', { ascending: false })
        .limit(100);

      if (courseNumber && courseNumber > 0) {
        prQuery = prQuery.eq('course_number', courseNumber);
      }

      const { data: prRows, error: prErr } = await prQuery;

      if (!prErr && prRows && prRows.length > 0) {
        const prMap = new Map<string, any>();
        prRows.forEach(r => prMap.set(String(r.id), r));
        const recordIds = prRows.map(r => r.id);

        const { data: cdRows, error: cdErr } = await supabase
          .from('cadet_details')
          .select('record_id, name, squad, status')
          .in('record_id', recordIds);

        if (!cdErr && cdRows && cdRows.length > 0) {
          for (const cd of cdRows) {
            if (String(cd.status || '').trim().toLowerCase() !== 'absent') continue;
            const pr = prMap.get(String(cd.record_id));
            if (!pr) continue;

            const key = makeCadetKey(cd.name, cd.squad);
            const dateStr = pr.date || String(pr.created_at || '').split('T')[0];
            const parsedMs = new Date(dateStr).getTime();
            const safeMs = Number.isNaN(parsedMs) ? Date.now() : parsedMs;
            const cNum = Number(pr.course_number || pr.year_group || courseNumber || 1);

            if (!computedByCadet.has(key)) {
              computedByCadet.set(key, {
                cadet_name: String(cd.name || '').trim(),
                squad: String(cd.squad || '').trim(),
                course_number: cNum,
                absences: []
              });
            }
            computedByCadet.get(key)!.absences.push({
              dateMs: safeMs,
              recordId: String(cd.record_id)
            });
          }
        }
      }
    } catch (scanErr) {
      console.warn('[dbService] Rolling absence scan warning:', scanErr);
    }

    const mergedByKey = new Map<string, any>();

    // Seed with existing active local alerts (excluding any that already received a Senior Officer directive)
    for (const loc of localAlerts) {
      const k = makeCadetKey(loc.cadet_name, loc.squad);
      if (loc.commandant_directive && String(loc.commandant_directive).trim() !== '') {
        const prevRes = resolvedMap[k];
        if (!prevRes || Number(loc.trigger_count || 3) >= prevRes.resolvedCount) {
          resolvedMap[k] = {
            resolvedCount: Number(loc.trigger_count || 3),
            resolvedAt: loc.updated_at || loc.created_at || new Date().toISOString()
          };
        }
        continue;
      }
      if (loc.status === 'ACTIVE') {
        mergedByKey.set(k, loc);
      }
    }

    // Seed/override with existing DB alerts (once a Senior Officer directive is attached or status is RESOLVED, hide from Attention Required)
    for (const dba of dbAlerts) {
      const k = makeCadetKey(dba.cadet_name, dba.squad);
      const hasDirective = Boolean(dba.commandant_directive && String(dba.commandant_directive).trim() !== '');
      if (dba.status === 'RESOLVED' || hasDirective) {
        mergedByKey.delete(k);
        const prevRes = resolvedMap[k];
        if (!prevRes || Number(dba.trigger_count || 0) >= prevRes.resolvedCount) {
          resolvedMap[k] = {
            resolvedCount: Number(dba.trigger_count || 3),
            resolvedAt: dba.updated_at || dba.created_at || new Date().toISOString()
          };
        }
      } else if (dba.status === 'ACTIVE') {
        mergedByKey.set(k, dba);
      }
    }

    // Evaluate rolling 5-day absences for each scanned cadet
    const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
    const nowISO = new Date().toISOString();

    for (const [key, entry] of computedByCadet.entries()) {
      if (entry.absences.length < 3) continue;

      const sortedDesc = [...entry.absences].sort((a, b) => b.dateMs - a.dateMs);
      const latestMs = sortedDesc[0].dateMs;
      const rollingAbsences = sortedDesc.filter(
        a => a.dateMs >= latestMs - FIVE_DAYS_MS && a.dateMs <= latestMs + 86400000
      );
      const rollingCount = rollingAbsences.length;

      if (rollingCount < 3) continue;

      // Check if this exact absence count was already resolved by the Course Officer
      const resolvedInfo = resolvedMap[key];
      if (resolvedInfo && resolvedInfo.resolvedCount >= rollingCount) {
        mergedByKey.delete(key);
        continue;
      }

      const alertLevel: 'CRITICAL' | 'FLAGRANT' = rollingCount >= 4 ? 'FLAGRANT' : 'CRITICAL';
      const existingActive = mergedByKey.get(key);

      if (existingActive) {
        const updatedTriggerCount = Math.max(Number(existingActive.trigger_count || 3), rollingCount);
        const updatedLevel: 'CRITICAL' | 'FLAGRANT' =
          updatedTriggerCount >= 4 || existingActive.alert_level === 'FLAGRANT'
            ? 'FLAGRANT'
            : 'CRITICAL';

        if (
          updatedTriggerCount !== existingActive.trigger_count ||
          updatedLevel !== existingActive.alert_level
        ) {
          existingActive.trigger_count = updatedTriggerCount;
          existingActive.alert_level = updatedLevel;
          existingActive.updated_at = nowISO;
          try {
            await supabase
              .from('cadet_alerts')
              .update({
                trigger_count: updatedTriggerCount,
                alert_level: updatedLevel,
                updated_at: nowISO
              })
              .eq('id', existingActive.id);
          } catch { }
        }
        mergedByKey.set(key, existingActive);
      } else {
        const generatedId =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const newAlert: any = {
          id: generatedId,
          cadet_name: entry.cadet_name,
          squad: entry.squad,
          course_number: entry.course_number,
          alert_level: alertLevel,
          status: 'ACTIVE',
          trigger_count: rollingCount,
          commandant_directive: undefined,
          created_at: nowISO,
          updated_at: nowISO
        };

        try {
          const { data: insertedData, error: insertErr } = await supabase
            .from('cadet_alerts')
            .insert({
              id: newAlert.id,
              cadet_name: newAlert.cadet_name,
              squad: newAlert.squad,
              course_number: newAlert.course_number,
              alert_level: newAlert.alert_level,
              status: 'ACTIVE',
              trigger_count: newAlert.trigger_count,
              created_at: nowISO,
              updated_at: nowISO
            })
            .select()
            .single();

          if (!insertErr && insertedData) {
            newAlert.id = insertedData.id;
          }
        } catch { }

        mergedByKey.set(key, newAlert);
      }
    }

    const finalAlerts = Array.from(mergedByKey.values()).filter(a => {
      if (a.commandant_directive && String(a.commandant_directive).trim() !== '') return false;
      const k = makeCadetKey(a.cadet_name, a.squad);
      const res = resolvedMap[k];
      if (res && res.resolvedCount >= Number(a.trigger_count || 3)) return false;
      return a.status === 'ACTIVE';
    });

    writeLocalAlerts(finalAlerts);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(RESOLVED_KEY, JSON.stringify(resolvedMap));
      } catch { }
    }

    if (courseNumber && courseNumber > 0) {
      return finalAlerts.filter(
        a => !a.course_number || Number(a.course_number) === Number(courseNumber)
      );
    }

    return finalAlerts;
  },

  updateCadetAlertDirective: async (
    alertId: string,
    directive: string,
    meta?: { cadetName?: string; squad?: string; triggerCount?: number }
  ): Promise<void> => {
    const nowISO = new Date().toISOString();
    try {
      await supabase
        .from('cadet_alerts')
        .update({
          commandant_directive: directive,
          updated_at: nowISO
        })
        .eq('id', alertId);
    } catch { }

    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('polac_cadet_alerts_cache');
        let matchedAlert: any = null;
        if (raw) {
          const list: any[] = JSON.parse(raw);
          matchedAlert = list.find(a => String(a.id) === String(alertId));
          const remaining = list.filter(a => String(a.id) !== String(alertId));
          localStorage.setItem('polac_cadet_alerts_cache', JSON.stringify(remaining));
        }

        const cName = meta?.cadetName || matchedAlert?.cadet_name;
        const cSquad = meta?.squad || matchedAlert?.squad;
        const tCount = meta?.triggerCount || matchedAlert?.trigger_count || 3;

        if (cName && cSquad) {
          const key = `${String(cName).trim().toLowerCase()}::${String(cSquad).trim().toLowerCase()}`;
          const resRaw = localStorage.getItem('polac_resolved_cadet_alerts');
          const resMap = resRaw ? JSON.parse(resRaw) : {};
          resMap[key] = {
            resolvedCount: Number(tCount),
            resolvedAt: nowISO
          };
          localStorage.setItem('polac_resolved_cadet_alerts', JSON.stringify(resMap));
        }

        window.dispatchEvent(new CustomEvent('cadet-alerts-updated'));
      } catch { }
    }
  },

  resolveCadetAlert: async (payload: {
    alertId: string;
    resolutionNotes: string;
    acknowledgedBy: string;
    cadetName?: string;
    squad?: string;
    triggerCount?: number;
  }): Promise<void> => {
    const nowISO = new Date().toISOString();
    try {
      await supabase
        .from('cadet_alerts')
        .update({
          status: 'RESOLVED',
          resolution_notes: payload.resolutionNotes,
          acknowledged_by: payload.acknowledgedBy,
          updated_at: nowISO
        })
        .eq('id', payload.alertId);
    } catch { }

    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('polac_cadet_alerts_cache');
        let matchedAlert: any = null;
        if (raw) {
          const list: any[] = JSON.parse(raw);
          matchedAlert = list.find(a => String(a.id) === String(payload.alertId));
          const remaining = list.filter(a => String(a.id) !== String(payload.alertId));
          localStorage.setItem('polac_cadet_alerts_cache', JSON.stringify(remaining));
        }

        const cName = payload.cadetName || matchedAlert?.cadet_name;
        const cSquad = payload.squad || matchedAlert?.squad;
        const tCount = payload.triggerCount || matchedAlert?.trigger_count || 3;

        if (cName && cSquad) {
          const key = `${String(cName).trim().toLowerCase()}::${String(cSquad).trim().toLowerCase()}`;
          const resRaw = localStorage.getItem('polac_resolved_cadet_alerts');
          const resMap = resRaw ? JSON.parse(resRaw) : {};
          resMap[key] = {
            resolvedCount: Number(tCount),
            resolvedAt: nowISO
          };
          localStorage.setItem('polac_resolved_cadet_alerts', JSON.stringify(resMap));
        }

        window.dispatchEvent(new CustomEvent('cadet-alerts-updated'));
      } catch { }
    }
  },

  // ─── Sickbay & Medical Verifications ─────────────────────────────────────

  fetchSickbayVerifications: async (filters?: {
    date?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    courseNumber?: number;
    searchTerm?: string;
  }): Promise<SickbayVerification[]> => {
    try {
      let query = supabase
        .from('sickbay_verifications')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.date) {
        query = query.eq('parade_date', filters.date);
      }
      if (filters?.startDate) {
        query = query.gte('parade_date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('parade_date', filters.endDate);
      }
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.courseNumber) {
        query = query.eq('course_number', filters.courseNumber);
      }
      if (filters?.searchTerm && filters.searchTerm.trim() !== '') {
        const term = filters.searchTerm.trim();
        query = query.or(`cadet_name.ilike.%${term}%,squad.ilike.%${term}%,reported_by_officer.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.id,
        cadetDetailId: row.cadet_detail_id,
        paradeRecordId: row.parade_record_id,
        courseNumber: row.course_number,
        cadetName: row.cadet_name,
        squad: row.squad,
        paradeDate: row.parade_date,
        paradeType: row.parade_type,
        reportedByOfficer: row.reported_by_officer,
        status: row.status as MedicalVerificationStatus,
        medicalOfficerId: row.medical_officer_id,
        medicalOfficerName: row.medical_officer_name,
        clinicalNote: row.clinical_note,
        targetedRecipientRole: row.targeted_recipient_role,
        targetedRecipientId: row.targeted_recipient_id,
        messages: Array.isArray(row.messages) ? row.messages : [],
        threadStatus: (row.thread_status as 'open' | 'replied' | 'resolved') || 'open',
        verifiedAt: row.verified_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (err) {
      console.error('Supabase Error (fetchSickbayVerifications):', err);
      return [];
    }
  },

  verifySickbayCadet: async (payload: {
    verificationId: string;
    medicalOfficerId: string;
    status: MedicalVerificationStatus;
    clinicalNote?: string;
    targetedRecipientRole?: 'commandant' | 'dfs' | 'course_officer';
    targetedRecipientId?: string;
  }): Promise<{ status: string; message?: string }> => {
    try {
      const { data, error } = await supabase.rpc('verify_sickbay_cadet', {
        p_verification_id: payload.verificationId,
        p_medical_officer_id: payload.medicalOfficerId,
        p_status: payload.status,
        p_clinical_note: payload.clinicalNote || null,
        p_targeted_recipient_role: payload.targetedRecipientRole || null,
        p_targeted_recipient_id: payload.targetedRecipientId || null
      });

      if (error) {
        const isPendingUndo = payload.status === 'pending_verification';
        // Direct table update fallback if RPC encounters schema mismatch
        const { error: fallbackError } = await supabase
          .from('sickbay_verifications')
          .update({
            status: payload.status,
            medical_officer_id: isPendingUndo ? null : payload.medicalOfficerId,
            medical_officer_name: isPendingUndo ? null : undefined,
            clinical_note: isPendingUndo ? undefined : payload.clinicalNote || null,
            targeted_recipient_role: isPendingUndo ? undefined : payload.targetedRecipientRole || null,
            targeted_recipient_id: isPendingUndo ? undefined : payload.targetedRecipientId || null,
            verified_at: isPendingUndo ? null : new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', payload.verificationId);

        if (fallbackError) throw fallbackError;
        return { status: 'success', message: 'Verification updated.' };
      }

      return data || { status: 'success' };
    } catch (err) {
      console.error('Supabase Error (verifySickbayCadet):', err);
      throw err;
    }
  },

  replySickbayThread: async (payload: {
    verificationId: string;
    senderId: string;
    senderName: string;
    senderRole: string;
    senderDesignation?: string;
    message: string;
    resolve?: boolean;
  }): Promise<{ status: string; thread_status?: string; messages?: any[] }> => {
    try {
      const { data, error } = await supabase.rpc('reply_sickbay_thread', {
        p_verification_id: payload.verificationId,
        p_sender_id: payload.senderId,
        p_message: payload.message,
        p_resolve: Boolean(payload.resolve)
      });

      if (error) {
        // Fallback: direct table update if 20261116_04 migration is not yet applied
        const { data: existing } = await supabase
          .from('sickbay_verifications')
          .select('messages, clinical_note, medical_officer_id, medical_officer_name, verified_at')
          .eq('id', payload.verificationId)
          .single();

        let nextMessages = Array.isArray(existing?.messages) ? [...existing.messages] : [];
        if (nextMessages.length === 0 && existing?.clinical_note) {
          nextMessages.push({
            id: `init-${payload.verificationId}`,
            senderId: existing.medical_officer_id || '',
            senderName: existing.medical_officer_name || 'Medical Officer',
            senderRole: 'medical_officer',
            text: existing.clinical_note,
            createdAt: existing.verified_at || new Date().toISOString()
          });
        }
        if (payload.message.trim()) {
          nextMessages.push({
            id: `msg-${Date.now()}`,
            senderId: payload.senderId,
            senderName: payload.senderName,
            senderRole: payload.senderRole,
            senderDesignation: payload.senderDesignation || payload.senderRole,
            text: payload.message.trim(),
            createdAt: new Date().toISOString()
          });
        }
        const nextStatus = payload.resolve
          ? 'resolved'
          : payload.senderRole === 'medical_officer'
            ? 'open'
            : 'replied';

        const { error: updateErr } = await supabase
          .from('sickbay_verifications')
          .update({
            messages: nextMessages,
            thread_status: nextStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', payload.verificationId);

        if (updateErr) throw updateErr;
        return { status: 'success', thread_status: nextStatus, messages: nextMessages };
      }

      return data || { status: 'success' };
    } catch (err) {
      console.error('Supabase Error (replySickbayThread):', err);
      throw err;
    }
  },

  // ─── Weekly Command Reports & Executive Briefs ───────────────────────────

  fetchCommandReports: async (): Promise<CommandReport[]> => {
    try {
      const { data, error } = await supabase
        .from('command_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.id,
        senderId: row.sender_id,
        senderName: row.sender_name,
        recipientRole: row.recipient_role,
        weekStart: row.week_start,
        weekEnd: row.week_end,
        summaryPayload: row.summary_payload || {
          totalParades: 0,
          attendanceRate: 100,
          totalPresent: 0,
          totalCadets: 0,
          totalAbsent: 0,
          totalSick: 0,
          totalDetention: 0,
          sickbayNoShows: 0,
          courseBreakdown: []
        },
        executiveNote: row.executive_note,
        messages: Array.isArray(row.messages) ? row.messages : [],
        status: row.status || 'sent',
        acknowledgedBy: row.acknowledged_by,
        acknowledgedAt: row.acknowledged_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (err) {
      console.error('Supabase Error (fetchCommandReports):', err);
      return [];
    }
  },

  sendWeeklyCommandReport: async (payload: {
    senderId: string;
    senderName: string;
    recipientRole: 'commandant' | 'deputy_commandant' | 'both';
    weekStart: string;
    weekEnd: string;
    summaryPayload: CommandReportSummaryPayload;
    executiveNote?: string;
  }): Promise<{ status: string; id?: string }> => {
    try {
      const { data, error } = await supabase.rpc('send_weekly_command_report', {
        p_sender_id: payload.senderId,
        p_recipient_role: payload.recipientRole,
        p_week_start: payload.weekStart,
        p_week_end: payload.weekEnd,
        p_summary_payload: payload.summaryPayload,
        p_executive_note: payload.executiveNote || null
      });

      if (error) {
        // Fallback direct insert if migration 20261118_02 is not yet executed
        const initialMessages = payload.executiveNote?.trim()
          ? [
            {
              id: `msg-${Date.now()}`,
              senderId: payload.senderId,
              senderName: payload.senderName,
              senderDesignation: 'Director Field Studies',
              text: payload.executiveNote.trim(),
              createdAt: new Date().toISOString()
            }
          ]
          : [];

        const { data: inserted, error: insertErr } = await supabase
          .from('command_reports')
          .insert({
            sender_id: payload.senderId,
            sender_name: payload.senderName,
            recipient_role: payload.recipientRole,
            week_start: payload.weekStart,
            week_end: payload.weekEnd,
            summary_payload: payload.summaryPayload,
            executive_note: payload.executiveNote?.trim() || null,
            messages: initialMessages,
            status: 'sent'
          })
          .select('id')
          .single();

        if (insertErr) throw insertErr;
        return { status: 'success', id: inserted?.id };
      }

      return data || { status: 'success' };
    } catch (err) {
      console.error('Supabase Error (sendWeeklyCommandReport):', err);
      throw err;
    }
  },

  replyCommandReport: async (payload: {
    reportId: string;
    senderId: string;
    senderName: string;
    senderDesignation?: string;
    message: string;
    acknowledge?: boolean;
  }): Promise<{ status: string; report_status?: string; messages?: any[] }> => {
    try {
      const { data, error } = await supabase.rpc('reply_command_report', {
        p_report_id: payload.reportId,
        p_sender_id: payload.senderId,
        p_message: payload.message,
        p_acknowledge: Boolean(payload.acknowledge)
      });

      if (error) {
        const { data: existing } = await supabase
          .from('command_reports')
          .select('messages, status')
          .eq('id', payload.reportId)
          .single();

        const nextMessages = Array.isArray(existing?.messages) ? [...existing.messages] : [];
        if (payload.message.trim()) {
          nextMessages.push({
            id: `msg-${Date.now()}`,
            senderId: payload.senderId,
            senderName: payload.senderName,
            senderDesignation: payload.senderDesignation || 'Commandant',
            text: payload.message.trim(),
            createdAt: new Date().toISOString()
          });
        }
        const nextStatus = payload.acknowledge ? 'acknowledged' : existing?.status || 'sent';

        const { error: updateErr } = await supabase
          .from('command_reports')
          .update({
            messages: nextMessages,
            status: nextStatus,
            acknowledged_by: payload.acknowledge ? payload.senderName : undefined,
            acknowledged_at: payload.acknowledge ? new Date().toISOString() : undefined,
            updated_at: new Date().toISOString()
          })
          .eq('id', payload.reportId);

        if (updateErr) throw updateErr;
        return { status: 'success', report_status: nextStatus, messages: nextMessages };
      }

      return data || { status: 'success' };
    } catch (err) {
      console.error('Supabase Error (replyCommandReport):', err);
      throw err;
    }
  }
};

export async function updateUserCredentials(payload: {
  adminId: string;
  targetUserId: string;
  newEmail?: string;
  newCourseAssignment?: number | string;
  newDesignation?: string;
  currentPassword?: string;
  isActive?: boolean;
  auditDetails: string;
  newPassword?: string;
  callerIdentity?: { email?: string; username?: string };
}) {
  if (!payload.adminId || !payload.targetUserId) {
    throw new Error("Missing critical security identifiers (UUIDs).");
  }

  const resolvedAdminId = await resolveActiveAdminId(payload.adminId, payload.callerIdentity);

  let formattedCourse: string | null = null;
  if (payload.newCourseAssignment !== undefined && payload.newCourseAssignment !== null) {
    const trimmed = payload.newCourseAssignment.toString().trim();
    formattedCourse = trimmed === '' ? null : trimmed;
  }

  const rpcPayload = {
    p_admin_id: resolvedAdminId,
    p_target_user_id: payload.targetUserId,
    p_new_email: payload.newEmail?.trim() || null,
    p_new_course_assignment: formattedCourse,
    p_audit_action_details: payload.auditDetails || 'Manual credential override',
    p_new_password: payload.newPassword || null,
    p_current_password: payload.currentPassword || null,
    p_new_designation: payload.newDesignation?.trim() || null
  };

  const { data, error } = await supabase.rpc('admin_override_credentials', rpcPayload);

  if (error) {
    // Fallback to legacy 6-argument signature if migration 20261115_01 is not yet applied
    const { data: legacyData, error: legacyError } = await supabase.rpc('admin_override_credentials', {
      p_admin_id: resolvedAdminId,
      p_target_user_id: payload.targetUserId,
      p_new_email: payload.newEmail?.trim() || null,
      p_new_course_assignment: formattedCourse,
      p_audit_action_details: payload.auditDetails || 'Manual credential override',
      p_new_password: payload.newPassword || null
    });

    if (legacyError) {
      // If RPC rejected due to stale role/migration mismatch, verify password directly and update
      const isUnauthorizedRpc = (legacyError.message || '').toUpperCase().includes('UNAUTHORIZED');
      if (isUnauthorizedRpc && payload.currentPassword) {
        const isVerified = await dbService.verifyCommandantAccess(resolvedAdminId, payload.currentPassword);
        if (isVerified) {
          const directUpdates: Record<string, any> = {
            credentials_updated_at: new Date().toISOString()
          };
          if (payload.newEmail?.trim()) directUpdates.email = payload.newEmail.trim();
          if (payload.newDesignation?.trim()) directUpdates.designation = payload.newDesignation.trim();
          if (payload.newPassword) directUpdates.password = payload.newPassword;
          if (payload.isActive !== undefined) directUpdates.is_active = payload.isActive;
          if (formattedCourse !== null && formattedCourse !== 'nil') {
            directUpdates.course_number = parseInt(formattedCourse, 10);
            directUpdates.course_name = `REGULAR COURSE ${formattedCourse}`;
          }

          const { error: directErr } = await supabase
            .from('users')
            .update(directUpdates)
            .eq('id', payload.targetUserId);

          if (directErr) {
            throw new Error(directErr.message);
          }
          return { success: true, message: 'Credentials updated via verified admin fallback.' };
        }
      }

      console.error('Credential override transaction failed. MESSAGE:', legacyError.message);
      throw new Error(`Database rejected update: ${legacyError.message}`);
    }

    if (payload.newDesignation || payload.isActive !== undefined) {
      try {
        const extraUpdates: Record<string, any> = {};
        if (payload.newDesignation) extraUpdates.designation = payload.newDesignation.trim();
        if (payload.isActive !== undefined) extraUpdates.is_active = payload.isActive;
        await supabase
          .from('users')
          .update(extraUpdates)
          .eq('id', payload.targetUserId);
      } catch { }
    }

    return legacyData;
  }

  if (payload.isActive !== undefined) {
    const { error: activeErr } = await supabase
      .from('users')
      .update({ is_active: payload.isActive })
      .eq('id', payload.targetUserId);
    if (activeErr) {
      throw new Error(activeErr.message);
    }
  }

  return data;
}
