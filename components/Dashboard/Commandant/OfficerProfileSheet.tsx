import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ArrowLeft,
  ChevronRight,
  Pencil,
  Trash2,
  ShieldCheck,
  Mail,
  Briefcase,
  BadgeCheck,
  Eye,
  EyeOff,
  Lock,
  AlertTriangle,
  Check,
  Loader2
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { User, UserRole } from '../../../types';
import { dbService, supabase, updateUserCredentials } from '../../../services/dbService';
import { toast } from 'react-hot-toast';

const SENIOR_OFFICER_PRESETS = [
  'Commandant',
  'Director Field Studies',
  'Deputy Commandant'
];

const MEDICAL_OFFICER_PRESETS = [
  'Regimental Medical Officer',
  'Medical Officer on Duty',
  'Sickbay Nursing Officer'
];

const MATRON_PRESETS = [
  'Academy Matron',
  'Chief Matron (Female Wing)',
  'Duty Matron'
];

const RC_OPTIONS = [8, 9, 10, 11, 12, 13, 14, 15];

type SheetView = 'overview' | 'edit' | 'delete' | 'success';

interface CompletedActionSummary {
  type: 'edit' | 'delete';
  name: string;
  username: string;
  detail: string;
  secondaryDetail?: string;
}

interface OfficerProfileSheetProps {
  user: User | null;
  allUsers: User[];
  currentUser: User | null;
  activeAdminCount: number;
  onClose: () => void;
  onSuccess: () => void;
}

const sanitizeUsername = (val: string): string =>
  val.toLowerCase().replace(/[^a-z0-9._]/g, '');

const getInitials = (name?: string): string => {
  const parts = (name || 'U').trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (parts[0] || 'U').slice(0, 2).toUpperCase();
};

const getRoleLabel = (role: UserRole): string => {
  if (role === UserRole.ADMIN) return 'System Administrator';
  if (role === UserRole.COMMANDANT) return 'Senior Officer';
  if (role === UserRole.MEDICAL_OFFICER) return 'Medical Officer';
  if (role === UserRole.MATRON) return 'Academy Matron';
  return 'Course Officer';
};

const getAssignmentLabel = (u: User): string => {
  if (u.role === UserRole.COURSE_OFFICER) {
    return u.courseNumber ? `Regular Course ${u.courseNumber} (RC ${u.courseNumber})` : 'Unassigned';
  }
  if (u.role === UserRole.ADMIN) {
    return u.designation || 'System Administrator';
  }
  return u.designation || getRoleLabel(u.role);
};

