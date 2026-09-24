
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
  email?: string;
  password?: string;
  isActive?: boolean;
}

export interface CadetDetail {
  name: string;
  squad: string;
  status: CadetStatus;
}

export interface ParadeRecordMetadata {
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
  status?: string;
  createdAt: string;
}

export interface FullParadeRecord extends ParadeRecordMetadata {
  cadets: CadetDetail[];
}

export type ParadeRecord = FullParadeRecord; // Temporary alias for backward compatibility for other components that might still reference it

export interface NotificationMetadata {
  recordId?: string | number;
  courseNumber?: number;
  courseName?: string;
  paradeType?: ParadeType | string;
  date?: string;
  cadetName?: string;
  cadetId?: string;
  squad?: string;
  route?: string;
  counts?: {
    present?: number;
    absent?: number;
    sick?: number;
    detention?: number;
    pass?: number;
    suspension?: number;
    yetToReport?: number;
    grandTotal?: number;
  };
  [key: string]: any;
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
  metadata?: NotificationMetadata;
  archivedAt?: string; // For Lapse 2: Audit Immutability
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

export interface AuditEvent {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actionType: 'CADET_MODIFIED' | 'CADET_ADDED' | 'CADET_REMOVED' | 'SETTINGS_CHANGED' | 'OFFICER_INVITED' | 'OFFICER_ASSIGNED' | 'CREDENTIAL_OVERRIDE' | 'COURSE_GRADUATION' | 'CADET_DISMISSED';
  targetId?: string;
  payload: any;
  createdAt: string;
}
