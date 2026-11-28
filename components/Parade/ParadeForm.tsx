import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus,
  Minus,
  ChevronDown,
  CheckCircle2,
  Clock,
  UserPlus,
  X,
  Calendar,
  AlertTriangle,
  Lock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useParade } from '../../context/ParadeContext';
import {
  ParadeType,
  CadetStatus,
  CadetDetail,
  ParadeGenderSubmission,
  UserRole
} from '../../types';
import { dbService } from '../../services/dbService';
import { CadetSelector } from '../CadetRegistry/CadetSelector';
import { formatRC } from '../../utils/rcHelpers';
import { useWATDateRollover, getWATDateStr, getWATTimeStr } from '../../hooks/useWATDateRollover';
import { createStaleFetchGuard } from '../../utils/dateRollover';
import { toast } from 'react-hot-toast';
import { SubmissionPreview } from '../Common/SubmissionPreview';

export interface ParadeFormProps {
  overrideCourseNumber?: number;
  overrideTotalCadets?: number;
  submissionSegment?: 'female' | 'male';
  counterpartDetails?: CadetDetail[];
  onSubmittedSuccess?: (result?: { state: 'reconciled' | 'awaiting_counterpart' }) => void;
  externalDate?: string;
  externalParadeType?: ParadeType;
  onDateChange?: (date: string) => void;
  onParadeTypeChange?: (paradeType: ParadeType) => void;
}

type ExceptionKey =
  | 'absent'
  | 'sick'
  | 'pass'
  | 'detention'
  | 'suspension'
  | 'yetToReport';

interface ExceptionCategory {
  key: ExceptionKey;
  label: string;
  cadetStatus: CadetStatus;
}

const EXCEPTION_CATEGORIES: ExceptionCategory[] = [
  { key: 'absent', label: 'Absent', cadetStatus: CadetStatus.ABSENT },
  { key: 'sick', label: 'Sick', cadetStatus: CadetStatus.SICK },
  { key: 'pass', label: 'Pass', cadetStatus: CadetStatus.PASS },
  { key: 'detention', label: 'Detention', cadetStatus: CadetStatus.DETENTION },
  { key: 'suspension', label: 'Suspension', cadetStatus: CadetStatus.SUSPENSION },
  { key: 'yetToReport', label: 'Yet to Report', cadetStatus: CadetStatus.YET_TO_REPORT }
];

const PARADE_OPTIONS: Array<{ value: ParadeType; shortLabel: string }> = [
  { value: ParadeType.MUSTER, shortLabel: 'Muster' },
  { value: ParadeType.TATTOO, shortLabel: 'Tattoo' },
  { value: ParadeType.SPECIAL, shortLabel: 'Special' }
];

const EMPTY_EXCEPTION_COUNTS: Record<ExceptionKey, number> = {
  absent: 0,
  sick: 0,
  pass: 0,
  detention: 0,
  suspension: 0,
  yetToReport: 0
};