export const OfficerProfileSheet: React.FC<OfficerProfileSheetProps> = ({
  user,
  allUsers,
  currentUser,
  activeAdminCount,
  onClose,
  onSuccess
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [view, setView] = useState<SheetView>('overview');
  const [completedAction, setCompletedAction] = useState<CompletedActionSummary | null>(null);

  // Edit form state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [courseNumber, setCourseNumber] = useState('12');
  const [designation, setDesignation] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [auditReason, setAuditReason] = useState('');

  // Inline re-authentication password (used for both Edit save & Delete confirmation)
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync form when target user changes
  useEffect(() => {
    if (!user) return;
    setView('overview');
    setCompletedAction(null);
    setFullName(user.fullName || '');
    setUsername(sanitizeUsername(user.username || ''));
    setEmail(user.email || '');
    setCourseNumber(user.courseNumber ? String(user.courseNumber) : '12');
    setDesignation(user.designation || getRoleLabel(user.role));
    setIsActive(user.isActive !== false);
    setNewPassword('');
    setShowNewPassword(false);
    setAuditReason('');
    setAdminPassword('');
    setShowAdminPassword(false);
    setIsSubmitting(false);
  }, [user]);

  // Escape key to dismiss
  useEffect(() => {
    if (!user) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, isSubmitting, onClose]);

  const isUsernameTaken = useMemo(() => {
    if (!user) return false;
    const clean = username.trim().toLowerCase();
    if (!clean) return false;
    return allUsers.some(
      u => String(u.id) !== String(user.id) && (u.username || '').trim().toLowerCase() === clean
    );
  }, [username, user, allUsers]);

  if (!user || typeof document === 'undefined') return null;

  const isSelf = currentUser ? String(currentUser.id) === String(user.id) : false;
  const isAdminAccount = user.role === UserRole.ADMIN;
  const isSoleActiveAdmin = isAdminAccount && user.isActive !== false && activeAdminCount <= 1;
  const canDelete = !isSelf && !isSoleActiveAdmin;
  const userIsActive = user.isActive !== false;

  const avatarTone = isAdminAccount
    ? 'bg-slate-900 text-white border-slate-900'
    : user.role === UserRole.MEDICAL_OFFICER
    ? 'bg-rose-50 text-rose-700 border-rose-200'
    : user.role === UserRole.MATRON
    ? 'bg-violet-50 text-violet-700 border-violet-200'
    : user.role === UserRole.COURSE_OFFICER
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-blue-50 text-blue-800 border-blue-200';

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!username.trim()) {
      toast.error('Username is required.');
      return;
    }
    if (isUsernameTaken) {
      toast.error('Username is already taken.');
      return;
    }
    if ((isSoleActiveAdmin || isSelf) && !isActive) {
      toast.error('Cannot suspend this administrator account.');
      return;
    }
    if (newPassword.trim() && !auditReason.trim()) {
      toast.error('Please enter a reason for resetting this password.');
      return;
    }
    if (!adminPassword.trim()) {
      toast.error('Enter your administrator password to save changes.');
      return;
    }

    setIsSubmitting(true);
    try {
      const isVerified = await dbService.verifyCommandantAccess(currentUser.id, adminPassword);
      if (!isVerified) {
        toast.error('Incorrect administrator password.');
        setIsSubmitting(false);
        return;
      }

      await updateUserCredentials({
        adminId: String(currentUser.id),
        targetUserId: String(user.id),
        newEmail: email.trim(),
        newCourseAssignment: user.role === UserRole.COURSE_OFFICER ? courseNumber : '',
        newDesignation: designation.trim(),
        newPassword: newPassword.trim() || undefined,
        currentPassword: adminPassword,
        isActive,
        auditDetails: auditReason.trim() || 'Updated officer profile in Users & Access',
        callerIdentity: {
          email: currentUser.email,
          username: currentUser.username
        }
      });

      const { error: profileErr } = await supabase
        .from('users')
        .update({
          full_name: fullName.trim(),
          username: username.trim().toLowerCase()
        })
        .eq('id', user.id);

      if (profileErr) {
        throw new Error(profileErr.message);
      }

      toast.success(`Updated ${fullName.trim()}`);
      onSuccess();
      setCompletedAction({
        type: 'edit',
        name: fullName.trim(),
        username: username.trim().toLowerCase(),
        detail: isActive ? 'Account active • Changes saved' : 'Account suspended • Sessions revoked',
        secondaryDetail: newPassword.trim()
          ? 'Password updated and active sessions signed out.'
          : 'Officer profile and access permissions are now live.'
      });
      setAdminPassword('');
      setView('success');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update officer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !canDelete) return;

    if (!adminPassword.trim()) {
      toast.error('Enter your administrator password to confirm deletion.');
      return;
    }

    setIsSubmitting(true);
    try {
      await dbService.deleteUser({
        adminId: String(currentUser.id),
        targetUserId: String(user.id),
        currentPassword: adminPassword,
        auditDetails: `Permanently deleted ${user.fullName} (@${user.username}) from Users & Access`,
        callerIdentity: {
          email: currentUser.email,
          username: currentUser.username
        }
      });

      toast.success(`${user.fullName || user.username} deleted`);
      onSuccess();
      setCompletedAction({
        type: 'delete',
        name: user.fullName || user.username,
        username: user.username,
        detail: 'Access revoked • Audit event logged',
        secondaryDetail: 'Historical parade submissions and forensic audit logs remain preserved.'
      });
      setAdminPassword('');
      setView('success');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const transitionProps = shouldReduceMotion
    ? { duration: 0.12 }
    : { type: 'spring' as const, stiffness: 380, damping: 34 };

  return createPortal(
    <AnimatePresence>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Manage ${user.fullName || user.username}`}
        data-drawer-open="true"
        className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => !isSubmitting && onClose()}
          className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs"
        />

        {/* Single Unified Sheet */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.96 }}
          animate={{ y: 0, opacity: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.96 }}
          transition={transitionProps}
          className="relative z-10 w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden"
        >
          {/* Mobile Grabber */}
          <div className="pt-2.5 pb-1 sm:hidden flex justify-center shrink-0">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>

          {/* Sheet Top Navigation Bar (Apple HIG / Meta Pattern) */}
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {view !== 'overview' && view !== 'success' && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setAdminPassword('');
                    setView('overview');
                  }}
                  className="min-w-[40px] min-h-[40px] -ml-2 px-2 inline-flex items-center gap-1 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-semibold transition-colors"
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
              )}
              <h3 className="text-base font-bold text-slate-900 truncate">
                {view === 'overview'
                  ? 'Officer Profile'
                  : view === 'edit'
                  ? 'Edit Profile & Access'
                  : view === 'delete'
                  ? 'Delete User'
                  : completedAction?.type === 'delete'
                  ? 'User Removed'
                  : 'Changes Saved'}
              </h3>
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              aria-label="Close"
              className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] overflow-y-auto">
            <AnimatePresence mode="wait" initial={false}>
              {/* ── VIEW 1: OVERVIEW (WhatsApp Contact Info / Google Account Card) ── */}
              {view === 'overview' && (
                <motion.div
                  key="overview"
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                  transition={{ duration: 0.16 }}
                  className="space-y-5"
                >
                  {/* Profile Identity Header */}
                  <div className="flex items-center gap-4">
                    <div className="relative shrink-0">
                      <div
                        className={`w-16 h-16 rounded-full border flex items-center justify-center font-mono text-lg font-bold ${avatarTone}`}
                      >
                        {isAdminAccount ? <ShieldCheck size={26} /> : getInitials(user.fullName || user.username)}
                      </div>
                      {isAdminAccount && (
                        <span
                          title="System Administrator"
                          className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-indigo-600 text-white border-2 border-white flex items-center justify-center"
                        >
                          <BadgeCheck size={13} />
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-lg font-bold text-slate-900 truncate">
                          {user.fullName || user.username}
                        </h4>
                        {isSelf && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            You
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-mono text-slate-500 truncate mt-0.5">
                        @{user.username}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            userIsActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {userIsActive ? 'Active' : 'Suspended'}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {getRoleLabel(user.role)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Inset Metadata Group */}
                  <div className="rounded-2xl bg-slate-50 border border-slate-200/80 divide-y divide-slate-200/70">
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 text-slate-500">
                        <Mail size={15} className="shrink-0" />
                        <span className="text-xs font-medium">Email</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-900 truncate">
                        {user.email || 'Not set'}
                      </span>
                    </div>

                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 text-slate-500">
                        <Briefcase size={15} className="shrink-0" />
                        <span className="text-xs font-medium">
                          {user.role === UserRole.COURSE_OFFICER ? 'Assignment' : 'Title'}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-slate-900 text-right">
                        {getAssignmentLabel(user)}
                      </span>
                    </div>
                  </div>

                  {/* Grouped Action Rows (WhatsApp / iOS Settings Pattern) */}
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden divide-y divide-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setAdminPassword('');
                          setView('edit');
                        }}
                        className="w-full min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 active:bg-slate-100 text-left transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                            <Pencil size={15} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              Edit Profile & Access
                            </p>
                            <p className="text-xs text-slate-500">
                              Update name, handle, role assignment, status, or password
                            </p>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-slate-400 shrink-0" />
                      </button>
                    </div>

                    {/* Separated Destructive Group */}
                    {canDelete ? (
                      <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            setAdminPassword('');
                            setView('delete');
                          }}
                          className="w-full min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 hover:bg-rose-50/70 active:bg-rose-100/70 text-left transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                              <Trash2 size={15} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-rose-600">Delete User</p>
                              <p className="text-xs text-slate-500">
                                Permanently remove account and revoke portal access
                              </p>
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-rose-400 shrink-0" />
                        </button>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-2.5 text-xs text-slate-600">
                        <ShieldCheck size={16} className="text-slate-700 shrink-0 mt-0.5" />
                        <span>
                          {isSelf
                            ? 'This is your active System Administrator session. Self-deletion is disabled to prevent lockout.'
                            : 'Protected root account: the sole active System Administrator cannot be deleted.'}
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── VIEW 2: EDIT PROFILE & ACCESS ── */}
              {view === 'edit' && (
                <motion.form
                  key="edit"
                  onSubmit={handleSaveEdit}
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
                  transition={{ duration: 0.16 }}
                  className="space-y-4"
                >
                  {/* Full Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-xl px-3.5 py-2 text-base sm:text-sm text-slate-900 outline-none transition-colors"
                    />
                  </div>

                  {/* Username */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Username
                    </label>
                    <div
                      className={`flex items-center bg-slate-50 focus-within:bg-white border rounded-xl px-3.5 min-h-[44px] transition-colors ${
                        isUsernameTaken
                          ? 'border-rose-400 bg-rose-50/40'
                          : 'border-slate-200 focus-within:border-blue-600'
                      }`}
                    >
                      <span className="text-slate-400 font-semibold text-base sm:text-sm mr-1">
                        @
                      </span>
                      <input
                        type="text"
                        required
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={username}
                        onChange={e => setUsername(sanitizeUsername(e.target.value))}
                        className="w-full bg-transparent py-2 text-base sm:text-sm font-mono text-slate-900 outline-none"
                      />
                    </div>
                    {isUsernameTaken && (
                      <p className="text-xs font-semibold text-rose-600 mt-1">
                        Username is already taken.
                      </p>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-xl px-3.5 py-2 text-base sm:text-sm text-slate-900 outline-none transition-colors"
                    />
                  </div>

                  {/* Role-Specific Assignment / Designation */}
                  {user.role === UserRole.COURSE_OFFICER ? (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Assigned Regular Course
                      </label>
                      <select
                        value={courseNumber}
                        onChange={e => setCourseNumber(e.target.value)}
                        className="w-full min-h-[44px] bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-600 rounded-xl px-3.5 py-2 text-base sm:text-sm font-semibold text-slate-900 outline-none"
                      >
                        {RC_OPTIONS.map(rc => (
                          <option key={rc} value={String(rc)}>
                            Regular Course {rc} (RC {rc})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Official Title / Designation
                      </label>
                      {(user.role === UserRole.COMMANDANT || user.role === UserRole.MEDICAL_OFFICER || user.role === UserRole.MATRON) && (
                        <div className="flex flex-wrap gap-1.5">
                          {(user.role === UserRole.MEDICAL_OFFICER
                            ? MEDICAL_OFFICER_PRESETS
                            : user.role === UserRole.MATRON
                            ? MATRON_PRESETS
                            : SENIOR_OFFICER_PRESETS
                          ).map(preset => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setDesignation(preset)}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                designation === preset
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      )}
                      <input
                        type="text"
                        required
                        value={designation}
                        onChange={e => setDesignation(e.target.value)}
                        className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-xl px-3.5 py-2 text-base sm:text-sm text-slate-900 outline-none transition-colors"
                      />
                    </div>
                  )}

                  {/* Account Active Switch */}
                  <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <p className="text-xs font-bold text-slate-900">Account Active</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {isSoleActiveAdmin || isSelf
                          ? 'Protected: active System Administrator cannot be suspended'
                          : 'Suspended officers are signed out immediately'}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isActive}
                      disabled={isSoleActiveAdmin || isSelf}
                      onClick={() => setIsActive(prev => !prev)}
                      className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        isActive ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md transition ${
                          isActive ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Optional Password Reset */}
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Reset Password (Optional)
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="Leave blank to keep current password"
                          className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-xl pl-3.5 pr-11 py-2 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(prev => !prev)}
                          aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-1 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg"
                        >
                          {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    {newPassword.trim().length > 0 && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          Reason for Password Reset
                        </label>
                        <input
                          type="text"
                          required
                          value={auditReason}
                          onChange={e => setAuditReason(e.target.value)}
                          placeholder="e.g. Officer requested reset"
                          className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-xl px-3.5 py-2 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* Calm Inline Admin Re-Authentication */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                      <Lock size={14} className="text-slate-500" />
                      <span>Verify Administrator Password</span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type={showAdminPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={adminPassword}
                        onChange={e => setAdminPassword(e.target.value)}
                        placeholder="Enter your current password to save"
                        className="w-full min-h-[44px] bg-white border border-slate-200 focus:border-blue-600 rounded-xl pl-3.5 pr-11 py-2 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminPassword(prev => !prev)}
                        aria-label={showAdminPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-1 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg"
                      >
                        {showAdminPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setAdminPassword('');
                        setView('overview');
                      }}
                      className="flex-1 min-h-[46px] rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-sm font-semibold transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || isUsernameTaken || !adminPassword.trim()}
                      className="flex-[1.4] min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-bold shadow-sm transition-all"
                    >
                      {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
                    </button>
                  </div>
                </motion.form>
              )}

              {/* ── VIEW 3: DELETE USER CONFIRMATION ── */}
              {view === 'delete' && (
                <motion.form
                  key="delete"
                  onSubmit={handleConfirmDelete}
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
                  transition={{ duration: 0.16 }}
                  className="space-y-4"
                >
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200/90 space-y-2">
                    <div className="flex items-center gap-2.5 text-rose-800">
                      <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                      <h4 className="text-sm font-bold">
                        Delete {user.fullName || user.username}?
                      </h4>
                    </div>
                    <p className="text-xs text-rose-900/80 leading-relaxed">
                      This permanently removes{' '}
                      <span className="font-mono font-semibold">@{user.username}</span> from Users
                      & Access and immediately revokes their portal sessions. Historical parade
                      submissions and forensic audit logs will be preserved.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Administrator Password
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type={showAdminPassword ? 'text' : 'password'}
                        required
                        autoFocus
                        autoComplete="current-password"
                        value={adminPassword}
                        onChange={e => setAdminPassword(e.target.value)}
                        placeholder="Enter your password to confirm deletion"
                        className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-rose-500 rounded-xl pl-3.5 pr-11 py-2 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminPassword(prev => !prev)}
                        aria-label={showAdminPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-1 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg"
                      >
                        {showAdminPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setAdminPassword('');
                        setView('overview');
                      }}
                      className="flex-1 min-h-[46px] rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-sm font-semibold transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !adminPassword.trim()}
                      className="flex-1 min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-bold shadow-sm transition-colors"
                    >
                      {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      <span>{isSubmitting ? 'Deleting...' : 'Delete User'}</span>
                    </button>
                  </div>
                </motion.form>
              )}

              {/* ── VIEW 4: SUCCESS CONFIRMATION (Apple HIG / Benji Taylor Tactile Receipt) ── */}
              {view === 'success' && completedAction && (
                <motion.div
                  key="success"
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="py-3 text-center space-y-5"
                >
                  {/* Animated Confirmation Ring */}
                  <div className="flex justify-center">
                    <motion.div
                      initial={shouldReduceMotion ? false : { scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={
                        shouldReduceMotion
                          ? { duration: 0.1 }
                          : { type: 'spring', stiffness: 420, damping: 24 }
                      }
                      className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-8 h-8"
                        aria-hidden="true"
                      >
                        <motion.path
                          d="M5 13l4 4L19 7"
                          initial={shouldReduceMotion ? { pathLength: 1 } : { pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.28, delay: 0.08, ease: 'easeOut' }}
                        />
                      </svg>
                    </motion.div>
                  </div>

                  {/* Direct, Calm Confirmation Copy */}
                  <div className="space-y-1.5 px-2">
                    <h4 className="text-lg font-bold text-slate-900">
                      {completedAction.type === 'delete' ? 'User Deleted' : 'Profile Updated'}
                    </h4>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      <span className="font-semibold text-slate-900">{completedAction.name}</span>{' '}
                      <span className="font-mono text-xs text-slate-500">
                        (@{completedAction.username})
                      </span>{' '}
                      {completedAction.type === 'delete'
                        ? 'has been permanently removed.'
                        : 'has been updated.'}
                    </p>
                  </div>

                  {/* Receipt Summary Pill */}
                  <div className="rounded-2xl bg-slate-50 border border-slate-200/80 px-4 py-3 text-left space-y-1">
                    <p className="text-xs font-semibold text-slate-800">{completedAction.detail}</p>
                    {completedAction.secondaryDetail && (
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {completedAction.secondaryDetail}
                      </p>
                    )}
                  </div>

                  {/* Primary Done Button */}
                  <button
                    type="button"
                    autoFocus
                    onClick={onClose}
                    className="w-full min-h-[48px] rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white text-sm font-bold transition-all"
                  >
                    Done
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};

