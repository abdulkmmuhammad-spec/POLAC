import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  CheckCircle2,
  ArrowRight,
  Clock,
  Minus,
  Plus,
  UserPlus,
  X,
  Calendar,
  AlertTriangle,
  Check,
  Lock
} from 'lucide-react';
import { Sidebar } from '../../Layout/Sidebar';
import { Header } from '../../Layout/Header';
import { BottomNav } from '../../Layout/BottomNav';
import { CadetSelector } from '../../CadetRegistry/CadetSelector';
import { SubmissionPreview } from '../../Common/SubmissionPreview';
import { MatronSubmissionHistory } from './MatronSubmissionHistory';
import { useAuth } from '../../../context/AuthContext';
import { useParade } from '../../../context/ParadeContext';
import { dbService } from '../../../services/dbService';
import { ParadeType, ParadeGenderSubmission, CadetDetail, CadetStatus } from '../../../types';
import { formatRC, calculateCurrentLevel } from '../../../utils/rcHelpers';
import { toast } from 'react-hot-toast';

type ExceptionKey =
  | 'sick'
  | 'pass'
  | 'detention'
  | 'suspension'
  | 'yet_to_report'
  | 'absent';

interface ExceptionCategory {
  key: ExceptionKey;
  label: string;
  cadetStatus: CadetDetail['status'];
}

const EXCEPTION_CATEGORIES: ExceptionCategory[] = [
  { key: 'absent', label: 'Absent', cadetStatus: CadetStatus.ABSENT },
  { key: 'sick', label: 'Sick', cadetStatus: CadetStatus.SICK },
  { key: 'pass', label: 'Pass', cadetStatus: CadetStatus.PASS },
  { key: 'detention', label: 'Detention', cadetStatus: CadetStatus.DETENTION },
  { key: 'suspension', label: 'Suspension', cadetStatus: CadetStatus.SUSPENSION },
  { key: 'yet_to_report', label: 'Yet to Report', cadetStatus: CadetStatus.YET_TO_REPORT }
];

const EMPTY_COUNTS: Record<ExceptionKey, number> = {
  sick: 0,
  pass: 0,
  detention: 0,
  suspension: 0,
  yet_to_report: 0,
  absent: 0
};

const getWATDateStr = () => {
  const now = new Date();
  const watOffsetMs = 60 * 60 * 1000;
  return new Date(now.getTime() + watOffsetMs).toISOString().split('T')[0];
};

