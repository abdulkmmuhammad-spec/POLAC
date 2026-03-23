import { createClient } from '@supabase/supabase-js';
import { ParadeRecord, User, Notification, CadetStatus, AuditEvent } from '../types';

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
      return { data: 12, error: err };
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
      return {
        data: {
          musterStartHour: MUSTER_START_DEFAULT,
          musterEndHour: MUSTER_END_DEFAULT,
          tattooStartHour: TATTOO_START_DEFAULT,
        },
        error: err
      };
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

  // ─── Users / Profiles ────────────────────────────────────────────────────

  loginWithCredentials: async (username: string, password: string): Promise<User | null> => {
    try {
      const cleanUsername = username.trim();
      const providedPassword = password.trim();

      console.log(`Attempting secure login for: ${cleanUsername}`);

      // Use the secure RPC that handles bcrypt comparison via crypt()
      const { data, error } = await supabase.rpc('verify_user_login', {
        p_username: cleanUsername,
        p_password: providedPassword
      });

      if (error) {
        console.error('Login failed: RPC error', error.message);
        return null;
      }

      if (!data || data.length === 0) {
        console.error('Login failed: Password mismatch for', cleanUsername);
        return null;
      }

      const userData = data[0];
      console.log(`Login successful for: ${cleanUsername}`);
      return {
        id: userData.id,
        username: userData.username,
        role: userData.role,
        fullName: userData.full_name,
        courseName: userData.course_name,
        yearGroup: userData.year_group,
        courseNumber: userData.course_number,
        totalCadets: userData.total_cadets,
        profileImage: userData.profile_image
      };
    } catch (err) {
      console.error('Login error:', err);
      return null;
    }
  },

  getUserProfile: async (id: string): Promise<User | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        username: data.username,
        role: data.role,
        fullName: data.full_name,
        courseName: data.course_name,
        yearGroup: data.year_group,
        courseNumber: data.course_number,
        totalCadets: data.total_cadets,
        profileImage: data.profile_image
      };
    } catch (err) {
      console.error('Supabase Error (getUserProfile):', err);
      return null;
    }
  },

  updateUser: async (updatedUser: User) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: updatedUser.fullName,
          course_name: updatedUser.courseName,
          year_group: updatedUser.yearGroup,
          course_number: updatedUser.courseNumber,
          total_cadets: updatedUser.totalCadets,
          profile_image: updatedUser.profileImage
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
        .from('profiles')
        .select('*')
        .eq('role', 'course_officer')
        .order('full_name', { ascending: true });

      if (error) throw error;
      return (data || []).map(d => ({
        id: d.id,
        username: d.username,
        role: d.role,
        fullName: d.full_name,
        courseName: d.course_name,
        yearGroup: d.year_group,
        courseNumber: d.course_number,
        totalCadets: d.total_cadets,
        profileImage: d.profile_image,
        serviceNumber: d.username // Mapping service number to username field
      }));
    } catch (err) {
      console.error('Supabase Error (getOfficers):', err);
      throw err;
    }
  },

  inviteOfficer: async (fullName: string, serviceNumber: string, initialCourse: number): Promise<void> => {
    try {
      const { error } = await supabase
        .from('profiles')
        .insert({
          username: serviceNumber.trim(),
          full_name: fullName,
          role: 'course_officer',
          course_number: initialCourse,
          password_hash: serviceNumber.trim(), // Store plain text password
          course_name: `REGULAR COURSE ${initialCourse}`
        });

      if (error) throw error;

      await dbService.addNotification({
        type: 'system',
        title: 'New Officer Commissioned',
        content: `${fullName} has been granted access to RC ${initialCourse}`,
        timestamp: new Date().toISOString(),
        read: false,
        officerName: 'COMMANDANT',
        yearGroup: 5,
        courseNumber: initialCourse
      });
    } catch (err) {
      console.error('Supabase Error (inviteOfficer):', err);
      throw err;
    }
  },

  updateOfficerAssignment: async (officerId: string | number, courseNumber: number): Promise<void> => {
    try {
      const { error } = await supabase
        .from('profiles')
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

  // ─── Parade Records ───────────────────────────────────────────────────────

  getRecords: async (from: number, to: number): Promise<{ data: ParadeRecord[]; error: any }> => {
    try {
      const { data, error } = await supabase
        .from('parade_records')
        .select('*, cadet_details(*) ')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return {
        data: (data || []).map(r => ({
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
          cadets: r.cadet_details || [],
          status: r.status,
          createdAt: r.created_at
        })),
        error: null
      };
    } catch (err: any) {
      console.error('Supabase Error (getRecords):', err);
      return { data: [], error: err };
    }
  },

  getTotalRecordsCount: async (): Promise<number> => {
    try {
      const { count, error } = await supabase
        .from('parade_records')
        .select('*', { count: 'exact', head: true });

      if (error) throw error;
      return count || 0;
    } catch (err) {
      console.error('Supabase Error (getTotalRecordsCount):', err);
      return 0;
    }
  },

  saveRecord: async (record: Omit<ParadeRecord, 'id' | 'createdAt'>) => {
    try {
      const { data: recordData, error: recordError } = await supabase
        .from('parade_records')
        .insert({
          officer_id: record.officerId,
          officer_name: record.officerName,
          course_name: record.courseName,
          year_group: record.yearGroup,
          course_number: record.courseNumber,
          date: record.date,
          parade_type: record.paradeType,
          present_count: record.presentCount,
          absent_count: record.absentCount,
          sick_count: record.sickCount,
          detention_count: record.detentionCount,
          pass_count: record.passCount || 0,
          suspension_count: record.suspensionCount || 0,
          yet_to_report_count: record.yetToReportCount || 0,
          grand_total: record.grandTotal
        })
        .select()
        .single();

      if (recordError) throw recordError;

      if (record.cadets.length > 0) {
        const cadetsToInsert = record.cadets.map(c => ({
          record_id: recordData.id,
          name: c.name,
          squad: c.squad,
          status: c.status
        }));

        const { error: cadetError } = await supabase
          .from('cadet_details')
          .insert(cadetsToInsert);

        if (cadetError) throw cadetError;
      }

      await dbService.addNotification({
        type: 'parade_submission',
        title: 'Parade State Submitted',
        content: `${record.officerName} submitted ${record.paradeType} parade state`,
        timestamp: new Date().toISOString(),
        read: false,
        officerName: record.officerName,
        yearGroup: record.yearGroup,
        courseNumber: record.courseNumber
      });
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
        .select('*')
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
          courseNumber: n.course_number // Correct semantic mapping
        })),
        error: null
      };
    } catch (err: any) {
      console.error('Supabase Error (getNotifications):', err);
      return { data: [], error: err };
    }
  },

  // ─── Audit Log (Querying audit_events table) ──────────────────────────────

  getAuditLogs: async (filters?: {
    actorName?: string;
    actionType?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<{ data: AuditEvent[]; error: any }> => {
    try {
      let query = supabase
        .from('audit_events')
        .select('*')
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

      const { data, error } = await query.limit(filters?.limit || 200);

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
        error: null
      };
    } catch (err: any) {
      console.error('Supabase Error (getAuditLogs):', err);
      return { data: [], error: err };
    }
  },

  logAuditEvent: async (event: Omit<AuditEvent, 'id' | 'createdAt'>) => {
    try {
      const { error } = await supabase
        .from('audit_events')
        .insert({
          actor_id: event.actorId,
          actor_name: event.actorName,
          action_type: event.actionType,
          target_id: event.targetId,
          payload: event.payload
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
    } catch (err: any) {
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
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
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

  getCadetRegistry: async (from?: number, to?: number, searchTerm?: string, courseNumber?: number): Promise<any[]> => {
    try {
      let query = supabase
        .from('cadet_registry')
        .select('*')
        .order('course_number', { ascending: true }) // Year 5 at the top, Year 1 at the bottom
        .order('squad', { ascending: true })
        .order('name', { ascending: true });

      // Filter by course number if provided
      if (courseNumber !== undefined && courseNumber > 0) {
        query = query.eq('course_number', courseNumber);
      }

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,squad.ilike.%${searchTerm}%`);
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

  getNominalRollData: async (courseNumber: number): Promise<any[]> => {
    try {
      // 1. Lean Fetch: Selected fields only for maximum speed
      // Sort by squad (numeric ascending) then by name (alpha ascending)
      const { data: registry, error: regError } = await supabase
        .from('cadet_registry')
        .select('id, name, squad')
        .eq('course_number', courseNumber)
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
      const { data, error: rpcError } = await supabase.rpc('update_cadet_registry_with_audit', {
        p_id: id,
        p_name: updates.name,
        p_squad: updates.squad,
        p_course_number: updates.course_number,
        p_year_group: updates.year_group
      });

      if (rpcError) throw rpcError;

      const result = Array.isArray(data) ? data[0] : data;
      const oldRec = result.old_record;
      const newRec = result.new_record;

      // 3. Log to Forensic Audit Table (Decoupled from Notifications)
      await dbService.logAuditEvent({
        actorId: String(officer.id),
        actorName: officer.fullName,
        actionType: 'CADET_MODIFIED',
        targetId: String(id),
        payload: {
          cadetName: newRec.name,
          before: oldRec,
          after: newRec,
          diff: Object.keys(updates)
            .filter(key => oldRec[key] !== newRec[key])
            .map(key => ({ field: key, from: oldRec[key], to: newRec[key] }))
        }
      });

      return { error: null };
    } catch (err) {
      console.error('Supabase Error (updateCadetRegistry):', err);
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
        absent: (data || []).filter(c => c.status === 'absent').length,
        sick: (data || []).filter(c => c.status === 'sick').length,
        detention: (data || []).filter(c => c.status === 'detention').length,
        lastEvent: null as any
      };

      // Find the most recent non-present event
      const nonPresentHistory = (data || [])
        .filter(c => c.status !== 'present' && c.parade_records)
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

  addCadetToRegistry: async (cadet: { name: string; squad: string; course_number: number; year_group?: number }) => {
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

  bulkAddCadetsToRegistry: async (cadets: { name: string; squad: string; course_number: number; year_group?: number }[]) => {
    try {
      if (cadets.length === 0) return;
      const { error } = await supabase
        .from('cadet_registry')
        .insert(cadets);
      if (error) throw error;
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
  }
};
