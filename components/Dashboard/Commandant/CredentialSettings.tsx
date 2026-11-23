import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  UserPlus,
  ChevronRight,
  ShieldCheck,
  BadgeCheck,
  Eye,
  EyeOff,
  X,
  Loader2
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { dbService } from '../../../services/dbService';
import { User, UserRole } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { acquireScrollLock, releaseScrollLock } from '../../../utils/scrollLock';
import { OfficerProfileSheet } from './OfficerProfileSheet';
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

  // Selected Officer for Profile / Edit / Delete Sheet
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

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
    if (!isAddSheetOpen && !selectedUser) return;
    acquireScrollLock();
    return () => {
      releaseScrollLock();
    };
  }, [isAddSheetOpen, selectedUser]);

  const adminUsers = useMemo(
    () => users.filter(u => u.role === UserRole.ADMIN),
    [users]
  );

  const officerUsers = useMemo(
    () => users.filter(u => u.role !== UserRole.ADMIN),
    [users]
  );

  const activeCourseOfficersCount = useMemo(
    () => officerUsers.filter(u => u.role === UserRole.COURSE_OFFICER && u.isActive !== false).length,
    [officerUsers]
  );
  const isCapReached = activeCourseOfficersCount >= 5;

  const activeAdminCount = useMemo(
    () => adminUsers.filter(u => u.isActive !== false).length,
    [adminUsers]
  );

  const isAddUsernameTaken = useMemo(() => {
    const clean = addPayload.username.trim().toLowerCase();
    if (!clean) return false;
    return users.some(u => (u.username || '').trim().toLowerCase() === clean);
  }, [addPayload.username, users]);

  const filteredOfficers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/^@/, '');
    return officerUsers.filter(u => {
      if (roleFilter === 'course_officer' && u.role !== UserRole.COURSE_OFFICER) return false;
      if (roleFilter === 'commandant' && u.role !== UserRole.COMMANDANT) return false;
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
  }, [officerUsers, roleFilter, searchQuery]);

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

  const roleAvatarColor = (role: UserRole) => {
    if (role === UserRole.MEDICAL_OFFICER) return 'bg-rose-50 text-rose-700 border-rose-200';
    if (role === UserRole.COURSE_OFFICER) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-blue-50 text-blue-800 border-blue-200';
  };

  return (
    <div className="space-y-6">
      {/* ── SECTION 1: DEMARCATED SYSTEM ADMINISTRATOR (Google Account / Meta Accounts Center) ── */}
      {!isLoading && adminUsers.length > 0 && (
        <section aria-label="System Administrator" className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              System Administrator
            </h4>
            <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-full">
              Root Access
            </span>
          </div>

          <div className="rounded-2xl bg-slate-50/90 border border-slate-200 p-1.5 space-y-1.5">
            {adminUsers.map(admin => {
              const isSelf = currentUser ? String(currentUser.id) === String(admin.id) : false;
              const isActive = admin.isActive !== false;
              return (
                <button
                  key={admin.id}
                  type="button"
                  onClick={() => setSelectedUser(admin)}
                  className="w-full min-h-[68px] px-3.5 py-3 rounded-xl bg-white border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/50 active:scale-[0.995] flex items-center justify-between gap-3 text-left transition-all"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-full bg-slate-900 text-white flex items-center justify-center">
                        <ShieldCheck size={20} />
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-indigo-600 text-white border-2 border-white flex items-center justify-center">
                        <BadgeCheck size={10} />
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {admin.fullName || admin.username}
                        </p>
                        {isSelf && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                            You
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        @{admin.username} • {admin.designation || 'System Administrator'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        isActive
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      {isActive ? 'Protected' : 'Suspended'}
                    </span>
                    <ChevronRight size={16} className="text-slate-400" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── SECTION 2: ACADEMY OFFICERS DIRECTORY ── */}
      <section aria-label="Academy Officers" className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Academy Officers
          </h4>
          <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
            {officerUsers.length} {officerUsers.length === 1 ? 'officer' : 'officers'}
          </span>
        </div>

        {/* Search + Add Officer Toolbar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1 flex items-center">
              <Search size={16} className="absolute left-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search officers by name, @handle, or RC..."
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
              className="min-h-[44px] px-4 py-2 rounded-full bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-colors"
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
                { key: 'commandant', label: 'Senior Officers' },
                { key: 'medical_officer', label: 'Medical' }
              ] as const
            ).map(pill => {
              const isActive = roleFilter === pill.key;
              return (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setRoleFilter(pill.key)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 tabular-nums ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Grouped Officer Roster List */}
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 py-2 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-36 bg-slate-200 rounded" />
                  <div className="h-3 w-48 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredOfficers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
            <p className="text-sm font-bold text-slate-800">No officers found</p>
            <p className="text-xs text-slate-500">
              Try a different search term or tap Add Officer to create an account.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
            {filteredOfficers.map(u => {
              const isActive = u.isActive !== false;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelectedUser(u)}
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
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
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
      </section>

      {/* ── Unified Officer Profile / Edit / Delete Sheet ── */}
      <OfficerProfileSheet
        user={selectedUser}
        allUsers={users}
        currentUser={currentUser}
        activeAdminCount={activeAdminCount}
        onClose={() => setSelectedUser(null)}
        onSuccess={fetchUsers}
      />

      {/* ── Add Officer Bottom Sheet ── */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isAddSheetOpen && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Add Officer"
                data-drawer-open="true"
                className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => !isAdding && setIsAddSheetOpen(false)}
                  className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs"
                />

                <motion.form
                  onSubmit={handleAddOfficer}
                  autoComplete="off"
                  initial={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.95 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.95 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0.12 }
                      : { type: 'spring', stiffness: 380, damping: 34 }
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

                  {/* Role Assignment */}
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
                                ? 'bg-slate-900 text-white border-slate-900'
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

                  {/* Full Name */}
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

                  {/* Username (@handle) */}
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

                  {/* Email Address */}
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

                  {/* Password */}
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
    </div>
  );
};
