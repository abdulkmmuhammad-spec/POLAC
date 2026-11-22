import React, { useState, useMemo, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Search,
  X,
  ChevronRight,
  ArrowLeft,
  Sliders,
  Users,
  RefreshCw,
  FileSearch,
  BellRing,
  AlertTriangle,
  Clock,
  RotateCcw,
  Check,
  Loader2
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../../../context/AuthContext';
import { useParade } from '../../../context/ParadeContext';
import { dbService } from '../../../services/dbService';
import { UserRole } from '../../../types';
import { PushNotificationManager } from '../../PushNotificationManager';
import { CredentialSettings } from './CredentialSettings';
import { CourseLifecycleView } from './CourseLifecycleView';
import { AuditLogView } from '../../Settings/AuditLogView';
import { HistoricalAlertsView } from '../../Settings/HistoricalAlertsView';
import { toast } from 'react-hot-toast';

export type SettingsCategoryId = 'general' | 'credentials' | 'lifecycle' | 'audit' | 'alerts';

interface CategoryDefinition {
  id: SettingsCategoryId;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconBg: string;
  keywords: string[];
}

const CATEGORIES: CategoryDefinition[] = [
  {
    id: 'general',
    title: 'General & Windows',
    subtitle: 'Push alerts, active RC, and parade reporting hours',
    icon: Sliders,
    iconBg: 'bg-blue-50 text-blue-700',
    keywords: ['general', 'rc', 'course', 'active', 'muster', 'tattoo', 'hour', 'window', 'time', 'push', 'notification', 'alert']
  },
  {
    id: 'credentials',
    title: 'Users & Access',
    subtitle: 'Add officers, roles, passwords, and account status',
    icon: Users,
    iconBg: 'bg-indigo-50 text-indigo-700',
    keywords: ['user', 'access', 'officer', 'commandant', 'dfs', 'medical', 'doctor', 'password', 'reset', 'suspend', 'role', 'credential', 'commission']
  },
  {
    id: 'lifecycle',
    title: 'Course Lifecycle',
    subtitle: 'Graduation, handover wizard, course purge, and full data wipe',
    icon: RefreshCw,
    iconBg: 'bg-amber-50 text-amber-700',
    keywords: ['lifecycle', 'graduate', 'graduation', 'handover', 'purge', 'delete', 'backup', 'csv', 're-enroll', 'seed', 'intake', 'wipe', 'reset', 'factory', 'erase']
  },
  {
    id: 'audit',
    title: 'Audit Logs',
    subtitle: 'Read-only trail of admin and command actions',
    icon: FileSearch,
    iconBg: 'bg-emerald-50 text-emerald-700',
    keywords: ['audit', 'log', 'forensic', 'trail', 'history', 'export', 'csv', 'json', 'event']
  },
  {
    id: 'alerts',
    title: 'Alert History',
    subtitle: 'Past system notifications and cadet alert records',
    icon: BellRing,
    iconBg: 'bg-rose-50 text-rose-700',
    keywords: ['alert', 'history', 'notification', 'record', 'cadet', 'warning']
  }
];

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);

const formatHour24 = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

