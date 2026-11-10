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
  BulkCoursePurgeResult
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
  registerOfficer: async (commandantId: string | number, officerData: { email: string; password: string; username: string; role: string }) => {
    try {
      // Backend Cap Enforcement
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

      const { data, error } = await supabase.rpc('admin_register_officer', {
        p_commandant_id: commandantId,
        p_email: officerData.email.toLowerCase().trim(),
        p_password: officerData.password,
        p_username: officerData.username.trim(),
        p_role: officerData.role
      });
      if (error) throw error;
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
        role: d.role,
        fullName: d.full_name,
        courseName: d.course_name,
        yearGroup: d.year_group,
        courseNumber: d.course_number ? parseInt(d.course_number) : undefined,
        totalCadets: d.total_cadets,
        profileImage: d.profile_image_url,
        serviceNumber: d.service_number || d.username,
        email: d.email,
        password: '••••••••', // Security Redaction
        isActive: d.is_active
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
        .select('id')
        .eq('id', userId)
        .eq('role', 'commandant')
        .eq('password', password)
        .limit(1);
      
      if (error || !data || data.length === 0) return false;
      return true;
    } catch {
      return false;
    }
  },

    // updateUserCredentials moved to standalone function

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
      
      if (role === 'commandant' && viewerId) {
        query = supabase
          .rpc('get_commandant_parade_overview', { p_viewer_id: String(viewerId) })
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

  getNotifications: async (officerName?: string): Promise<{ data: Notification[]; error: any }> => {
    try {
      let query = supabase
        .from('notifications')
        .select('id, type, title, content, timestamp, read, officer_name, year_group, course_number, archived_at')
        .is('archived_at', null) // Only fetch non-archived items by default
        .order('timestamp', { ascending: false });

      // If officerName provided, filter by it (for course officers)
      if (officerName) {
        query = query.ilike('officer_name', `%${officerName}%`);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;
      return {
        data: (data || []).map(n => ({
          id: n.id,
          type: n.type,
          title: n.title,
          content: n.content,
          timestamp: n.timestamp,
          read: n.read,
          officerName: n.officer_name,
          yearGroup: n.year_group,
          courseNumber: n.course_number,
          archivedAt: n.archived_at
        })),
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

      // ── Dispatch Web Push Notification ────────────────────────────────────
      // Query all distinct user_ids registered in push_subscriptions
      const { data: pushUsers } = await supabase
        .from('push_subscriptions')
        .select('user_id');

      if (pushUsers && pushUsers.length > 0) {
        const uniqueUserIds = Array.from(new Set(pushUsers.map(p => p.user_id)));
        for (const uid of uniqueUserIds) {
          supabase.functions.invoke('send-web-push', {
            body: {
              user_id: uid,
              payload: {
                title: notif.title,
                body: notif.content,
                icon: '/logo.png',
                url: '/'
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
        } catch {}
      }

      if (!effectiveAdminId) {
        try {
          const { data: authData } = await supabase.auth.getUser();
          effectiveAdminId = authData?.user?.id;
        } catch {}
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
   * Verified if a user ID still exists in the database.
   * Crucial for clearing stale localStorage sessions after a database reset.
   */
  verifySession: async (userId: string | number): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();
      
      if (error || !data) return false;
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
    // Verify Commandant privilege in public.users
    const { data: adminCheck, error: authErr } = await supabase
      .from('users')
      .select('id, role, full_name')
      .eq('id', actorId)
      .eq('role', 'commandant')
      .single();

    if (authErr || !adminCheck) {
      throw new Error('Unauthorized: Only designated Commandant accounts can execute bulk course purge operations.');
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
      } catch {}
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
  }
};

export async function updateUserCredentials(payload: {
  adminId: string;
  targetUserId: string;
  newEmail?: string;
  newCourseAssignment?: number | string;
  auditDetails: string;
  newPassword?: string;
}) {
  // Ensure we don't have empty UUIDs
  if (!payload.adminId || !payload.targetUserId) {
    throw new Error("Missing critical security identifiers (UUIDs).");
  }

  // Format the course assignment to match our updated SQL TEXT parameter
  let formattedCourse: string | null = null;
  if (payload.newCourseAssignment !== undefined && payload.newCourseAssignment !== null) {
    const trimmed = payload.newCourseAssignment.toString().trim();
    formattedCourse = trimmed === '' ? null : trimmed;
  }

  const rpcPayload = {
    p_admin_id: payload.adminId,
    p_target_user_id: payload.targetUserId,
    p_new_email: payload.newEmail?.trim() || null,
    p_new_course_assignment: formattedCourse, // Now safely passes a string (e.g. "9", "nil", or null)
    p_audit_action_details: payload.auditDetails || 'Manual credential override',
    p_new_password: payload.newPassword || null
  };

  console.log("Sending Sanitized RPC Payload:", rpcPayload);

  const { data, error } = await supabase.rpc('admin_override_credentials', rpcPayload);

  if (error) {
    console.error('Credential override transaction failed. MESSAGE:', error.message, 'DETAILS:', error.details, 'HINT:', error.hint);
    throw new Error(`Database rejected update: ${error.message}`);
  }

  return data;
}
