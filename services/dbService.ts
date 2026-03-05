
import { createClient } from '@supabase/supabase-js';
import { ParadeRecord, User, Notification, CadetStatus } from '../types';

/**
 * The Supabase client requires a valid URL and Anon Key.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL or Anon Key is missing. Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const dbService = {
  // ─── App Settings ────────────────────────────────────────────────────────

  getActiveRC: async (): Promise<number> => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'active_rc')
        .single();
      if (error) throw error;
      return parseInt(data?.value || '12', 10);
    } catch (err) {
      console.error('Supabase Error (getActiveRC):', err);
      return 12;
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

      return settings;
    } catch (err) {
      console.error('Supabase Error (getSubmissionSettings):', err);
      return {
        musterStartHour: MUSTER_START_DEFAULT,
        musterEndHour: MUSTER_END_DEFAULT,
        tattooStartHour: TATTOO_START_DEFAULT,
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

  loginWithCredentials: async (username: string, password_hash: string): Promise<User | null> => {
    try {
      const cleanUsername = username.trim();
      const cleanPassword = password_hash.trim();

      console.log('Attempting login for:', { cleanUsername, passwordLength: cleanPassword.length });

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', cleanUsername)
        .eq('password_hash', cleanPassword)
        .single();

      if (error || !data) {
        console.error('Login match failed:', error?.message || 'No user found');
        return null;
      }

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

  // ─── Parade Records ───────────────────────────────────────────────────────

  getRecords: async (from?: number, to?: number): Promise<ParadeRecord[]> => {
    try {
      let query = supabase
        .from('parade_records')
        .select('*, cadet_details(*) ')
        .order('created_at', { ascending: false });

      if (from !== undefined && to !== undefined) {
        query = query.range(from, to);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(r => ({
        ...r,
        officerId: r.officer_id,
        officerName: r.officer_name,
        courseName: r.course_name,
        yearGroup: r.year_group,
        courseNumber: r.course_number,
        paradeType: r.parade_type,
        presentCount: r.present_count,
        absentCount: r.absent_count,
        sickCount: r.sick_count,
        detentionCount: r.detention_count,
        passCount: r.pass_count,
        suspensionCount: r.suspension_count,
        yetToReportCount: r.yet_to_report_count,
        grandTotal: r.grand_total,
        cadets: r.cadet_details || [],
        createdAt: r.created_at
      }));
    } catch (err) {
      console.error('Supabase Error (getRecords):', err);
      return [];
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

  getNotifications: async (): Promise<Notification[]> => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []).map(n => ({
        ...n,
        officerName: n.officer_name,
        yearGroup: n.year_group,
        courseNumber: n.course_number
      }));
    } catch (err) {
      console.error('Supabase Error (getNotifications):', err);
      return [];
    }
  },

  addNotification: async (notif: Omit<Notification, 'id'>) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .insert({
          type: notif.type,
          title: notif.title,
          content: notif.content,
          timestamp: notif.timestamp,
          read: notif.read,
          officer_name: notif.officerName,
          year_group: notif.yearGroup,
          course_number: notif.courseNumber
        });
      if (error) throw error;
    } catch (err) {
      console.error('Supabase Error (addNotification):', err);
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

  // ─── Cadet Registry ───────────────────────────────────────────────────────

  getCadetRegistry: async (from?: number, to?: number, searchTerm?: string): Promise<any[]> => {
    try {
      let query = supabase
        .from('cadet_registry')
        .select('*')
        .order('course_number', { ascending: true }) // Year 5 at the top, Year 1 at the bottom
        .order('squad', { ascending: true })
        .order('name', { ascending: true });

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