export const SystemSettingsCenter: React.FC = () => {
  const { currentUser } = useAuth();
  const { activeRC, submissionSettings, updateSubmissionSetting, refreshActiveRC, refreshData } = useParade();
  const shouldReduceMotion = useReducedMotion();

  // Strict Admin Access Guard
  if (currentUser && currentUser.role !== UserRole.ADMIN) {
    return <Navigate to="/" replace />;
  }

  // Desktop/Tablet always has a category selected; Mobile starts at null (Grouped Index)
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>('general');
  const [mobileSubpage, setMobileSubpage] = useState<SettingsCategoryId | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Live preview metadata for category rows
  const [activeUsersCount, setActiveUsersCount] = useState<number | null>(null);

  useEffect(() => {
    dbService
      .getAllUsers()
      .then(users => {
        const activeCount = users.filter(u => u.isActive !== false).length;
        setActiveUsersCount(activeCount);
      })
      .catch(() => {});
  }, []);

  // General & Windows Draft State (for unified Sticky Save Changes Bar)
  const [draftRC, setDraftRC] = useState<number>(activeRC);
  const [draftMusterStart, setDraftMusterStart] = useState<number>(submissionSettings.musterStartHour);
  const [draftMusterEnd, setDraftMusterEnd] = useState<number>(submissionSettings.musterEndHour);
  const [draftTattooStart, setDraftTattooStart] = useState<number>(submissionSettings.tattooStartHour);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);

  // Sync draft state when context values load/update
  useEffect(() => {
    setDraftRC(activeRC);
  }, [activeRC]);

  useEffect(() => {
    setDraftMusterStart(submissionSettings.musterStartHour);
    setDraftMusterEnd(submissionSettings.musterEndHour);
    setDraftTattooStart(submissionSettings.tattooStartHour);
  }, [
    submissionSettings.musterStartHour,
    submissionSettings.musterEndHour,
    submissionSettings.tattooStartHour
  ]);

  const hasUnsavedGeneralChanges =
    draftRC !== activeRC ||
    draftMusterStart !== submissionSettings.musterStartHour ||
    draftMusterEnd !== submissionSettings.musterEndHour ||
    draftTattooStart !== submissionSettings.tattooStartHour;

  const isMusterWindowInvalid = draftMusterStart >= draftMusterEnd;

  const handleResetGeneral = () => {
    setDraftRC(activeRC);
    setDraftMusterStart(submissionSettings.musterStartHour);
    setDraftMusterEnd(submissionSettings.musterEndHour);
    setDraftTattooStart(submissionSettings.tattooStartHour);
  };

  const handleSaveGeneral = async () => {
    if (draftRC < 1) {
      toast.error('Active Course (RC) must be 1 or greater.');
      return;
    }
    if (isMusterWindowInvalid) {
      toast.error('Muster start time must be earlier than Muster end time.');
      return;
    }

    setIsSavingGeneral(true);
    try {
      const changes: string[] = [];

      if (draftRC !== activeRC) {
        const oldRC = activeRC;
        await dbService.setActiveRC(draftRC);
        await refreshActiveRC();
        changes.push(`Active RC changed from RC ${oldRC} to RC ${draftRC}`);
      }

      if (draftMusterStart !== submissionSettings.musterStartHour) {
        await updateSubmissionSetting('muster_start_hour', draftMusterStart);
        changes.push(`Muster start set to ${formatHour24(draftMusterStart)}`);
      }
      if (draftMusterEnd !== submissionSettings.musterEndHour) {
        await updateSubmissionSetting('muster_end_hour', draftMusterEnd);
        changes.push(`Muster end set to ${formatHour24(draftMusterEnd)}`);
      }
      if (draftTattooStart !== submissionSettings.tattooStartHour) {
        await updateSubmissionSetting('tattoo_start_hour', draftTattooStart);
        changes.push(`Tattoo start set to ${formatHour24(draftTattooStart)}`);
      }

      if (changes.length > 0) {
        try {
          await dbService.addNotification({
            type: 'settings_change',
            title: 'System Settings Updated',
            content: changes.join(' • '),
            timestamp: new Date().toISOString(),
            read: false,
            officerName: currentUser?.fullName || 'System Administrator',
            yearGroup: 1,
            courseNumber: 0
          });
        } catch {
          // Non-blocking audit notification
        }
      }

      toast.success('Settings saved');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save settings.');
    } finally {
      setIsSavingGeneral(false);
    }
  };

  // Search filtering across all 5 categories
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return CATEGORIES.filter(
      cat =>
        cat.title.toLowerCase().includes(q) ||
        cat.subtitle.toLowerCase().includes(q) ||
        cat.keywords.some(kw => kw.includes(q))
    );
  }, [searchQuery]);

  const getCategoryPreview = (id: SettingsCategoryId): string => {
    switch (id) {
      case 'general':
        return `RC ${activeRC} • ${formatHour24(submissionSettings.musterStartHour)}–${formatHour24(submissionSettings.musterEndHour)}`;
      case 'credentials':
        return activeUsersCount !== null ? `${activeUsersCount} Active` : 'Roster';
      case 'lifecycle':
        return `RC ${activeRC}`;
      case 'audit':
        return 'Ledger';
      case 'alerts':
        return 'History';
    }
  };

  const handleSelectCategory = (id: SettingsCategoryId) => {
    setActiveCategory(id);
    setMobileSubpage(id);
    setSearchQuery('');
  };

  // Visual 24h timeline bar percentages
  const musterLeftPct = (draftMusterStart / 24) * 100;
  const musterWidthPct = Math.max(0, ((draftMusterEnd - draftMusterStart) / 24) * 100);
  const tattooLeftPct = (draftTattooStart / 24) * 100;
  const tattooWidthPct = Math.max(4, ((24 - draftTattooStart) / 24) * 100);

  const renderCategoryContent = (catId: SettingsCategoryId) => {
    if (catId === 'general') {
      return (
        <div className="space-y-5">
          <PushNotificationManager />

          {/* Active Course (RC) Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Active Course (RC)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Sets the Year 1 intake reference used to calculate year levels across the academy.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Current Year 1 Course Number
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={draftRC || ''}
                    onChange={e => setDraftRC(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-28 min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-600 rounded-xl font-mono text-base font-bold text-slate-900 outline-none transition-all"
                  />
                  <span className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-800 border border-blue-100 text-xs font-semibold">
                    RC {draftRC} = Year 1
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 leading-relaxed">
                Changing the Active Course immediately updates year levels (Year 1–5) for all cadets, reports, and dashboards academy-wide.
              </p>
            </div>
          </div>

          {/* Parade Reporting Hours Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Parade Reporting Hours</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Control when Course Officers can submit Muster and Tattoo parade states.
                </p>
              </div>
              <Clock size={18} className="text-slate-400 shrink-0 mt-1" />
            </div>

            {/* 24H Time Pickers */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Muster Start
                </label>
                <select
                  value={draftMusterStart}
                  onChange={e => setDraftMusterStart(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-600 rounded-xl font-mono text-sm font-bold text-slate-900 outline-none"
                >
                  {HOURS_24.map(h => (
                    <option key={h} value={h}>
                      {formatHour24(h)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Muster End
                </label>
                <select
                  value={draftMusterEnd}
                  onChange={e => setDraftMusterEnd(Number(e.target.value))}
                  className={`w-full min-h-[44px] px-3 py-2 bg-slate-50 border focus:bg-white rounded-xl font-mono text-sm font-bold text-slate-900 outline-none ${
                    isMusterWindowInvalid
                      ? 'border-rose-400 focus:border-rose-500 bg-rose-50/50'
                      : 'border-slate-200 focus:border-blue-600'
                  }`}
                >
                  {HOURS_24.map(h => (
                    <option key={h} value={h}>
                      {formatHour24(h)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tattoo Start (Open End)
                </label>
                <select
                  value={draftTattooStart}
                  onChange={e => setDraftTattooStart(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-600 rounded-xl font-mono text-sm font-bold text-slate-900 outline-none"
                >
                  {HOURS_24.map(h => (
                    <option key={h} value={h}>
                      {formatHour24(h)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isMusterWindowInvalid && (
              <p className="text-xs font-semibold text-rose-600">
                Muster start time must be earlier than Muster end time.
              </p>
            )}

            {/* Visual 24-Hour Timeline Bar */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                <span>24-Hour Schedule Preview</span>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    Muster ({formatHour24(draftMusterStart)}–{formatHour24(draftMusterEnd)})
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    Tattoo ({formatHour24(draftTattooStart)}+)
                  </span>
                </div>
              </div>
              <div className="relative h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                {!isMusterWindowInvalid && (
                  <div
                    style={{ left: `${musterLeftPct}%`, width: `${musterWidthPct}%` }}
                    className="absolute top-0 bottom-0 bg-blue-600 rounded-full transition-all duration-200"
                  />
                )}
                <div
                  style={{ left: `${tattooLeftPct}%`, width: `${tattooWidthPct}%` }}
                  className="absolute top-0 bottom-0 bg-indigo-500 rounded-full transition-all duration-200"
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>23:59</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (catId === 'credentials') {
      return <CredentialSettings />;
    }

    if (catId === 'lifecycle') {
      return (
        <CourseLifecycleView
          activeRC={activeRC}
          onDataChanged={() => {
            refreshData();
            window.dispatchEvent(new Event('cadet-registry-updated'));
          }}
          onWipeComplete={() => {
            if (typeof window !== 'undefined') {
              try {
                Object.keys(localStorage)
                  .filter(key => key.startsWith('polac_swr_'))
                  .forEach(key => localStorage.removeItem(key));
              } catch {
                // ignore storage errors
              }
            }
            setActiveUsersCount(1);
            refreshData();
            window.dispatchEvent(new Event('cadet-registry-updated'));
          }}
        />
      );
    }

    if (catId === 'audit') {
      return <AuditLogView />;
    }

    return <HistoricalAlertsView />;
  };

  const activeCategoryMeta = CATEGORIES.find(c => c.id === activeCategory) || CATEGORIES[0];
  const mobileCategoryMeta = mobileSubpage
    ? CATEGORIES.find(c => c.id === mobileSubpage)
    : null;

  return (
    <div className="max-w-6xl mx-auto pb-28 md:pb-8 space-y-5">
      {/* ── Top Instant Settings Search (Google / iOS Settings Style) ── */}
      {!mobileSubpage && (
        <div className="relative">
          <Search
            size={17}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search settings..."
            className="w-full min-h-[46px] pl-11 pr-10 py-2.5 bg-white border border-slate-200 focus:border-blue-600 rounded-2xl text-sm text-slate-900 placeholder:text-slate-400 shadow-2xs outline-none transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear settings search"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}

      {/* ── Instant Search Results Dropdown / Panel ── */}
      {searchQuery.trim() !== '' && !mobileSubpage && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden divide-y divide-slate-100">
          {searchResults.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No settings match "{searchQuery.trim()}".
            </div>
          ) : (
            searchResults.map(cat => {
              const IconComp = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelectCategory(cat.id)}
                  className="w-full min-h-[56px] px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 text-left transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cat.iconBg}`}>
                      <IconComp size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{cat.title}</p>
                      <p className="text-xs text-slate-500 truncate">{cat.subtitle}</p>
                    </div>
                  </div>
                  <ChevronRight size={17} className="text-slate-400 shrink-0" />
                </button>
              );
            })
          )}
        </div>
      )}

      {/* ── MOBILE (< 640px): Grouped Index ↔ Slide-In Sub-Page ── */}
      <div className="sm:hidden">
        <AnimatePresence mode="wait" initial={false}>
          {!mobileSubpage ? (
            searchQuery.trim() === '' && (
              <motion.div
                key="mobile-index"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.18 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden divide-y divide-slate-100"
              >
                {CATEGORIES.map(cat => {
                  const IconComp = cat.icon;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelectCategory(cat.id)}
                      className="w-full min-h-[58px] px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 active:bg-slate-100 text-left transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cat.iconBg}`}>
                          <IconComp size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{cat.title}</p>
                          <p className="text-xs text-slate-500 truncate">{cat.subtitle}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-medium text-slate-400">
                          {getCategoryPreview(cat.id)}
                        </span>
                        <ChevronRight size={16} className="text-slate-400" />
                      </div>
                    </button>
                  );
                })}
              </motion.div>
            )
          ) : (
            <motion.div
              key={`mobile-subpage-${mobileSubpage}`}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 28 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0.12 }
                  : { type: 'spring', stiffness: 340, damping: 32 }
              }
              drag={shouldReduceMotion ? false : 'x'}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0, right: 0.35 }}
              onDragEnd={(_, info) => {
                if (info.offset.x > 100 || info.velocity.x > 450) {
                  setMobileSubpage(null);
                }
              }}
              className="space-y-4"
            >
              {/* Sticky Mobile Sub-Page Header */}
              <div className="sticky top-0 z-20 -mx-4 px-4 py-2.5 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/80 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setMobileSubpage(null)}
                  className="min-h-[44px] px-2 -ml-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-900"
                >
                  <ArrowLeft size={18} />
                  <span>Settings</span>
                </button>
                <span className="text-slate-300">/</span>
                <h2 className="text-sm font-bold text-slate-900 truncate">
                  {mobileCategoryMeta?.title}
                </h2>
              </div>

              {renderCategoryContent(mobileSubpage)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── TABLET (640px–1023px): Horizontal Pill Tabs ── */}
      <div className="hidden sm:block lg:hidden space-y-5">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {CATEGORIES.map(cat => {
            const IconComp = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`min-h-[44px] px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap inline-flex items-center gap-2 transition-all shrink-0 border ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <IconComp size={15} />
                <span>{cat.title}</span>
              </button>
            );
          })}
        </div>

        <div className="max-w-3xl">{renderCategoryContent(activeCategory)}</div>
      </div>

      {/* ── DESKTOP (>= 1024px): Fixed Left Rail (w-64) + Right Content (max-w-3xl) ── */}
      <div className="hidden lg:flex items-start gap-8">
        <aside className="w-64 shrink-0 sticky top-4 space-y-1.5">
          {CATEGORIES.map(cat => {
            const IconComp = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-2.5 text-left transition-all ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200 font-bold'
                    : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 border border-transparent font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cat.iconBg}`}>
                    <IconComp size={16} />
                  </div>
                  <span className="text-sm truncate">{cat.title}</span>
                </div>
                <span className="text-[11px] font-medium text-slate-400 shrink-0">
                  {getCategoryPreview(cat.id)}
                </span>
              </button>
            );
          })}
        </aside>

        <div className="flex-1 max-w-3xl min-w-0 space-y-4">
          <div className="pb-1">
            <h2 className="text-lg font-bold text-slate-900">{activeCategoryMeta.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{activeCategoryMeta.subtitle}</p>
          </div>
          {renderCategoryContent(activeCategory)}
        </div>
      </div>

      {/* ── Sleek Sticky Unsaved Changes Bar (General & Windows only) ── */}
      <AnimatePresence>
        {hasUnsavedGeneralChanges && (activeCategory === 'general' || mobileSubpage === 'general') && (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-6 inset-x-3 sm:inset-x-auto sm:right-8 sm:left-auto z-30 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700/80 px-4 py-3 flex items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-white">Unsaved changes</p>
              <p className="text-[11px] text-slate-400 truncate">
                General & Reporting Windows
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleResetGeneral}
                disabled={isSavingGeneral}
                className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 inline-flex items-center gap-1 transition-colors"
              >
                <RotateCcw size={13} />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={handleSaveGeneral}
                disabled={isSavingGeneral || isMusterWindowInvalid}
                className="min-h-[40px] px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors"
              >
                {isSavingGeneral ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                <span>{isSavingGeneral ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

