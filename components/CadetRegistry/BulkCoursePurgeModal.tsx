import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ArrowLeft,
  Download,
  Check,
  AlertTriangle,
  History,
  RotateCcw,
  Upload,
  Trash2,
  Loader2
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { dbService } from '../../services/dbService';
import {
  parseCadetImportFile,
  downloadNPACSVTemplate,
  downloadNPAExcelTemplate,
  buildCoursePurgeConfirmationPhrase,
  downloadCourseBackupCSV
} from '../../services/cadetImportService';
import {
  CourseImpactSummary,
  CourseImpactBreakdownItem,
  CoursePurgeMode,
  CoursePurgeSnapshot,
  BulkCoursePurgeResult,
  CadetImportParseResult
} from '../../types';
import { calculateCurrentLevel } from '../../utils/rcHelpers';
import { useAuth } from '../../context/AuthContext';

interface BulkCoursePurgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRC: number;
  initialSelectedRC?: number;
  onPurgeAndSeedComplete: () => void;
}

type ModalView = 'SELECT' | 'CONFIRM' | 'RE_ENROLL' | 'RESTORE';

export const BulkCoursePurgeModal: React.FC<BulkCoursePurgeModalProps> = ({
  isOpen,
  onClose,
  activeRC,
  initialSelectedRC,
  onPurgeAndSeedComplete
}) => {
  const { currentUser } = useAuth();
  const shouldReduceMotion = useReducedMotion();

  const [view, setView] = useState<ModalView>('SELECT');

  // Step 1: Course Selection & Impact
  const [availableCourses, setAvailableCourses] = useState<CourseImpactBreakdownItem[]>([]);
  const [selectedRCs, setSelectedRCs] = useState<number[]>(
    initialSelectedRC && initialSelectedRC > 0 ? [initialSelectedRC] : [10]
  );
  const [impactSummary, setImpactSummary] = useState<CourseImpactSummary>({
    totalCadets: 0,
    activeCadets: 0,
    paradeRecordsCount: 0,
    attendanceLogsCount: 0,
    disciplinaryLogsCount: 0,
    assignedOfficersCount: 0,
    pushSubscriptionsCount: 0,
    courseBreakdown: []
  });
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isLoadingImpact, setIsLoadingImpact] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [hasExportedBackup, setHasExportedBackup] = useState(false);
  const [lastBackupFilename, setLastBackupFilename] = useState<string | null>(null);

  // Restore Snapshots
  const [snapshots, setSnapshots] = useState<CoursePurgeSnapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [restoringSnapshotId, setRestoringSnapshotId] = useState<string | null>(null);

  // Step 2: Confirm Removal
  const [purgeMode, setPurgeMode] = useState<CoursePurgeMode>('SOFT_DELETE');
  const [purgeAttendance, setPurgeAttendance] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [typedPhrase, setTypedPhrase] = useState('');
  const [isExecutingPurge, setIsExecutingPurge] = useState(false);

  // Step 3: Optional Re-Enrollment
  const [purgeResult, setPurgeResult] = useState<BulkCoursePurgeResult | null>(null);
  const [seedFileName, setSeedFileName] = useState<string | null>(null);
  const [isParsingSeed, setIsParsingSeed] = useState(false);
  const [isCommittingSeed, setIsCommittingSeed] = useState(false);
  const [seedParseResult, setSeedParseResult] = useState<CadetImportParseResult | null>(null);
  const seedFileInputRef = useRef<HTMLInputElement>(null);

  const requiredPhrase = useMemo(
    () => buildCoursePurgeConfirmationPhrase(selectedRCs),
    [selectedRCs]
  );

  const isPhraseMatched = useMemo(
    () => typedPhrase.trim().toUpperCase() === requiredPhrase.toUpperCase(),
    [typedPhrase, requiredPhrase]
  );

  const canExecutePurge =
    selectedRCs.length > 0 && acknowledged && isPhraseMatched && !isExecutingPurge;

  const isBusy = isExecutingPurge || isCommittingSeed || isExportingBackup || !!restoringSnapshotId;

  useEffect(() => {
    if (!isOpen) return;
    setView('SELECT');
    setPurgeResult(null);
    setSeedFileName(null);
    setSeedParseResult(null);
    loadAvailableCourses();
    loadSnapshots();
  }, [isOpen, activeRC]);

  useEffect(() => {
    if (isOpen && initialSelectedRC && initialSelectedRC > 0) {
      setSelectedRCs([initialSelectedRC]);
    }
  }, [isOpen, initialSelectedRC]);

  useEffect(() => {
    if (!isOpen) return;
    fetchImpactSummary(selectedRCs);
    setHasExportedBackup(false);
    setLastBackupFilename(null);
    setAcknowledged(false);
    setTypedPhrase('');
  }, [selectedRCs, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, isBusy, onClose]);

  const loadAvailableCourses = async () => {
    setIsLoadingCourses(true);
    try {
      const summary = await dbService.getAvailableCoursesSummary(activeRC);
      setAvailableCourses(summary);
    } catch {
      // ignore
    } finally {
      setIsLoadingCourses(false);
    }
  };

  const loadSnapshots = async () => {
    setIsLoadingSnapshots(true);
    try {
      const list = await dbService.getCoursePurgeSnapshots();
      setSnapshots(list);
    } catch {
      // ignore
    } finally {
      setIsLoadingSnapshots(false);
    }
  };

  const fetchImpactSummary = async (rcs: number[]) => {
    if (!rcs || rcs.length === 0) {
      setImpactSummary({
        totalCadets: 0,
        activeCadets: 0,
        paradeRecordsCount: 0,
        attendanceLogsCount: 0,
        disciplinaryLogsCount: 0,
        assignedOfficersCount: 0,
        pushSubscriptionsCount: 0,
        courseBreakdown: []
      });
      return;
    }
    setIsLoadingImpact(true);
    try {
      const impact = await dbService.getCoursesImpactSummary(rcs);
      setImpactSummary(impact);
    } catch {
      // ignore
    } finally {
      setIsLoadingImpact(false);
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const toggleCourse = (rc: number) => {
    setSelectedRCs(prev =>
      prev.includes(rc) ? prev.filter(item => item !== rc) : [...prev, rc].sort((a, b) => a - b)
    );
  };

  const handleExportBackup = async () => {
    if (selectedRCs.length === 0) return;
    setIsExportingBackup(true);
    try {
      const cadets = await dbService.getCadetsByCourses(selectedRCs);
      const filename = downloadCourseBackupCSV(cadets, selectedRCs);
      setHasExportedBackup(true);
      setLastBackupFilename(filename);
      toast.success(`Backup saved (${cadets.length.toLocaleString()} cadets)`);
    } catch (err: any) {
      toast.error(err?.message || 'Backup download failed.');
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleContinueToConfirm = () => {
    if (selectedRCs.length === 0) {
      toast.error('Select at least one Regular Course.');
      return;
    }
    if (impactSummary.totalCadets > 0 && !hasExportedBackup) {
      toast.error('Please download a CSV backup before continuing.');
      return;
    }
    setView('CONFIRM');
  };

  const handleExecutePurge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canExecutePurge) return;

    const actorId = currentUser?.id ? String(currentUser.id) : '';
    const actorName = currentUser?.fullName || currentUser?.username || 'COMMANDANT';
    if (!actorId) {
      toast.error('Missing administrator session.');
      return;
    }

    setIsExecutingPurge(true);
    try {
      const result = await dbService.executeBulkCoursePurge({
        courseNumbers: selectedRCs,
        actorId,
        actorName,
        purgeMode,
        purgeAttendance,
        confirmationPhrase: requiredPhrase
      });

      setPurgeResult(result);
      toast.success(`Removed ${result.purgedCadetCount.toLocaleString()} cadets`);
      onPurgeAndSeedComplete();
      await loadAvailableCourses();
      await loadSnapshots();
      setView('RE_ENROLL');
    } catch (err: any) {
      toast.error(err?.message || 'Could not remove course records.');
    } finally {
      setIsExecutingPurge(false);
    }
  };

  const handleRestoreSnapshot = async (snapshot: CoursePurgeSnapshot) => {
    const actorId = currentUser?.id ? String(currentUser.id) : '';
    const actorName = currentUser?.fullName || currentUser?.username || 'COMMANDANT';
    if (!actorId) return;

    setRestoringSnapshotId(snapshot.id);
    try {
      const res = await dbService.restoreCoursePurgeSnapshot(snapshot.id, actorId, actorName);
      toast.success(`Restored ${res.restoredCadetCount.toLocaleString()} cadets`);
      onPurgeAndSeedComplete();
      await loadAvailableCourses();
      await loadSnapshots();
      await fetchImpactSummary(selectedRCs);
      setView('SELECT');
    } catch (err: any) {
      toast.error(err?.message || 'Restore failed.');
    } finally {
      setRestoringSnapshotId(null);
    }
  };

  const handleSeedFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSeedFileName(file.name);
    setIsParsingSeed(true);
    try {
      const res = await parseCadetImportFile(file, { activeRC, formatMode: 'AUTO' });
      setSeedParseResult(res);
    } catch (err: any) {
      toast.error(err?.message || 'Could not read spreadsheet.');
    } finally {
      setIsParsingSeed(false);
      e.target.value = '';
    }
  };

  const handleCommitReEnrollment = async () => {
    if (!seedParseResult || seedParseResult.validRows.length === 0) return;

    setIsCommittingSeed(true);
    try {
      const payloadMap = new Map<string, any>();
      for (const row of seedParseResult.validRows) {
        const key = row.npa_number
          ? `NPA:${row.npa_number.trim().toUpperCase()}`
          : `LEG:${row.name.trim().toUpperCase()}|${row.course_number}|${row.rowNumber}`;

        payloadMap.set(key, {
          name: row.name,
          squad: row.squad,
          course_number: row.course_number,
          year_group: row.year_group ?? calculateCurrentLevel(row.course_number, activeRC),
          npa_number: row.npa_number || undefined,
          admission_year: row.admission_year || undefined,
          status: 'ACTIVE'
        });
      }

      const payload = Array.from(payloadMap.values());
      const actorId = currentUser?.id ? String(currentUser.id) : undefined;
      await dbService.bulkAddCadetsToRegistry(payload, actorId);

      toast.success(`Enrolled ${payload.length.toLocaleString()} cadets`);
      onPurgeAndSeedComplete();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to enroll cadets.');
    } finally {
      setIsCommittingSeed(false);
    }
  };

  const springTransition = shouldReduceMotion
    ? { duration: 0.12 }
    : { type: 'spring' as const, stiffness: 380, damping: 34 };

  const selectedLabel = selectedRCs.map(rc => `RC ${rc}`).join(', ') || 'None';
  const needsBackup = impactSummary.totalCadets > 0 && !hasExportedBackup;

  return createPortal(
    <AnimatePresence>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Course Purge and Re-Enrollment"
        data-drawer-open="true"
        className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => !isBusy && onClose()}
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
        />

        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.96 }}
          animate={{ y: 0, opacity: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.96 }}
          transition={springTransition}
          className="relative z-10 w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 max-h-[88dvh] flex flex-col overflow-hidden"
        >
          {/* Mobile Grabber */}
          <div className="pt-2.5 pb-1 sm:hidden flex justify-center shrink-0">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>

          {/* Clean Sheet Header */}
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {(view === 'CONFIRM' || view === 'RESTORE') && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setView('SELECT')}
                  className="min-w-[40px] min-h-[40px] -ml-2 px-2 inline-flex items-center gap-1 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-semibold transition-colors"
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
              )}
              <h3 className="text-base font-bold text-slate-900 truncate">
                {view === 'SELECT'
                  ? 'Remove & Replace Course'
                  : view === 'CONFIRM'
                  ? `Confirm Removal (${selectedLabel})`
                  : view === 'RE_ENROLL'
                  ? 'Re-Enroll Cadets'
                  : 'Restore Removed Course'}
              </h3>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {view === 'SELECT' && snapshots.length > 0 && (
                <button
                  type="button"
                  onClick={() => setView('RESTORE')}
                  className="min-h-[36px] px-3 rounded-full bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <History size={14} />
                  <span>Restore ({snapshots.length})</span>
                </button>
              )}
              <button
                type="button"
                disabled={isBusy}
                onClick={onClose}
                aria-label="Close"
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto">
            <AnimatePresence mode="wait" initial={false}>
              {/* ── STEP 1: SELECT COURSES & BACKUP ── */}
              {view === 'SELECT' && (
                <motion.div
                  key="select"
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                  transition={{ duration: 0.16 }}
                  className="space-y-5"
                >
                  {/* Course Pills */}
                  <div className="space-y-2.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Select Regular Courses to Remove
                    </label>
                    {isLoadingCourses ? (
                      <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                        <Loader2 size={14} className="animate-spin" />
                        <span>Loading courses...</span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {availableCourses.map(course => {
                          const isSelected = selectedRCs.includes(course.courseNumber);
                          return (
                            <button
                              key={course.courseNumber}
                              type="button"
                              onClick={() => toggleCourse(course.courseNumber)}
                              className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all tabular-nums ${
                                isSelected
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              RC {course.courseNumber}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Clean 3-Stat Impact Summary */}
                  <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 space-y-2">
                    <p className="text-xs font-semibold text-slate-700">
                      What will be affected ({selectedLabel})
                    </p>
                    {isLoadingImpact ? (
                      <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
                        <Loader2 size={14} className="animate-spin" />
                        <span>Checking records...</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-3 pt-1">
                        <div>
                          <p className="text-lg font-bold text-slate-900 tabular-nums">
                            {impactSummary.totalCadets.toLocaleString()}
                          </p>
                          <p className="text-[11px] text-slate-500">Cadets</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-slate-900 tabular-nums">
                            {impactSummary.paradeRecordsCount.toLocaleString()}
                          </p>
                          <p className="text-[11px] text-slate-500">Parade logs</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-slate-900 tabular-nums">
                            {impactSummary.assignedOfficersCount.toLocaleString()}
                          </p>
                          <p className="text-[11px] text-slate-500">Officers</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Mandatory CSV Backup */}
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={selectedRCs.length === 0 || isExportingBackup}
                      onClick={handleExportBackup}
                      className={`w-full min-h-[46px] px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                        hasExportedBackup
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      {isExportingBackup ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : hasExportedBackup ? (
                        <Check size={15} />
                      ) : (
                        <Download size={15} />
                      )}
                      <span>
                        {hasExportedBackup
                          ? `Backup Saved (${lastBackupFilename})`
                          : 'Download CSV Backup Before Removing'}
                      </span>
                    </button>
                    {needsBackup && (
                      <p className="text-[11px] text-slate-500 text-center">
                        A backup download is required before you can remove cadets.
                      </p>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 min-h-[46px] rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-sm font-semibold transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={selectedRCs.length === 0 || needsBackup}
                      onClick={handleContinueToConfirm}
                      className="flex-1 min-h-[46px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-bold transition-colors"
                    >
                      Continue
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── STEP 2: CONFIRM REMOVAL ── */}
              {view === 'CONFIRM' && (
                <motion.form
                  key="confirm"
                  onSubmit={handleExecutePurge}
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
                  transition={{ duration: 0.16 }}
                  className="space-y-4"
                >
                  {/* Simple Removal Mode Choice */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Removal Option
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPurgeMode('SOFT_DELETE')}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          purgeMode === 'SOFT_DELETE'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <p className="text-xs font-bold">Keep Restore Copy</p>
                        <p
                          className={`text-[11px] mt-0.5 ${
                            purgeMode === 'SOFT_DELETE' ? 'text-slate-300' : 'text-slate-500'
                          }`}
                        >
                          Recommended • Can undo later
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPurgeMode('HARD_DELETE')}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          purgeMode === 'HARD_DELETE'
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <p className="text-xs font-bold">Delete Permanently</p>
                        <p
                          className={`text-[11px] mt-0.5 ${
                            purgeMode === 'HARD_DELETE' ? 'text-rose-100' : 'text-slate-500'
                          }`}
                        >
                          Cannot be restored
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Optional Parade History Toggle */}
                  <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={purgeAttendance}
                      onChange={e => setPurgeAttendance(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-slate-900 shrink-0"
                    />
                    <span className="text-xs text-slate-700 leading-relaxed">
                      Also delete past parade attendance records for {selectedLabel}
                    </span>
                  </label>

                  {/* Acknowledgment */}
                  <label className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-50/70 border border-rose-200/80 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={e => setAcknowledged(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-rose-300 text-rose-600 shrink-0"
                    />
                    <span className="text-xs text-rose-900 leading-relaxed font-medium">
                      I have saved a backup and want to remove {impactSummary.totalCadets.toLocaleString()} cadets from {selectedLabel}.
                    </span>
                  </label>

                  {/* Typed Phrase */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-semibold text-slate-700">
                        Type <span className="font-mono font-bold text-slate-900">{requiredPhrase}</span>
                      </label>
                      {isPhraseMatched && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <Check size={12} /> Matched
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={typedPhrase}
                      onChange={e => setTypedPhrase(e.target.value)}
                      placeholder={requiredPhrase}
                      className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-rose-500 rounded-xl px-3.5 py-2 text-base sm:text-sm font-mono text-slate-900 placeholder:text-slate-400 outline-none"
                    />
                  </div>

                  {/* Footer */}
                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={isExecutingPurge}
                      onClick={() => setView('SELECT')}
                      className="flex-1 min-h-[46px] rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-sm font-semibold transition-colors"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={!canExecutePurge}
                      className="flex-[1.3] min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-sm font-bold shadow-sm transition-all"
                    >
                      {isExecutingPurge ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                      <span>{isExecutingPurge ? 'Removing...' : 'Remove Course'}</span>
                    </button>
                  </div>
                </motion.form>
              )}

              {/* ── STEP 3: OPTIONAL RE-ENROLLMENT ── */}
              {view === 'RE_ENROLL' && (
                <motion.div
                  key="re-enroll"
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-4"
                >
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <Check size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-emerald-950">
                        {selectedLabel} Removed
                      </p>
                      <p className="text-xs text-emerald-800/90 mt-0.5">
                        Cleared {purgeResult?.purgedCadetCount.toLocaleString() ?? 0} cadets. You can upload a replacement roster below or click Done to finish.
                      </p>
                    </div>
                  </div>

                  {/* Template Download */}
                  <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                    <span className="font-semibold text-slate-700">Replacement Template:</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={downloadNPACSVTemplate}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 font-semibold text-slate-700"
                      >
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={downloadNPAExcelTemplate}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 font-semibold text-slate-700"
                      >
                        Excel
                      </button>
                    </div>
                  </div>

                  {/* File Upload */}
                  <input
                    ref={seedFileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleSeedFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isParsingSeed || isCommittingSeed}
                    onClick={() => seedFileInputRef.current?.click()}
                    className="w-full min-h-[84px] p-4 rounded-2xl border-2 border-dashed border-slate-300 hover:border-blue-600 bg-slate-50/60 hover:bg-blue-50/40 flex flex-col items-center justify-center gap-1.5 text-center transition-colors"
                  >
                    {isParsingSeed ? (
                      <Loader2 size={20} className="animate-spin text-blue-700" />
                    ) : (
                      <Upload size={20} className="text-slate-500" />
                    )}
                    <span className="text-xs font-semibold text-slate-800">
                      {seedFileName ? seedFileName : 'Upload Replacement Roster (.csv, .xlsx)'}
                    </span>
                    {seedParseResult && (
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        {seedParseResult.validRows.length.toLocaleString()} valid •{' '}
                        {seedParseResult.invalidRows.length.toLocaleString()} issues
                      </span>
                    )}
                  </button>

                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={isCommittingSeed}
                      onClick={onClose}
                      className="flex-1 min-h-[46px] rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-sm font-semibold transition-colors"
                    >
                      Done
                    </button>
                    {seedParseResult && seedParseResult.validRows.length > 0 && (
                      <button
                        type="button"
                        disabled={isCommittingSeed}
                        onClick={handleCommitReEnrollment}
                        className="flex-[1.3] min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-bold transition-all"
                      >
                        {isCommittingSeed ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Check size={16} />
                        )}
                        <span>
                          {isCommittingSeed
                            ? 'Enrolling...'
                            : `Enroll ${seedParseResult.validRows.length.toLocaleString()} Cadets`}
                        </span>
                      </button>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── RESTORE REMOVED COURSE SNAPSHOTS ── */}
              {view === 'RESTORE' && (
                <motion.div
                  key="restore"
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
                  transition={{ duration: 0.16 }}
                  className="space-y-3"
                >
                  {isLoadingSnapshots ? (
                    <div className="py-8 flex justify-center">
                      <Loader2 size={20} className="animate-spin text-slate-400" />
                    </div>
                  ) : snapshots.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">
                      No restore snapshots available.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden">
                      {snapshots.map(snap => (
                        <div
                          key={snap.id}
                          className="p-3.5 flex items-center justify-between gap-3 bg-white"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">
                              {snap.courseNumbers.map(rc => `RC ${rc}`).join(', ')}
                            </p>
                            <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                              {snap.cadetCount.toLocaleString()} cadets •{' '}
                              {new Date(snap.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={!!restoringSnapshotId}
                            onClick={() => handleRestoreSnapshot(snap)}
                            className="min-h-[38px] px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors"
                          >
                            {restoringSnapshotId === snap.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <RotateCcw size={14} />
                            )}
                            <span>Restore</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