export const ParadeForm: React.FC<ParadeFormProps> = ({
  overrideCourseNumber,
  overrideTotalCadets,
  submissionSegment,
  onSubmittedSuccess,
  externalDate,
  externalParadeType,
  onDateChange,
  onParadeTypeChange
}) => {
  const { currentUser } = useAuth();
  const {
    refreshData,
    getLevelForCourse,
    activeRC,
    submissionSettings,
    records
  } = useParade();

  const isMatronMode =
    submissionSegment === 'female' || currentUser?.role === UserRole.MATRON;
  const effectiveSegment: 'female' | 'male' =
    submissionSegment || (isMatronMode ? 'female' : 'male');

  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [tagSheetCategory, setTagSheetCategory] = useState<ExceptionCategory | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    selectedDate: internalDate,
    setSelectedDate: setInternalDate,
    todayWAT,
    watTimeLabel,
    isViewingPastDate,
    jumpToToday,
    didRollover
  } = useWATDateRollover({
    onRollover: () => {
      if (!externalDate) {
        setShowPreview(false);
        setPreviewData(null);
        setTagSheetCategory(null);
        setExceptionCounts(EMPTY_EXCEPTION_COUNTS);
        setCadetDetailsList([]);
        toast('New day — Parade Date updated to Today');
      }
    }
  });

  const [internalParadeType, setInternalParadeType] = useState<ParadeType>(
    isMatronMode ? ParadeType.TATTOO : ParadeType.MUSTER
  );

  const formDate = externalDate ?? internalDate;
  const formParadeType = isMatronMode
    ? ParadeType.TATTOO
    : externalParadeType ?? internalParadeType;

  const setFormDate = (d: string) => {
    if (onDateChange) onDateChange(d);
    else setInternalDate(d);
  };

  const setFormParadeType = (t: ParadeType) => {
    if (onParadeTypeChange) onParadeTypeChange(t);
    else setInternalParadeType(t);
  };

  const officerCourseNumber =
    overrideCourseNumber ??
    currentUser?.courseNumber ??
    (currentUser?.yearGroup ? activeRC - currentUser.yearGroup + 1 : activeRC);

  const yearGroup = officerCourseNumber ? getLevelForCourse(officerCourseNumber) : 1;

  // Matron status & strength state (for Course Officer Night Tattoo)
  const [matronStrength, setMatronStrength] = useState<number | undefined>(undefined);
  const [matronSubmission, setMatronSubmission] = useState<ParadeGenderSubmission | null>(null);
  const [ownGenderSubmission, setOwnGenderSubmission] = useState<ParadeGenderSubmission | null>(null);
  const [showFemaleBreakdown, setShowFemaleBreakdown] = useState(false);

  const isTattooSplitActive = formParadeType === ParadeType.TATTOO;
  const counterpartGuardRef = useRef(createStaleFetchGuard());

  const loadCounterpartState = useCallback(async () => {
    if (!officerCourseNumber || !isTattooSplitActive) {
      setMatronSubmission(null);
      setOwnGenderSubmission(null);
      return;
    }
    const requestId = counterpartGuardRef.current.nextRequestId();
    try {
      const [strengths, subs] = await Promise.all([
        dbService.getMatronCourseStrengths(),
        dbService.getParadeGenderSubmissions({
          date: formDate,
          paradeType: formParadeType,
          courseNumber: officerCourseNumber
        })
      ]);
      if (!counterpartGuardRef.current.isLatest(requestId)) return;

      const s = strengths[officerCourseNumber];
      setMatronStrength(s ? s.femaleStrength : undefined);

      const femSub =
        subs.find(item => item.genderSegment === 'female' && item.paradeDate === formDate) ||
        null;
      const ownSub =
        subs.find(
          item => item.genderSegment === effectiveSegment && item.paradeDate === formDate
        ) || null;

      setMatronSubmission(isMatronMode ? null : femSub);
      setOwnGenderSubmission(ownSub);
    } catch {
      // non-fatal
    }
  }, [
    isMatronMode,
    effectiveSegment,
    officerCourseNumber,
    formDate,
    formParadeType,
    isTattooSplitActive
  ]);

  useEffect(() => {
    loadCounterpartState();
    const onUpdated = () => loadCounterpartState();
    window.addEventListener('parade-gender-submissions-updated', onUpdated);
    return () => window.removeEventListener('parade-gender-submissions-updated', onUpdated);
  }, [loadCounterpartState]);

  const registryTotal = currentUser?.totalCadets || 0;
  const effectiveTotalCadets =
    overrideTotalCadets !== undefined
      ? overrideTotalCadets
      : !isMatronMode && isTattooSplitActive && matronStrength !== undefined
        ? Math.max(0, registryTotal - matronStrength)
        : registryTotal;

  const [exceptionCounts, setExceptionCounts] = useState<Record<ExceptionKey, number>>(
    EMPTY_EXCEPTION_COUNTS
  );
  const [cadetDetailsList, setCadetDetailsList] = useState<CadetDetail[]>([]);

  // Check if this parade is already submitted & locked
  const matchingOfficialRecord = useMemo(
    () =>
      records.find(
        r =>
          r.date === formDate &&
          r.paradeType === formParadeType &&
          Number(r.courseNumber) === Number(officerCourseNumber)
      ) || null,
    [records, formDate, formParadeType, officerCourseNumber]
  );

  const isLocked = Boolean(ownGenderSubmission || matchingOfficialRecord);

  // Hydrate locked state counts if already submitted, else reset cleanly when date/type changes
  useEffect(() => {
    if (ownGenderSubmission) {
      setExceptionCounts({
        absent: ownGenderSubmission.absentCount,
        sick: ownGenderSubmission.sickCount,
        pass: ownGenderSubmission.passCount,
        detention: ownGenderSubmission.detentionCount,
        suspension: ownGenderSubmission.suspensionCount,
        yetToReport: ownGenderSubmission.yetToReportCount
      });
      setCadetDetailsList(ownGenderSubmission.cadetDetails || []);
    } else if (matchingOfficialRecord) {
      setExceptionCounts({
        absent: matchingOfficialRecord.absentCount,
        sick: matchingOfficialRecord.sickCount,
        pass: matchingOfficialRecord.passCount,
        detention: matchingOfficialRecord.detentionCount,
        suspension: matchingOfficialRecord.suspensionCount,
        yetToReport: matchingOfficialRecord.yetToReportCount
      });
      setCadetDetailsList([]);
    } else {
      setExceptionCounts(EMPTY_EXCEPTION_COUNTS);
      setCadetDetailsList([]);
    }
  }, [ownGenderSubmission, matchingOfficialRecord, formDate, formParadeType, officerCourseNumber]);

  const exceptionsTotal =
    exceptionCounts.absent +
    exceptionCounts.sick +
    exceptionCounts.pass +
    exceptionCounts.detention +
    exceptionCounts.suspension +
    exceptionCounts.yetToReport;

  const presentCount = Math.max(0, effectiveTotalCadets) - exceptionsTotal;
  const isOverStrength = exceptionsTotal > effectiveTotalCadets;

  // Time window check for Today (aligned with Nigeria Time WAT)
  const timeWindowMessage = useMemo(() => {
    if (formDate !== todayWAT) return null;
    const currentHour = Number((watTimeLabel || getWATTimeStr()).split(':')[0]);
    const { musterStartHour, musterEndHour, tattooStartHour } = submissionSettings;

    if (
      formParadeType === ParadeType.MUSTER &&
      (currentHour < musterStartHour || currentHour >= musterEndHour)
    ) {
      return `Morning Muster opens ${String(musterStartHour).padStart(2, '0')}:00 – ${String(musterEndHour - 1).padStart(2, '0')}:59.`;
    }
    if (formParadeType === ParadeType.TATTOO && currentHour < tattooStartHour) {
      return `Night Tattoo opens from ${String(tattooStartHour).padStart(2, '0')}:00 onwards.`;
    }
    return null;
  }, [formDate, todayWAT, formParadeType, submissionSettings]);

  const incompleteCategories = useMemo(
    () =>
      EXCEPTION_CATEGORIES.map(cat => {
        const expected = exceptionCounts[cat.key];
        const tagged = cadetDetailsList.filter(c => c.status === cat.cadetStatus).length;
        return { cat, expected, tagged, remaining: expected - tagged };
      }).filter(item => item.expected > 0 && item.tagged !== item.expected),
    [exceptionCounts, cadetDetailsList]
  );

  const missingTagTotal = incompleteCategories.reduce(
    (sum, item) => sum + Math.max(0, item.remaining),
    0
  );

  const canSubmit =
    !isLocked &&
    !isOverStrength &&
    incompleteCategories.length === 0 &&
    !isSubmitting &&
    effectiveTotalCadets >= 0;

  const syncTaggedToCount = (key: ExceptionKey, nextVal: number) => {
    const cat = EXCEPTION_CATEGORIES.find(c => c.key === key);
    if (!cat) return;
    if (nextVal <= 0) {
      setCadetDetailsList(prev => prev.filter(c => c.status !== cat.cadetStatus));
    } else {
      setCadetDetailsList(prev => {
        const others = prev.filter(c => c.status !== cat.cadetStatus);
        const matching = prev.filter(c => c.status === cat.cadetStatus).slice(0, nextVal);
        return [...others, ...matching];
      });
    }
  };

  const adjustCount = (key: ExceptionKey, delta: number) => {
    if (isLocked) return;
    const nextVal = Math.max(0, exceptionCounts[key] + delta);
    setExceptionCounts(prev => ({ ...prev, [key]: nextVal }));
    syncTaggedToCount(key, nextVal);
  };

  const setDirectCount = (key: ExceptionKey, raw: string) => {
    if (isLocked) return;
    const num = raw.trim() === '' ? 0 : Math.max(0, Math.floor(Number(raw)));
    if (Number.isNaN(num)) return;
    setExceptionCounts(prev => ({ ...prev, [key]: num }));
    syncTaggedToCount(key, num);
  };

  // Cadets already logged by Matron during Night Tattoo (prevent duplicate tagging)
  const matronTaggedCadets = useMemo(
    () =>
      !isMatronMode && isTattooSplitActive && matronSubmission?.cadetDetails
        ? matronSubmission.cadetDetails
        : [],
    [isMatronMode, isTattooSplitActive, matronSubmission]
  );

  const disabledForTagging = useMemo(() => {
    const combined = [
      ...cadetDetailsList.map(c => ({ name: c.name, squad: c.squad })),
      ...matronTaggedCadets.map(c => ({ name: c.name, squad: c.squad }))
    ];
    return combined;
  }, [cadetDetailsList, matronTaggedCadets]);

  const handleTagCadet = (cadet: { name: string; squad: string }) => {
    if (!tagSheetCategory || isLocked) return;
    const categoryCount = exceptionCounts[tagSheetCategory.key];
    if (categoryCount <= 0) {
      toast.error(`Set ${tagSheetCategory.label} count above 0 first.`);
      return;
    }

    const exists = cadetDetailsList.some(
      c =>
        c.name.trim().toLowerCase() === cadet.name.trim().toLowerCase() &&
        c.squad.trim().toLowerCase() === cadet.squad.trim().toLowerCase()
    );
    if (exists) {
      toast.error(`${cadet.name} is already tagged.`);
      return;
    }

    const currentForCategory = cadetDetailsList.filter(
      c => c.status === tagSheetCategory.cadetStatus
    ).length;

    if (currentForCategory >= categoryCount) {
      toast.error(
        `Already tagged ${categoryCount} of ${categoryCount} for ${tagSheetCategory.label}.`
      );
      return;
    }

    const newCadet: CadetDetail = {
      name: cadet.name,
      squad: cadet.squad,
      status: tagSheetCategory.cadetStatus
    };

    const nextTaggedCount = currentForCategory + 1;
    setCadetDetailsList(prev => [...prev, newCadet]);

    if (nextTaggedCount >= categoryCount) {
      setTagSheetCategory(null);
    }
  };

  const handleRemoveTaggedCadet = (cadet: CadetDetail) => {
    if (isLocked) return;
    setCadetDetailsList(prev =>
      prev.filter(
        c =>
          !(
            c.name === cadet.name &&
            c.squad === cadet.squad &&
            c.status === cadet.status
          )
      )
    );
  };

  const handleOpenReview = () => {
    if (!currentUser) return;
    if (isLocked) {
      toast.error(`${formParadeType} has already been submitted for ${formDate}.`);
      return;
    }
    if (isOverStrength) {
      toast.error(`Not-present count cannot exceed ${effectiveTotalCadets} cadets.`);
      return;
    }
    if (incompleteCategories.length > 0) {
      const first = incompleteCategories[0];
      toast.error(
        `Tag all ${first.expected} cadet${first.expected === 1 ? '' : 's'} for ${first.cat.label} (${first.tagged}/${first.expected}).`
      );
      setTagSheetCategory(first.cat);
      return;
    }

    const data = {
      officerId: currentUser.id,
      officerName: currentUser.fullName,
      courseName: `REGULAR COURSE ${officerCourseNumber}`,
      yearGroup: yearGroup || currentUser.yearGroup || 1,
      courseNumber: officerCourseNumber,
      date: formDate,
      paradeType: formParadeType,
      presentCount: Math.max(0, presentCount),
      absentCount: exceptionCounts.absent,
      sickCount: exceptionCounts.sick,
      detentionCount: exceptionCounts.detention,
      passCount: exceptionCounts.pass,
      suspensionCount: exceptionCounts.suspension,
      yetToReportCount: exceptionCounts.yetToReport,
      grandTotal: effectiveTotalCadets,
      cadets: cadetDetailsList
    };

    setPreviewData(data);
    setShowPreview(true);
  };

  const commitSubmission = async () => {
    if (!previewData || !currentUser || isSubmitting || isLocked) return;

    // 1. Time Window Enforcement (only for Today, Nigeria Time WAT)
    const today = getWATDateStr();
    if (formDate === today) {
      const currentHour = Number(getWATTimeStr().split(':')[0]);
      const { musterStartHour, musterEndHour, tattooStartHour } = submissionSettings;

      if (
        formParadeType === ParadeType.MUSTER &&
        (currentHour < musterStartHour || currentHour >= musterEndHour)
      ) {
        toast.error(
          `Morning Muster can only be submitted between ${String(musterStartHour).padStart(2, '0')}:00 and ${String(musterEndHour - 1).padStart(2, '0')}:59.`
        );
        setShowPreview(false);
        return;
      }

      if (formParadeType === ParadeType.TATTOO && currentHour < tattooStartHour) {
        toast.error(
          `Night Tattoo can only be submitted from ${String(tattooStartHour).padStart(2, '0')}:00 onwards.`
        );
        setShowPreview(false);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await dbService.submitGenderParadeSegment({
        submitterId: currentUser.id,
        submitterName: currentUser.fullName,
        courseName: previewData.courseName || `REGULAR COURSE ${officerCourseNumber}`,
        yearGroup: previewData.yearGroup || 1,
        courseNumber: officerCourseNumber,
        date: formDate,
        paradeType: formParadeType,
        genderSegment: effectiveSegment,
        declaredStrength: effectiveTotalCadets,
        presentCount: previewData.presentCount,
        absentCount: previewData.absentCount,
        sickCount: previewData.sickCount,
        detentionCount: previewData.detentionCount,
        passCount: previewData.passCount || 0,
        suspensionCount: previewData.suspensionCount || 0,
        yetToReportCount: previewData.yetToReportCount || 0,
        grandTotal: previewData.grandTotal,
        cadets: previewData.cadets || []
      });

      setShowPreview(false);
      setPreviewData(null);
      await refreshData();
      await loadCounterpartState();

      if (res.state === 'reconciled') {
        toast.success(
          isMatronMode
            ? `${formatRC(officerCourseNumber)} combined with Course Officer & filed!`
            : `${formatRC(officerCourseNumber)} parade submitted!`
        );
      } else {
        toast.success(
          isMatronMode
            ? `Female state sent to ${formatRC(officerCourseNumber)} Officer.`
            : `Male state saved — will combine once Matron submits.`
        );
      }

      if (onSubmittedSuccess) {
        onSubmittedSuccess({ state: res.state });
      }
    } catch (error: any) {
      toast.error(error?.message || 'Submission failed. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28 md:pb-6">
      {/* Jakob's Law: Clean Header + Date Pill + iOS Segmented Parade Type */}
      <section className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-950 tracking-tight">
              Submit Parade
            </h2>
            <p className="text-xs text-slate-500 tabular-nums">
              {formatRC(officerCourseNumber)} · Year {yearGroup} · {watTimeLabel} WAT
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {!externalDate && isViewingPastDate && (
              <button
                type="button"
                onClick={jumpToToday}
                className="min-h-[36px] px-3 rounded-full bg-blue-50 hover:bg-blue-100 border border-blue-200/80 text-blue-700 text-xs font-bold active:scale-95 transition-all"
              >
                Today
              </button>
            )}
            <label className="relative flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer">
              <Calendar size={13} className="text-slate-500" />
              <input
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 outline-none w-[108px]"
              />
            </label>
          </div>
        </div>

        {didRollover && !externalDate && !isViewingPastDate && (
          <div className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-[11px] font-semibold flex items-center justify-between">
            <span>New day · Switched to Today</span>
            <span className="text-slate-500 tabular-nums">{formDate}</span>
          </div>
        )}

        {/* iOS Segmented Control for Parade Type */}
        {!isMatronMode && (
          <div
            role="tablist"
            aria-label="Parade Type"
            className="grid grid-cols-3 bg-slate-100 p-1 rounded-xl border border-slate-200/60"
          >
            {PARADE_OPTIONS.map(opt => {
              const active = formParadeType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFormParadeType(opt.value)}
                  className={`min-h-[40px] rounded-lg text-xs font-bold transition-all active:scale-[0.98] ${
                    active
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.shortLabel}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Locked State Banner */}
      {isLocked && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-2.5">
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-emerald-950 flex items-center gap-1.5">
              <span>{formParadeType} Submitted</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200/70 text-emerald-900">
                <Lock size={10} />
                Locked
              </span>
            </p>
            <p className="text-xs text-emerald-800">
              {ownGenderSubmission?.status === 'pending_counterpart'
                ? 'Saved — waiting for Matron to submit female count so both combine.'
                : `Filed for ${formDate}. Switch parade type above if needed.`}
            </p>
          </div>
        </div>
      )}

      {/* Time Window Notice */}
      {!isLocked && timeWindowMessage && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2.5 text-xs font-semibold text-amber-900">
          <Clock size={16} className="text-amber-600 shrink-0" />
          <span>{timeWindowMessage}</span>
        </div>
      )}

      {/* Matron Sync Card (Night Tattoo only) */}
      {!isMatronMode && isTattooSplitActive && (
        <section
          className={`rounded-2xl border p-4 transition-colors ${
            matronSubmission
              ? 'bg-emerald-50/70 border-emerald-200/80 text-emerald-950'
              : matronStrength === 0
                ? 'bg-slate-50 border-slate-200 text-slate-700'
                : 'bg-amber-50/70 border-amber-200/80 text-amber-950'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              {matronSubmission ? (
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <Clock
                  size={18}
                  className={
                    matronStrength === 0
                      ? 'text-slate-400 shrink-0 mt-0.5'
                      : 'text-amber-600 shrink-0 mt-0.5'
                  }
                />
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-tight">
                  {matronSubmission
                    ? `Female count received (${matronSubmission.presentCount} of ${matronSubmission.grandTotal} present)`
                    : matronStrength === 0
                      ? `No female cadets in ${formatRC(officerCourseNumber)}`
                      : 'Waiting for Matron female count'}
                </p>
                <p className="text-[11px] opacity-85 mt-0.5 leading-relaxed">
                  {matronSubmission
                    ? `Your male count is ${effectiveTotalCadets} (${registryTotal} total − ${matronSubmission.grandTotal} female). Submitting will combine both.`
                    : matronStrength === 0
                      ? `Your submission will file ${formatRC(officerCourseNumber)} directly.`
                      : matronStrength !== undefined
                        ? `Your male count is ${effectiveTotalCadets} (${registryTotal} total − ${matronStrength} female). You can submit anytime.`
                        : 'You can submit your male count anytime — both will combine automatically.'}
                </p>
              </div>
            </div>

            {matronSubmission && (
              <button
                type="button"
                onClick={() => setShowFemaleBreakdown(v => !v)}
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white/80 hover:bg-white border border-emerald-200 text-[11px] font-semibold text-emerald-800 flex items-center gap-1 shrink-0 transition-colors"
              >
                <span>View details</span>
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-150 ${showFemaleBreakdown ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          </div>

          {matronSubmission && showFemaleBreakdown && (
            <div className="mt-3 pt-3 border-t border-emerald-200/70 space-y-2">
              <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold tabular-nums">
                <span className="px-2 py-0.5 rounded-md bg-white border border-emerald-200/70">
                  Present: {matronSubmission.presentCount}
                </span>
                {matronSubmission.absentCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-white border border-rose-200 text-rose-700">
                    Absent: {matronSubmission.absentCount}
                  </span>
                )}
                {matronSubmission.sickCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-white border border-amber-200 text-amber-700">
                    Sick: {matronSubmission.sickCount}
                  </span>
                )}
                {matronSubmission.passCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-white border border-purple-200 text-purple-700">
                    Pass: {matronSubmission.passCount}
                  </span>
                )}
                {matronSubmission.detentionCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-700">
                    Detention: {matronSubmission.detentionCount}
                  </span>
                )}
                {matronSubmission.suspensionCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                    Suspension: {matronSubmission.suspensionCount}
                  </span>
                )}
                {matronSubmission.yetToReportCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-white border border-cyan-200 text-cyan-700">
                    Yet to Report: {matronSubmission.yetToReportCount}
                  </span>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Live Present Summary Banner */}
      <section
        className={`rounded-2xl border p-4 flex items-center justify-between gap-3 ${
          isOverStrength ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200/80'
        }`}
      >
        <div>
          <div className="text-xs font-semibold text-slate-500">Present on Parade</div>
          <div className="text-xs text-slate-600 mt-0.5 tabular-nums">
            {isOverStrength
              ? `Not-present (${exceptionsTotal}) exceeds strength (${effectiveTotalCadets})`
              : exceptionsTotal === 0
                ? `All ${effectiveTotalCadets} cadets accounted for`
                : `${exceptionsTotal} cadet${exceptionsTotal === 1 ? '' : 's'} not on parade (of ${effectiveTotalCadets})`}
          </div>
        </div>

        <div
          className={`text-3xl font-bold tabular-nums tracking-tight ${
            isOverStrength ? 'text-rose-600' : 'text-slate-950'
          }`}
        >
          {presentCount}
        </div>
      </section>

      {/* Apple iOS Grouped List: 6 Not-On-Parade Steppers */}
      <section className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-200/70 overflow-hidden">
        {EXCEPTION_CATEGORIES.map(cat => {
          const val = exceptionCounts[cat.key];
          const catCadets = cadetDetailsList.filter(c => c.status === cat.cadetStatus);

          return (
            <div key={cat.key} className="p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-950">{cat.label}</div>
                  {val > 0 ? (
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => setTagSheetCategory(cat)}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed min-h-[28px]"
                    >
                      <UserPlus size={12} />
                      <span>
                        {catCadets.length > 0
                          ? `Tagged (${catCadets.length}/${val})`
                          : `Tag cadet (0/${val})`}
                      </span>
                    </button>
                  ) : (
                    <span className="mt-1 inline-block text-[11px] text-slate-400">
                      Increase count to tag a cadet
                    </span>
                  )}
                </div>

                {/* Tactile 44x44px iOS Stepper */}
                <div
                  className={`flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200/60 shrink-0 ${
                    isLocked ? 'opacity-60' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => adjustCount(cat.key, -1)}
                    disabled={isLocked || val <= 0}
                    aria-label={`Decrease ${cat.label}`}
                    className="w-11 h-11 rounded-lg flex items-center justify-center text-slate-700 hover:bg-white disabled:opacity-30 active:scale-95 transition-all"
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    disabled={isLocked}
                    value={val === 0 ? '' : val}
                    placeholder="0"
                    onChange={e => setDirectCount(cat.key, e.target.value)}
                    aria-label={`${cat.label} count`}
                    className="w-12 h-11 bg-transparent text-center text-base font-bold text-slate-950 tabular-nums outline-none disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => adjustCount(cat.key, 1)}
                    aria-label={`Increase ${cat.label}`}
                    className="w-11 h-11 rounded-lg flex items-center justify-center text-slate-700 hover:bg-white disabled:opacity-30 active:scale-95 transition-all"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* Tagged Cadet Chips */}
              {catCadets.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {catCadets.map((c, idx) => (
                    <span
                      key={`${c.name}-${idx}`}
                      className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-slate-100 border border-slate-200/80 text-xs font-medium text-slate-800"
                    >
                      <span className="truncate max-w-[160px]">{c.name}</span>
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTaggedCadet(c)}
                          aria-label={`Remove ${c.name}`}
                          className="w-5 h-5 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {isOverStrength && (
        <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
          <AlertTriangle size={15} className="shrink-0" />
          <span>
            Reduce not-present counts so they do not exceed {effectiveTotalCadets} cadets.
          </span>
        </div>
      )}

      {!isLocked && !isOverStrength && incompleteCategories.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-amber-950">
              Tag {missingTagTotal} more cadet{missingTagTotal === 1 ? '' : 's'} to submit
            </p>
            <p className="text-[11px] text-amber-800 mt-0.5 tabular-nums">
              {incompleteCategories
                .map(i => `${i.cat.label}: ${i.tagged}/${i.expected}`)
                .join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTagSheetCategory(incompleteCategories[0].cat)}
            className="min-h-[38px] px-3 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-bold shrink-0 transition-all"
          >
            Tag {incompleteCategories[0].cat.label}
          </button>
        </div>
      )}

      {/* Desktop Inline Submit */}
      <div className="hidden md:block pt-1">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleOpenReview}
          className="w-full min-h-[48px] rounded-2xl bg-slate-950 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500 text-white text-sm font-bold transition-all active:scale-[0.99] flex items-center justify-center gap-2"
        >
          {isLocked ? (
            <>
              <Lock size={15} />
              <span>{formParadeType} Submitted &amp; Locked</span>
            </>
          ) : isSubmitting ? (
            'Submitting...'
          ) : (
            `Review ${formParadeType} (${Math.max(0, presentCount)} Present)`
          )}
        </button>
      </div>

      {/* Mobile Sticky Action Bar (Apple Pay / WhatsApp pattern) */}
      <div className="md:hidden fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-4 py-2.5">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-950 tabular-nums truncate">
              {formatRC(officerCourseNumber)} {formParadeType}
            </div>
            <div className="text-[11px] text-slate-500 tabular-nums">
              {isLocked
                ? 'Submitted & Locked'
                : incompleteCategories.length > 0
                  ? `Tag ${missingTagTotal} more cadet${missingTagTotal === 1 ? '' : 's'} to submit`
                  : `${Math.max(0, presentCount)} Present · ${exceptionsTotal} Not on parade`}
            </div>
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleOpenReview}
            className="min-h-[44px] px-5 rounded-xl bg-slate-950 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500 text-white text-xs font-bold transition-all active:scale-95 shrink-0 inline-flex items-center gap-1.5"
          >
            {isLocked ? (
              <>
                <Lock size={13} />
                <span>Locked</span>
              </>
            ) : isSubmitting ? (
              'Saving...'
            ) : (
              'Review & Submit'
            )}
          </button>
        </div>
      </div>

      {/* Mobile Bottom-Sheet Cadet Tagging Modal */}
      {tagSheetCategory && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px] flex items-end md:items-center justify-center"
          onClick={() => setTagSheetCategory(null)}
        >
          <div
            className="w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-2xl h-[78dvh] md:h-[600px] flex flex-col overflow-hidden shadow-xl pb-[env(safe-area-inset-bottom)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2.5 pb-1 md:hidden shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-300" />
            </div>
            <div className="px-4 py-3 border-b border-slate-200/80 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-950">
                  Tag Cadet · {tagSheetCategory.label}
                </h3>
                <p className="text-xs text-slate-500 tabular-nums">
                  {formatRC(officerCourseNumber)} Registry · Tagged{' '}
                  {cadetDetailsList.filter(c => c.status === tagSheetCategory.cadetStatus).length}{' '}
                  of {exceptionCounts[tagSheetCategory.key]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTagSheetCategory(null)}
                className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 flex-1 min-h-0 flex flex-col">
              <CadetSelector
                inlineList
                courseNumber={officerCourseNumber}
                disabledCadets={disabledForTagging}
                disabledBadgeLabel={
                  matronTaggedCadets.length > 0 ? 'Tagged / Matron' : 'Tagged'
                }
                onSelect={handleTagCadet}
              />
            </div>
          </div>
        </div>
      )}

      <SubmissionPreview
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        onConfirm={commitSubmission}
        title={`Review ${formParadeType}`}
        type="parade"
        data={previewData}
      />
    </div>
  );
};
