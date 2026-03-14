
export enum UserRole {
  COMMANDANT = 'commandant',
  COURSE_OFFICER = 'course_officer'
}

export enum ParadeType {
  MUSTER = 'muster',
  TATTOO = 'tattoo',
  SPECIAL = 'special'
}

export enum CadetStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  SICK = 'sick',
  DETENTION = 'detention',
  PASS = 'pass',
  SUSPENSION = 'suspension',
  YET_TO_REPORT = 'yet_to_report'
}

export interface User {
  id: string | number;
  username: string;
  serviceNumber?: string;
  role: UserRole;
  fullName: string;
  assignedCourseNumber?: number;
  courseName?: string;
  /**
   * @deprecated Use courseNumber instead. Kept for backward compatibility
   * with old session data and parade records.
   */
  yearGroup?: number;
  /** The permanent RC course number (e.g., 12 for RC 12). Stable, never changes. */
  courseNumber?: number;
  totalCadets?: number;
  profileImage?: string;
}

export interface CadetDetail {
  name: string;
  squad: string;
  status: CadetStatus;
}

export interface ParadeRecord {
  id: string | number;
  officerId: string | number;
  officerName: string;
  courseName: string;
  /**
   * @deprecated Use courseNumber instead. Kept for reading legacy records.
   */
  yearGroup: number;
  /** The permanent RC course number stored at submission time. */
  courseNumber?: number;
  date: string;
  paradeType: ParadeType;
  presentCount: number;
  absentCount: number;
  sickCount: number;
  detentionCount: number;
  passCount?: number;
  suspensionCount?: number;
  yetToReportCount?: number;
  grandTotal: number;
  cadets: CadetDetail[];
  createdAt: string;
}

export interface Notification {
  id: string;
  type: 'profile_update' | 'parade_submission' | 'login' | 'logout' | 'cadet_added' | 'cadet_removed' | 'settings_change' | string;
  title: string;
  content: string;
  timestamp: string;
  read: boolean;
  officerName: string;
  /** @deprecated Use courseNumber instead. */
  yearGroup: number;
  courseNumber?: number;
}

export interface DashboardStats {
  totalCadets: number;
  presentToday: number;
  absentThisWeek: number;
  sickCadets: number;
}

export interface SubmissionSettings {
  musterStartHour: number;
  musterEndHour: number;
  tattooStartHour: number;
}
