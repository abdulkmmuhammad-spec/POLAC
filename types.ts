
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
  actionType:
    | 'CADET_MODIFIED'
    | 'CADET_ADDED'
    | 'CADET_REMOVED'
    | 'SETTINGS_CHANGED'
    | 'OFFICER_INVITED'
    | 'OFFICER_ASSIGNED'
    | 'CREDENTIAL_OVERRIDE'
    | 'COURSE_GRADUATION'
    | 'CADET_DISMISSED'
    | 'COURSE_BULK_PURGED'
    | 'COURSE_PURGE_RESTORED'
    | 'BULK_CADET_IMPORT'
    | 'COMMANDANT_REMARK_ISSUED'
    | 'COMMANDANT_REMARK_RESPONDED'
    | 'COMMANDANT_REMARK_RESOLVED'
    | string;
  targetId?: string;
  payload: any;
  createdAt: string;
}

export type CommandantRemarkStatus = 'pending' | 'addressed' | 'resolved';

export interface RemarkThreadMessage {
  id: string;
  senderRole: 'commandant' | 'course_officer';
  senderName: string;
  message: string;
  timestamp: string;
}

export interface CommandantRemark {
  id: string;
  submissionId: string;
  commandantId?: string | null;
  commandantName: string;
  courseOfficerId?: string | null;
  courseOfficerName?: string | null;
  courseNumber?: number | null;
  paradeType?: ParadeType | string | null;
  paradeDate?: string | null;
  remarkText: string;
  officerResponse?: string | null;
  respondedAt?: string | null;
  status: CommandantRemarkStatus;
  resolvedAt?: string | null;
  thread?: RemarkThreadMessage[];
  createdAt: string;
  updatedAt?: string;
}

export type CoursePurgeMode = 'SOFT_DELETE' | 'HARD_DELETE';

export interface CourseImpactBreakdownItem {
  courseNumber: number;
  totalCadets: number;
  activeCadets: number;
  squadCount: number;
}

export interface CourseImpactSummary {
  totalCadets: number;
  activeCadets: number;
  paradeRecordsCount: number;
  attendanceLogsCount: number;
  disciplinaryLogsCount: number;
  assignedOfficersCount: number;
  pushSubscriptionsCount: number;
  courseBreakdown: CourseImpactBreakdownItem[];
}

export interface CoursePurgeSnapshot {
  id: string;
  courseNumbers: number[];
  purgeMode: CoursePurgeMode;
  cadetCount: number;
  paradeRecordsAffected: number;
  disciplinaryLogsAffected: number;
  isRecoverable: boolean;
  actorId: string | null;
  actorName: string;
  clientIp: string;
  confirmationPhrase?: string;
  restoredAt: string | null;
  restoredByName?: string | null;
  createdAt: string;
  snapshotData?: any[];
}

export interface BulkCoursePurgeResult {
  success: boolean;
  snapshotId: string | null;
  purgedCadetCount: number;
  paradeRecordsAffected: number;
  disciplinaryLogsAffected: number;
  courseNumbers: number[];
  purgeMode: CoursePurgeMode;
  isRecoverable: boolean;
  timestamp: string;
}

export interface CadetRegistryItem {
  id: string | number;
  name: string;
  squad: string;
  course_number: number;
  year_group: number;
  status: 'ACTIVE' | 'DISMISSED' | 'GRADUATED' | string;
  avatar_url?: string | null;
  relegated_from_rc?: number | null;
  npa_number?: string | null;
  admission_year?: number | null;
  created_at?: string;
}

export type TemplateImportFormat = 'NPA_FORMAT' | 'LEGACY_FORMAT' | 'UNKNOWN';

export interface ParsedCadetRow {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
  name: string;
  squad: string;
  course_number: number;
  year_group?: number;
  npa_number?: string;
  admission_year?: number;
  rawData: Record<string, any>;
}

export interface CadetImportParseResult {
  detectedFormat: TemplateImportFormat;
  totalRows: number;
  validRows: ParsedCadetRow[];
  invalidRows: ParsedCadetRow[];
  allRows: ParsedCadetRow[];
  globalErrors: string[];
}
