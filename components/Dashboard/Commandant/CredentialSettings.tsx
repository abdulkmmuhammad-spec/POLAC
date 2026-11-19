import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  UserPlus,
  ChevronRight,
  Eye,
  EyeOff,
  X,
  AlertTriangle,
  Check,
  Loader2
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { dbService, supabase, updateUserCredentials } from '../../../services/dbService';
import { User, UserRole } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { SecurityOverrideModal } from './SecurityOverrideModal';
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

const RC_OPTIONS = [8, 9, 10, 11, 12, 13, 14, 15];

type RoleFilter = 'all' | 'course_officer' | 'commandant' | 'medical_officer';

const sanitizeUsername = (val: string): string =>
  val.toLowerCase().replace(/[^a-z0-9._]/g, '');

const getInitials = (name?: string): string => {
  const parts = (name || 'U').trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (parts[0] || 'U').slice(0, 2).toUpperCase();
};

const getRoleSummary = (u: User): string => {
  const handle = u.username ? `@${u.username}` : '';
  let roleLabel = u.designation || 'Officer';
  if (u.role === UserRole.COURSE_OFFICER) {
    roleLabel = u.courseNumber ? `RC ${u.courseNumber} Course Officer` : 'Course Officer';
  } else if (u.role === UserRole.ADMIN) {
    roleLabel = u.designation || 'System Administrator';
  } else if (u.role === UserRole.MEDICAL_OFFICER) {
    roleLabel = u.designation || 'Medical Officer';
  } else if (u.role === UserRole.COMMANDANT) {
    roleLabel = u.designation || 'Commandant';
  }
  return handle ? `${handle} • ${roleLabel}` : roleLabel;
};