export const MatronDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const { activeRC } = useParade();
  const location = useLocation();
  const isHistoryTab = location.pathname.includes('/matron/history');

  const activeCourses = useMemo(() => {
    const courses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const rc = activeRC - i;
      if (rc >= 1) courses.push(rc);
    }
    return courses;
  }, [activeRC]);

  const [selectedRC, setSelectedRC] = useState<number>(activeCourses[0] || activeRC);
  const [selectedDate, setSelectedDate] = useState<string>(getWATDateStr());
  const selectedParadeType = ParadeType.TATTOO;

  const [strengthsMap, setStrengthsMap] = useState<Record<number, number>>({});
  const [strengthInput, setStrengthInput] = useState<string>('');
  const [isSavingStrength, setIsSavingStrength] = useState(false);
  const [savedStrengthRC, setSavedStrengthRC] = useState<number | null>(null);

  const [submissions, setSubmissions] = useState<ParadeGenderSubmission[]>([]);
  const [counts, setCounts] = useState<Record<ExceptionKey, number>>(EMPTY_COUNTS);
  const [taggedCadets, setTaggedCadets] = useState<CadetDetail[]>([]);

  const [tagSheetCategory, setTagSheetCategory] = useState<ExceptionCategory | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastCompletedRC, setLastCompletedRC] = useState<number | null>(null);

  useEffect(() => {
    if (activeCourses.length > 0 && !activeCourses.includes(selectedRC)) {
      setSelectedRC(activeCourses[0]);
    }
  }, [activeCourses, selectedRC]);

  const loadMatronData = useCallback(async () => {
    try {
      const [strengths, subs] = await Promise.all([
        dbService.getMatronCourseStrengths(),
        dbService.getParadeGenderSubmissions({
          date: selectedDate,
          paradeType: selectedParadeType
        })
      ]);

      const numericMap: Record<number, number> = {};
      Object.values(strengths).forEach(s => {
        numericMap[s.courseNumber] = s.femaleStrength;
      });
      setStrengthsMap(numericMap);
      setSubmissions(subs);
    } catch {
      // non-fatal
    }
  }, [selectedDate, selectedParadeType]);

  useEffect(() => {
    loadMatronData();
    const onUpdated = () => loadMatronData();
    window.addEventListener('parade-gender-submissions-updated', onUpdated);
    return () => window.removeEventListener('parade-gender-submissions-updated', onUpdated);
  }, [loadMatronData]);

  // Hydrate strength + existing female submission whenever course/date changes
  const existingFemaleSub = useMemo(
    () =>
      submissions.find(
        s => s.courseNumber === selectedRC && s.genderSegment === 'female'
      ),
    [submissions, selectedRC]
  );

  useEffect(() => {
    const existingStrength = strengthsMap[selectedRC];
    setStrengthInput(existingStrength !== undefined ? String(existingStrength) : '');
    setSavedStrengthRC(existingStrength !== undefined ? selectedRC : null);

    if (existingFemaleSub) {
      setCounts({
        sick: existingFemaleSub.sickCount,
        pass: existingFemaleSub.passCount,
        detention: existingFemaleSub.detentionCount,
        suspension: existingFemaleSub.suspensionCount,
        yet_to_report: existingFemaleSub.yetToReportCount,
        absent: existingFemaleSub.absentCount
      });
      setTaggedCadets(existingFemaleSub.cadetDetails || []);
    } else {
      setCounts(EMPTY_COUNTS);
      setTaggedCadets([]);
    }
  }, [selectedRC, strengthsMap, existingFemaleSub]);

  const handleSaveStrength = async (rawValue: string) => {
    if (!currentUser) return;
    const trimmed = rawValue.trim();
    if (trimmed === '') return;

    const parsed = Math.max(0, Math.floor(Number(trimmed)));
    if (Number.isNaN(parsed)) return;

    if (strengthsMap[selectedRC] === parsed) {
      setSavedStrengthRC(selectedRC);
      return;
    }

    setIsSavingStrength(true);
    try {
      const res = await dbService.upsertMatronCourseStrength(selectedRC, parsed, currentUser.id);
      setStrengthsMap(prev => ({ ...prev, [selectedRC]: parsed }));
      setSavedStrengthRC(selectedRC);
      if (res.autoReconciledCount > 0) {
        toast.success(`${formatRC(selectedRC)} marked 0 female cadets — Officer parade auto-filed.`);
      }
      await loadMatronData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save female strength.');
    } finally {
      setIsSavingStrength(false);
    }
  };

  const getCourseStatus = (rc: number): 'pending' | 'awaiting' | 'reconciled' => {
    const femSub = submissions.find(
      s => s.courseNumber === rc && s.genderSegment === 'female'
    );
    const maleSub = submissions.find(
      s => s.courseNumber === rc && s.genderSegment === 'male'
    );

    if (femSub?.status === 'reconciled' || maleSub?.status === 'reconciled') {
      return 'reconciled';
    }
    if (femSub) {
      return 'awaiting';
    }
    if (strengthsMap[rc] === 0 && maleSub) {
      return 'reconciled';
    }
    return 'pending';
  };

  const submittedCount = activeCourses.filter(rc => getCourseStatus(rc) !== 'pending').length;

  const parsedStrength =
    strengthInput.trim() === '' || Number.isNaN(Number(strengthInput))
      ? undefined
      : Math.max(0, Math.floor(Number(strengthInput)));

  const exceptionsTotal =
    counts.sick +
    counts.pass +
    counts.detention +
    counts.suspension +
    counts.yet_to_report +
    counts.absent;

  const presentCount =
    parsedStrength !== undefined ? parsedStrength - exceptionsTotal : 0;

  const isLocked = Boolean(existingFemaleSub);

  const isOverStrength =
    parsedStrength !== undefined && exceptionsTotal > parsedStrength;

  const canSubmit =
    parsedStrength !== undefined && !isOverStrength && !isSubmitting && !isLocked;

  const nextUnsubmittedRC = useMemo(() => {
    const currentIdx = activeCourses.indexOf(selectedRC);
    const ordered = [
      ...activeCourses.slice(currentIdx + 1),
      ...activeCourses.slice(0, currentIdx)
    ];
    return ordered.find(rc => getCourseStatus(rc) === 'pending') ?? activeCourses[currentIdx + 1] ?? null;
  }, [activeCourses, selectedRC, submissions, strengthsMap]);

  const syncTaggedToCount = (key: ExceptionKey, nextVal: number) => {
    const cat = EXCEPTION_CATEGORIES.find(c => c.key === key);
    if (!cat) return;
    if (nextVal <= 0) {
      setTaggedCadets(prev => prev.filter(c => c.status !== cat.cadetStatus));
    } else {
      setTaggedCadets(prev => {
        const others = prev.filter(c => c.status !== cat.cadetStatus);
        const matching = prev.filter(c => c.status === cat.cadetStatus).slice(0, nextVal);
        return [...others, ...matching];
      });
    }
  };

  const adjustCount = (key: ExceptionKey, delta: number) => {
    if (isLocked) return;
    const nextVal = Math.max(0, counts[key] + delta);
    setCounts(prev => ({
      ...prev,
      [key]: nextVal
    }));
    syncTaggedToCount(key, nextVal);
  };

  const setDirectCount = (key: ExceptionKey, raw: string) => {
    if (isLocked) return;
    const num = raw.trim() === '' ? 0 : Math.max(0, Math.floor(Number(raw)));
    if (Number.isNaN(num)) return;
    setCounts(prev => ({ ...prev, [key]: num }));
    syncTaggedToCount(key, num);
  };

  const handleTagCadet = (cadet: { name: string; squad: string }) => {
    if (!tagSheetCategory) return;
    const categoryCount = counts[tagSheetCategory.key];
    if (categoryCount <= 0) {
      toast.error(`Set ${tagSheetCategory.label} count above 0 first.`);
      return;
    }

    const exists = taggedCadets.some(
      c =>
        c.name.trim().toLowerCase() === cadet.name.trim().toLowerCase() &&
        c.squad.trim().toLowerCase() === cadet.squad.trim().toLowerCase()
    );
    if (exists) {
      toast.error(`${cadet.name} is already tagged.`);
      return;
    }

    const currentForCategory = taggedCadets.filter(
      c => c.status === tagSheetCategory.cadetStatus
    ).length;

    if (currentForCategory >= categoryCount) {
      toast.error(`Already tagged ${categoryCount} of ${categoryCount} for ${tagSheetCategory.label}.`);
      return;
    }

    const newCadet: CadetDetail = {
      name: cadet.name,
      squad: cadet.squad,
      status: tagSheetCategory.cadetStatus
    };

    const nextTaggedCount = currentForCategory + 1;
    setTaggedCadets(prev => [...prev, newCadet]);
    toast.success(`Tagged ${cadet.name} (${tagSheetCategory.label})`);

    if (nextTaggedCount >= categoryCount) {
      setTagSheetCategory(null);
    }
  };

  const handleRemoveTaggedCadet = (cadet: CadetDetail) => {
    setTaggedCadets(prev =>
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
    if (isLocked) {
      toast.error(`${formatRC(selectedRC)} Tattoo has already been submitted for ${selectedDate}.`);
      return;
    }
    if (!currentUser || parsedStrength === undefined || isOverStrength) return;
    const yearGroup = calculateCurrentLevel(selectedRC, activeRC);
    setPreviewData({
      officerId: currentUser.id,
      officerName: currentUser.fullName,
      courseName: formatRC(selectedRC),
      yearGroup,
      courseNumber: selectedRC,
      date: selectedDate,
      paradeType: selectedParadeType,
      presentCount: Math.max(0, presentCount),
      absentCount: counts.absent,
      sickCount: counts.sick,
      detentionCount: counts.detention,
      passCount: counts.pass,
      suspensionCount: counts.suspension,
      yetToReportCount: counts.yet_to_report,
      grandTotal: parsedStrength,
      cadets: taggedCadets
    });
    setShowPreview(true);
  };

  const commitSubmission = async () => {
    if (!currentUser || !previewData || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (strengthsMap[selectedRC] !== previewData.grandTotal) {
        await dbService.upsertMatronCourseStrength(
          selectedRC,
          previewData.grandTotal,
          currentUser.id
        );
      }

      const res = await dbService.submitGenderParadeSegment({
        submitterId: currentUser.id,
        submitterName: currentUser.fullName,
        courseName: previewData.courseName,
        yearGroup: previewData.yearGroup,
        courseNumber: selectedRC,
        date: previewData.date,
        paradeType: selectedParadeType,
        genderSegment: 'female',
        declaredStrength: previewData.grandTotal,
        presentCount: previewData.presentCount,
        absentCount: previewData.absentCount,
        sickCount: previewData.sickCount,
        detentionCount: previewData.detentionCount,
        passCount: previewData.passCount,
        suspensionCount: previewData.suspensionCount,
        yetToReportCount: previewData.yetToReportCount,
        grandTotal: previewData.grandTotal,
        cadets: previewData.cadets
      });

      setShowPreview(false);
      setPreviewData(null);
      toast.success(
        res.state === 'reconciled'
          ? `${formatRC(selectedRC)} Tattoo combined & filed!`
          : `${formatRC(selectedRC)} female Tattoo saved — awaiting Course Officer.`
      );
      setLastCompletedRC(selectedRC);
      await loadMatronData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit Tattoo parade.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={currentUser?.designation || 'Academy Matron'} />

        <main className="flex-1 overflow-y-auto px-4 pt-4 pb-44 md:p-8 md:pb-12">
          <div className="max-w-2xl mx-auto">
            {isHistoryTab ? (
              <MatronSubmissionHistory activeCourses={activeCourses} />
            ) : (
              <div className="space-y-4">
                {/* Jakob's Law: Instagram/WhatsApp Status-Ring 5-Course Tray */}
                <section className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-950 tracking-tight">
                        Night Tattoo
                      </h2>
                      <p className="text-xs text-slate-500">
                        Tap a course ring to log female attendance
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <label className="relative flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer">
                        <Calendar size={13} className="text-slate-500" />
                        <input
                          type="date"
                          value={selectedDate}
                          onChange={e => {
                            setSelectedDate(e.target.value);
                            setLastCompletedRC(null);
                          }}
                          className="bg-transparent text-xs font-semibold text-slate-800 outline-none w-[108px]"
                        />
                      </label>
                      <span className="px-2.5 py-1.5 rounded-full text-xs font-bold tabular-nums bg-slate-950 text-white">
                        {submittedCount}/{activeCourses.length}
                      </span>
                    </div>
                  </div>

                  {/* Stories-style horizontal course rings */}
                  <div
                    data-no-page-swipe="true"
                    className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1 px-0.5"
                  >
                    {activeCourses.map(rc => {
                      const status = getCourseStatus(rc);
                      const isSelected = rc === selectedRC;

                      const ringClass =
                        status === 'reconciled'
                          ? 'ring-2 ring-emerald-500 bg-emerald-50 text-emerald-900'
                          : status === 'awaiting'
                            ? 'ring-2 ring-amber-500 bg-amber-50 text-amber-900'
                            : 'ring-1 ring-slate-300 bg-slate-50 text-slate-700';

                      return (
                        <button
                          key={rc}
                          type="button"
                          onClick={() => {
                            setSelectedRC(rc);
                            setLastCompletedRC(null);
                          }}
                          className="flex flex-col items-center gap-1.5 shrink-0 min-w-[64px] active:scale-95 transition-transform"
                        >
                          <div
                            className={`relative w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-sm tabular-nums transition-all ${ringClass} ${isSelected
                              ? 'ring-offset-2 ring-offset-white scale-[1.03] shadow-sm'
                              : 'opacity-85 hover:opacity-100'
                              }`}
                          >
                            <span>{rc}</span>
                            {status === 'reconciled' && (
                              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center ring-2 ring-white">
                                <Check size={11} strokeWidth={3} />
                              </span>
                            )}
                            {status === 'awaiting' && (
                              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center ring-2 ring-white">
                                <Clock size={11} strokeWidth={2.5} />
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-[11px] tabular-nums px-2 py-0.5 rounded-full ${isSelected
                              ? 'bg-slate-950 text-white font-bold'
                              : 'text-slate-600 font-semibold'
                              }`}
                          >
                            {formatRC(rc)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Submitted & Locked / Course-to-Course Advancement Banner */}
                {(isLocked || lastCompletedRC === selectedRC) && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-emerald-950 flex items-center gap-1.5">
                          <span>{formatRC(selectedRC)} Tattoo Submitted</span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200/70 text-emerald-900">
                            <Lock size={10} />
                            Locked
                          </span>
                        </p>
                        <p className="text-xs text-emerald-800">
                          {getCourseStatus(selectedRC) === 'reconciled'
                            ? 'Combined with Course Officer submission and filed.'
                            : `Sent to ${formatRC(selectedRC)} Course Officer for auto-combination.`}
                        </p>
                      </div>
                    </div>
                    {nextUnsubmittedRC !== null && getCourseStatus(nextUnsubmittedRC) === 'pending' && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRC(nextUnsubmittedRC);
                          setLastCompletedRC(null);
                        }}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-all"
                      >
                        <span>Continue to {formatRC(nextUnsubmittedRC)}</span>
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                )}

                {/* Apple Settings-Style Female Strength Row */}
                <section className="bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <label
                      htmlFor="matron-female-strength"
                      className="block text-sm font-bold text-slate-950"
                    >
                      {formatRC(selectedRC)} Female Strength
                    </label>
                    <p className="text-xs text-slate-500">
                      Total female cadets on roll (0 if none)
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      id="matron-female-strength"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="0"
                      disabled={isLocked}
                      value={strengthInput}
                      onChange={e => {
                        setStrengthInput(e.target.value);
                        setSavedStrengthRC(null);
                      }}
                      onBlur={e => {
                        if (!isLocked) handleSaveStrength(e.target.value);
                      }}
                      className="w-20 min-h-[44px] px-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-slate-950 disabled:opacity-60 disabled:cursor-not-allowed text-base font-bold text-slate-950 text-center tabular-nums outline-none transition-colors"
                    />
                    {savedStrengthRC === selectedRC && !isSavingStrength ? (
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2.5 py-2 rounded-xl min-h-[44px] flex items-center">
                        Saved
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={isLocked || isSavingStrength || strengthInput.trim() === ''}
                        onClick={() => handleSaveStrength(strengthInput)}
                        className="min-h-[44px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-xs font-bold text-slate-800 transition-colors"
                      >
                        {isSavingStrength ? '...' : 'Save'}
                      </button>
                    )}
                  </div>
                </section>

                {/* Live Present Summary Banner */}
                <section
                  className={`rounded-2xl border p-4 flex items-center justify-between gap-3 ${isOverStrength
                    ? 'bg-rose-50 border-rose-200'
                    : parsedStrength === undefined
                      ? 'bg-slate-100 border-slate-200/80'
                      : 'bg-white border-slate-200/80'
                    }`}
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-500">
                      Present on Parade
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {parsedStrength === undefined
                        ? `Enter ${formatRC(selectedRC)} female strength above to begin`
                        : isOverStrength
                          ? `Exceptions (${exceptionsTotal}) exceed strength (${parsedStrength})`
                          : exceptionsTotal === 0
                            ? `All ${parsedStrength} female cadets present`
                            : `${exceptionsTotal} exception${exceptionsTotal === 1 ? '' : 's'} logged`}
                    </div>
                  </div>

                  <div
                    className={`text-3xl font-bold tabular-nums tracking-tight ${isOverStrength
                      ? 'text-rose-600'
                      : parsedStrength === undefined
                        ? 'text-slate-400'
                        : 'text-slate-950'
                      }`}
                  >
                    {parsedStrength === undefined ? '—' : presentCount}
                  </div>
                </section>

                {/* Apple iOS Grouped List: 6 Exception Steppers */}
                {parsedStrength !== 0 && (
                  <section className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-200/70 overflow-hidden">
                    {EXCEPTION_CATEGORIES.map(cat => {
                      const val = counts[cat.key];
                      const catCadets = taggedCadets.filter(
                        c => c.status === cat.cadetStatus
                      );

                      return (
                        <div key={cat.key} className="p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-slate-950">
                                {cat.label}
                              </div>
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
                                      : `Tag female cadet (0/${val})`}
                                  </span>
                                </button>
                              ) : (
                                <span className="mt-1 inline-block text-[11px] text-slate-400">
                                  Increase count to tag cadet
                                </span>
                              )}
                            </div>

                            {/* Tactile 44x44px iOS Stepper */}
                            <div className={`flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200/60 shrink-0 ${isLocked ? 'opacity-60' : ''}`}>
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
                )}

                {isOverStrength && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>
                      Reduce exception counts so they do not exceed {formatRC(selectedRC)} female strength ({parsedStrength}).
                    </span>
                  </div>
                )}

                {/* Desktop inline submit (mobile uses sticky bottom bar below) */}
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
                        <span>{formatRC(selectedRC)} Tattoo Submitted &amp; Locked</span>
                      </>
                    ) : isSubmitting ? (
                      'Submitting...'
                    ) : parsedStrength === 0 ? (
                      `Review & Confirm 0 Female Cadets (${formatRC(selectedRC)})`
                    ) : (
                      `Review ${formatRC(selectedRC)} Tattoo (${Math.max(0, presentCount)} Present)`
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Mobile Sticky Action Bar (Apple Pay / WhatsApp pattern) */}
        {!isHistoryTab && (
          <div className="md:hidden fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-4 py-2.5">
            <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-950 tabular-nums truncate">
                  {formatRC(selectedRC)} Tattoo
                </div>
                <div className="text-[11px] text-slate-500 tabular-nums">
                  {isLocked
                    ? 'Submitted & Locked'
                    : parsedStrength === undefined
                    ? 'Set female strength'
                    : `${Math.max(0, presentCount)} Present · ${exceptionsTotal} Exc.`}
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
                ) : parsedStrength === 0 ? (
                  'Review 0'
                ) : (
                  'Review & Submit'
                )}
              </button>
            </div>
          </div>
        )}

        <BottomNav />
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
                  Tag Female Cadet · {tagSheetCategory.label}
                </h3>
                <p className="text-xs text-slate-500 tabular-nums">
                  {formatRC(selectedRC)} Registry · Tagged{' '}
                  {taggedCadets.filter(c => c.status === tagSheetCategory.cadetStatus).length} of{' '}
                  {counts[tagSheetCategory.key]}
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
                courseNumber={selectedRC}
                disabledCadets={taggedCadets.map(c => ({ name: c.name, squad: c.squad }))}
                disabledBadgeLabel="Tagged"
                onSelect={cadet => {
                  handleTagCadet(cadet);
                }}
              />
            </div>
          </div>
        </div>
      )}

      <SubmissionPreview
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        onConfirm={commitSubmission}
        title={`Review ${formatRC(selectedRC)} Tattoo State`}
        type="parade"
        data={previewData}
      />
    </div>
  );
};