export const CredentialSettings: React.FC = () => {
  const { currentUser } = useAuth();
  const shouldReduceMotion = useReducedMotion();

  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  // Add Officer Sheet State
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [addPayload, setAddPayload] = useState({
    role: UserRole.COURSE_OFFICER as UserRole,
    courseNumber: '12',
    designation: 'Course Officer',
    fullName: '',
    username: '',
    email: '',
    password: ''
  });

  // Manage Officer Auth + Sheet State
  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [verifiedCurrentPassword, setVerifiedCurrentPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editPayload, setEditPayload] = useState({
    fullName: '',
    username: '',
    email: '',
    courseNumber: '',
    designation: '',
    password: '',
    auditReason: '',
    isActive: true
  });

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const data = await dbService.getAllUsers();
      setUsers(data);
    } catch {
      toast.error('Failed to load officers.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Body scroll lock while any sheet is open
  useEffect(() => {
    if (!isAddSheetOpen && !isManageOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isAddSheetOpen, isManageOpen]);

  const activeCourseOfficersCount = useMemo(
    () => users.filter(u => u.role === UserRole.COURSE_OFFICER && u.isActive !== false).length,
    [users]
  );
  const isCapReached = activeCourseOfficersCount >= 5;

  const activeAdminCount = useMemo(
    () => users.filter(u => u.role === UserRole.ADMIN && u.isActive !== false).length,
    [users]
  );

  // Duplicate username checks
  const isAddUsernameTaken = useMemo(() => {
    const clean = addPayload.username.trim().toLowerCase();
    if (!clean) return false;
    return users.some(u => (u.username || '').trim().toLowerCase() === clean);
  }, [addPayload.username, users]);

  const isEditUsernameTaken = useMemo(() => {
    const clean = editPayload.username.trim().toLowerCase();
    if (!clean || !targetUser) return false;
    return users.some(
      u => String(u.id) !== String(targetUser.id) && (u.username || '').trim().toLowerCase() === clean
    );
  }, [editPayload.username, targetUser, users]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/^@/, '');
    return users.filter(u => {
      if (roleFilter === 'course_officer' && u.role !== UserRole.COURSE_OFFICER) return false;
      if (roleFilter === 'commandant' && u.role !== UserRole.COMMANDANT && u.role !== UserRole.ADMIN) {
        return false;
      }
      if (roleFilter === 'medical_officer' && u.role !== UserRole.MEDICAL_OFFICER) return false;

      if (!q) return true;
      return (
        (u.fullName || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.designation || '').toLowerCase().includes(q) ||
        (u.courseNumber ? `rc ${u.courseNumber}`.includes(q) : false)
      );
    });
  }, [users, roleFilter, searchQuery]);

  const handleOpenAdd = () => {
    setAddPayload({
      role: isCapReached ? UserRole.COMMANDANT : UserRole.COURSE_OFFICER,
      courseNumber: '12',
      designation: isCapReached ? 'Director Field Studies' : 'Course Officer',
      fullName: '',
      username: '',
      email: '',
      password: ''
    });
    setShowAddPassword(false);
    setIsAddSheetOpen(true);
  };

  const handleAddOfficer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (addPayload.role === UserRole.COURSE_OFFICER && isCapReached) {
      toast.error('Maximum of 5 active Course Officers reached.');
      return;
    }
    if (!addPayload.username.trim()) {
      toast.error('Please enter a username.');
      return;
    }
    if (isAddUsernameTaken) {
      toast.error('Username is already taken.');
      return;
    }

    setIsAdding(true);
    try {
      await dbService.registerOfficer(
        currentUser.id,
        {
          email: addPayload.email.trim(),
          password: addPayload.password,
          username: addPayload.username.trim().toLowerCase(),
          fullName: addPayload.fullName.trim(),
          role: addPayload.role,
          designation:
            addPayload.role === UserRole.COMMANDANT
              ? addPayload.designation.trim() || 'Director Field Studies'
              : addPayload.role === UserRole.MEDICAL_OFFICER
              ? addPayload.designation.trim() || 'Regimental Medical Officer'
              : 'Course Officer',
          courseNumber:
            addPayload.role === UserRole.COURSE_OFFICER && addPayload.courseNumber
              ? Number(addPayload.courseNumber)
              : undefined
        },
        {
          email: currentUser.email,
          username: currentUser.username
        }
      );
      toast.success(`${addPayload.fullName.trim()} added`);
      setIsAddSheetOpen(false);
      fetchUsers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add officer.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRowClick = (user: User) => {
    setTargetUser(user);
    setVerifiedCurrentPassword('');
    setShowEditPassword(false);
    setEditPayload({
      fullName: user.fullName || '',
      username: sanitizeUsername(user.username || ''),
      email: user.email || '',
      courseNumber: user.courseNumber ? String(user.courseNumber) : '12',
      designation: user.designation || '',
      password: '',
      auditReason: '',
      isActive: user.isActive !== false
    });
    setIsOverrideModalOpen(true);
  };

  const handleAuthorize = async (password: string) => {
    if (!currentUser) return;
    const isValid = await dbService.verifyCommandantAccess(currentUser.id, password);
    if (isValid) {
      setVerifiedCurrentPassword(password);
      setIsOverrideModalOpen(false);
      setIsManageOpen(true);
    } else {
      toast.error('Invalid administrator password.');
    }
  };

  const isTargetSoleActiveAdmin =
    targetUser?.role === UserRole.ADMIN &&
    targetUser?.isActive !== false &&
    activeAdminCount <= 1;

  const handleSaveManage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser || !currentUser || !verifiedCurrentPassword) return;

    if (!editPayload.username.trim()) {
      toast.error('Username is required.');
      return;
    }
    if (isEditUsernameTaken) {
      toast.error('Username is already taken.');
      return;
    }
    if (isTargetSoleActiveAdmin && !editPayload.isActive) {
      toast.error('Cannot suspend the last active System Administrator.');
      return;
    }
    if (editPayload.password.trim() && !editPayload.auditReason.trim()) {
      toast.error('Please enter a reason for resetting this password.');
      return;
    }

    setIsSavingEdit(true);
    try {
      await updateUserCredentials({
        adminId: String(currentUser.id),
        targetUserId: String(targetUser.id),
        newEmail: editPayload.email.trim(),
        newCourseAssignment:
          targetUser.role === UserRole.COURSE_OFFICER ? editPayload.courseNumber : '',
        newDesignation: editPayload.designation.trim(),
        newPassword: editPayload.password.trim() || undefined,
        currentPassword: verifiedCurrentPassword,
        isActive: editPayload.isActive,
        auditDetails:
          editPayload.auditReason.trim() || 'Updated officer profile in Users & Access'
      });

      // Update full_name & username cleanly
      await supabase
        .from('users')
        .update({
          full_name: editPayload.fullName.trim(),
          username: editPayload.username.trim().toLowerCase()
        })
        .eq('id', targetUser.id);

      toast.success(`Updated ${editPayload.fullName.trim()}`);
      setIsManageOpen(false);
      setTargetUser(null);
      setVerifiedCurrentPassword('');
      fetchUsers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update officer.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const roleAvatarColor = (role: UserRole) => {
    if (role === UserRole.MEDICAL_OFFICER) return 'bg-rose-50 text-rose-700 border-rose-200';
    if (role === UserRole.COURSE_OFFICER) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-blue-50 text-blue-800 border-blue-200';
  };

  return (
    <div className="space-y-4">
      {/* ── Top Search + Add Officer Row ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-3.5 sm:p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 flex items-center">
            <Search size={16} className="absolute left-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search officers..."
              className="w-full min-h-[44px] pl-10 pr-9 py-2 bg-slate-100/80 focus:bg-white border border-transparent focus:border-slate-300 rounded-full text-base sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="min-h-[44px] px-4 py-2 rounded-full bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 shadow-2xs transition-colors"
          >
            <UserPlus size={15} />
            <span>Add Officer</span>
          </button>
        </div>

        {/* Role Filter Pills */}
        <div
          data-no-page-swipe="true"
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar"
        >
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'course_officer', label: `Course Officers (${activeCourseOfficersCount}/5)` },
              { key: 'commandant', label: 'Senior Officer' },
              { key: 'medical_officer', label: 'Medical' }
            ] as const
          ).map(pill => {
            const isActive = roleFilter === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => setRoleFilter(pill.key)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── iOS Contacts-Style Grouped Roster ── */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-700 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Loading officers...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
          <p className="text-sm font-bold text-slate-800">No officers found</p>
          <p className="text-xs text-slate-500">
            Try a different search term or tap Add Officer to create an account.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden divide-y divide-slate-100">
          {filteredUsers.map(u => {
            const isActive = u.isActive !== false;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => handleRowClick(u)}
                className="w-full min-h-[64px] px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 active:bg-slate-100 text-left transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-full border flex items-center justify-center font-mono text-xs font-bold shrink-0 ${roleAvatarColor(
                      u.role
                    )}`}
                  >
                    {getInitials(u.fullName || u.username)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {u.fullName || u.username}
                    </p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {getRoleSummary(u)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {isActive ? 'Active' : 'Suspended'}
                  </span>
                  <ChevronRight size={16} className="text-slate-400" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Security Verification Modal ── */}
      <SecurityOverrideModal
        isOpen={isOverrideModalOpen}
        onClose={() => setIsOverrideModalOpen(false)}
        onAuthorize={handleAuthorize}
        targetName={targetUser?.fullName || ''}
      />

      {/* ── Instagram-Style Add Officer Bottom Sheet ── */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isAddSheetOpen && (
              <div
                role="dialog"
                aria-modal="true"
                data-drawer-open="true"
                className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => !isAdding && setIsAddSheetOpen(false)}
                  className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
                />

                <motion.form
                  onSubmit={handleAddOfficer}
                  autoComplete="off"
                  initial={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.9 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.9 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0.12 }
                      : { type: 'spring', stiffness: 360, damping: 32 }
                  }
                  className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[92vh] overflow-y-auto space-y-4"
                >
                  <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto -mt-1 sm:hidden" />

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Add Officer</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Create a login account and assign their role
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddSheetOpen(false)}
                      aria-label="Close"
                      className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* 3-Way Segmented Role Control */}
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
                    {[
                      { role: UserRole.COURSE_OFFICER, label: 'Course Officer' },
                      { role: UserRole.COMMANDANT, label: 'Senior Officer' },
                      { role: UserRole.MEDICAL_OFFICER, label: 'Medical Officer' }
                    ].map(opt => {
                      const active = addPayload.role === opt.role;
                      return (
                        <button
                          key={opt.role}
                          type="button"
                          onClick={() =>
                            setAddPayload(prev => ({
                              ...prev,
                              role: opt.role,
                              designation:
                                opt.role === UserRole.COMMANDANT
                                  ? 'Director Field Studies'
                                  : opt.role === UserRole.MEDICAL_OFFICER
                                  ? 'Regimental Medical Officer'
                                  : 'Course Officer'
                            }))
                          }
                          className={`min-h-[40px] px-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                            active
                              ? 'bg-white text-slate-900 shadow-2xs font-bold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* 1. Role Assignment */}
                  {addPayload.role === UserRole.COURSE_OFFICER ? (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-slate-700">
                          Regular Course (RC)
                        </label>
                        {isCapReached && (
                          <span className="text-[11px] font-semibold text-rose-600">
                            5/5 slots full
                          </span>
                        )}
                      </div>
                      <select
                        value={addPayload.courseNumber}
                        onChange={e =>
                          setAddPayload(prev => ({ ...prev, courseNumber: e.target.value }))
                        }
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
                        Title
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {(addPayload.role === UserRole.MEDICAL_OFFICER
                          ? MEDICAL_OFFICER_PRESETS
                          : SENIOR_OFFICER_PRESETS
                        ).map(preset => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              setAddPayload(prev => ({ ...prev, designation: preset }))
                            }
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                              addPayload.designation === preset
                                ? 'bg-blue-900 text-white border-blue-900'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        required
                        value={addPayload.designation}
                        onChange={e =>
                          setAddPayload(prev => ({ ...prev, designation: e.target.value }))
                        }
                        placeholder="Enter title..."
                        className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-xl px-3.5 py-2 text-base sm:text-sm text-slate-900 outline-none"
                      />
                    </div>
                  )}

                  {/* 2. Full Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={addPayload.fullName}
                      onChange={e =>
                        setAddPayload(prev => ({ ...prev, fullName: e.target.value }))
                      }
                      placeholder="e.g. DSP Musa Ibrahim"
                      className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-xl px-3.5 py-2 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                    />
                  </div>

                  {/* 3. Username (@handle) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Username
                    </label>
                    <div
                      className={`flex items-center bg-slate-50 focus-within:bg-white border rounded-xl px-3.5 min-h-[44px] transition-colors ${
                        isAddUsernameTaken
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
                        value={addPayload.username}
                        onChange={e =>
                          setAddPayload(prev => ({
                            ...prev,
                            username: sanitizeUsername(e.target.value)
                          }))
                        }
                        placeholder="dsp.musa"
                        className="w-full bg-transparent py-2 text-base sm:text-sm font-mono text-slate-900 placeholder:text-slate-400 outline-none"
                      />
                    </div>
                    {isAddUsernameTaken && (
                      <p className="text-xs font-semibold text-rose-600 mt-1">
                        Username is already taken.
                      </p>
                    )}
                  </div>

                  {/* 4. Email Address */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      name="new-officer-email"
                      autoComplete="off"
                      value={addPayload.email}
                      onChange={e =>
                        setAddPayload(prev => ({ ...prev, email: e.target.value }))
                      }
                      className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-xl px-3.5 py-2 text-base sm:text-sm text-slate-900 outline-none"
                    />
                  </div>

                  {/* 5. Password */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Password
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type={showAddPassword ? 'text' : 'password'}
                        required
                        name="new-officer-password"
                        autoComplete="new-password"
                        value={addPayload.password}
                        onChange={e =>
                          setAddPayload(prev => ({ ...prev, password: e.target.value }))
                        }
                        className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-xl pl-3.5 pr-11 py-2 text-base sm:text-sm text-slate-900 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAddPassword(prev => !prev)}
                        aria-label={showAddPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-1 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg"
                      >
                        {showAddPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      isAdding ||
                      isAddUsernameTaken ||
                      (addPayload.role === UserRole.COURSE_OFFICER && isCapReached)
                    }
                    className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-bold shadow-sm transition-all"
                  >
                    {isAdding ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                    <span>{isAdding ? 'Adding Officer...' : 'Add Officer'}</span>
                  </button>
                </motion.form>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* ── Tappable Manage Officer Bottom Sheet ── */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isManageOpen && targetUser && (
              <div
                role="dialog"
                aria-modal="true"
                data-drawer-open="true"
                className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => !isSavingEdit && setIsManageOpen(false)}
                  className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
                />

                <motion.form
                  onSubmit={handleSaveManage}
                  initial={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.9 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.9 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0.12 }
                      : { type: 'spring', stiffness: 360, damping: 32 }
                  }
                  className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[92vh] overflow-y-auto space-y-4"
                >
                  <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto -mt-1 sm:hidden" />

                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-slate-900">Manage Officer</h3>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {targetUser.fullName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsManageOpen(false)}
                      aria-label="Close"
                      className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Full Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={editPayload.fullName}
                      onChange={e =>
                        setEditPayload(prev => ({ ...prev, fullName: e.target.value }))
                      }
                      className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-xl px-3.5 py-2 text-base sm:text-sm text-slate-900 outline-none"
                    />
                  </div>

                  {/* Username */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Username
                    </label>
                    <div
                      className={`flex items-center bg-slate-50 focus-within:bg-white border rounded-xl px-3.5 min-h-[44px] ${
                        isEditUsernameTaken
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
                        value={editPayload.username}
                        onChange={e =>
                          setEditPayload(prev => ({
                            ...prev,
                            username: sanitizeUsername(e.target.value)
                          }))
                        }
                        className="w-full bg-transparent py-2 text-base sm:text-sm font-mono text-slate-900 outline-none"
                      />
                    </div>
                    {isEditUsernameTaken && (
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
                      value={editPayload.email}
                      onChange={e =>
                        setEditPayload(prev => ({ ...prev, email: e.target.value }))
                      }
                      className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-xl px-3.5 py-2 text-base sm:text-sm text-slate-900 outline-none"
                    />
                  </div>

                  {/* Assigned RC (for Course Officer) */}
                  {targetUser.role === UserRole.COURSE_OFFICER && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Assigned Regular Course
                      </label>
                      <select
                        value={editPayload.courseNumber}
                        onChange={e =>
                          setEditPayload(prev => ({ ...prev, courseNumber: e.target.value }))
                        }
                        className="w-full min-h-[44px] bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-600 rounded-xl px-3.5 py-2 text-base sm:text-sm font-semibold text-slate-900 outline-none"
                      >
                        {RC_OPTIONS.map(rc => (
                          <option key={rc} value={String(rc)}>
                            Regular Course {rc} (RC {rc})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Active / Suspended Toggle */}
                  <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <p className="text-xs font-bold text-slate-900">Account Active</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {isTargetSoleActiveAdmin
                          ? 'Protected: last active Admin'
                          : 'Suspended officers are signed out immediately'}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={editPayload.isActive}
                      disabled={isTargetSoleActiveAdmin}
                      onClick={() =>
                        setEditPayload(prev => ({ ...prev, isActive: !prev.isActive }))
                      }
                      className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-40 ${
                        editPayload.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md transition ${
                          editPayload.isActive ? 'translate-x-6' : 'translate-x-0'
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
                          type={showEditPassword ? 'text' : 'password'}
                          value={editPayload.password}
                          onChange={e =>
                            setEditPayload(prev => ({ ...prev, password: e.target.value }))
                          }
                          placeholder="Leave blank to keep current password"
                          className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-xl pl-3.5 pr-11 py-2 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowEditPassword(prev => !prev)}
                          aria-label={showEditPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-1 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg"
                        >
                          {showEditPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    {editPayload.password.trim().length > 0 && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          Reason for Password Reset
                        </label>
                        <input
                          type="text"
                          required
                          value={editPayload.auditReason}
                          onChange={e =>
                            setEditPayload(prev => ({ ...prev, auditReason: e.target.value }))
                          }
                          placeholder="e.g. Officer requested reset"
                          className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-xl px-3.5 py-2 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {isTargetSoleActiveAdmin && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2 text-xs text-amber-900">
                      <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                      <span>The sole active System Administrator cannot be suspended.</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSavingEdit || isEditUsernameTaken}
                    className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-bold shadow-sm transition-all"
                  >
                    {isSavingEdit ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    <span>{isSavingEdit ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </motion.form>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};
