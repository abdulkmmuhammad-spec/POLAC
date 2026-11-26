import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CheckCircle2, ArrowRight, Save } from 'lucide-react';
import { Sidebar } from '../../Layout/Sidebar';
import { Header } from '../../Layout/Header';
import { BottomNav } from '../../Layout/BottomNav';
import { ParadeForm } from '../../Parade/ParadeForm';
import { useAuth } from '../../../context/AuthContext';
import { useParade } from '../../../context/ParadeContext';
import { dbService } from '../../../services/dbService';
import { ParadeType, ParadeGenderSubmission } from '../../../types';
import { formatRC } from '../../../utils/rcHelpers';
import { toast } from 'react-hot-toast';

const getWATDateStr = () => {
  const now = new Date();
  const watOffsetMs = 60 * 60 * 1000;
  return new Date(now.getTime() + watOffsetMs).toISOString().split('T')[0];
};

export const MatronDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const { activeRC } = useParade();

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
  const [lastCompletedRC, setLastCompletedRC] = useState<number | null>(null);

  // Ensure selectedRC stays in activeCourses if activeRC changes
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

  // Sync local input box when switching courses or when strengthsMap loads
  useEffect(() => {
    const existing = strengthsMap[selectedRC];
    setStrengthInput(existing !== undefined ? String(existing) : '');
    setSavedStrengthRC(existing !== undefined ? selectedRC : null);
  }, [selectedRC, strengthsMap]);

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

  const nextUnsubmittedRC = useMemo(() => {
    const currentIdx = activeCourses.indexOf(selectedRC);
    const ordered = [
      ...activeCourses.slice(currentIdx + 1),
      ...activeCourses.slice(0, currentIdx)
    ];
    return ordered.find(rc => getCourseStatus(rc) === 'pending') ?? activeCourses[currentIdx + 1] ?? null;
  }, [activeCourses, selectedRC, submissions, strengthsMap]);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={currentUser?.designation || 'Academy Matron'} />

        <main className="flex-1 overflow-y-auto p-4 pb-32 md:p-8 md:pb-8">
          <div className="max-w-4xl mx-auto space-y-5">
            {/* Mobile-First 5-Course Switcher */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-3">
              {/* Row 1: Title + Progress Badge */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">
                    Matron Parade
                  </h2>
                  <p className="text-xs text-slate-500">
                    Select a Regular Course to log female strength &amp; attendance
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold tabular-nums bg-slate-100 text-slate-800 border border-slate-200/80 shrink-0">
                  {submittedCount} / {activeCourses.length} Submitted
                </span>
              </div>

              {/* Row 2: Horizontal 5-Course Strip */}
              <div
                data-no-page-swipe="true"
                className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5"
              >
                {activeCourses.map(rc => {
                  const status = getCourseStatus(rc);
                  const isSelected = rc === selectedRC;
                  const dotClass =
                    status === 'reconciled'
                      ? 'bg-emerald-500'
                      : status === 'awaiting'
                      ? 'bg-amber-500'
                      : 'bg-slate-300';

                  return (
                    <button
                      key={rc}
                      type="button"
                      onClick={() => {
                        setSelectedRC(rc);
                        setLastCompletedRC(null);
                      }}
                      className={`min-w-[76px] min-h-[44px] shrink-0 px-3 py-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                      <span className="tabular-nums">{formatRC(rc)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Course-to-Course Advancement Banner */}
            {lastCompletedRC === selectedRC && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-emerald-950">
                      {formatRC(selectedRC)} Female State Submitted
                    </p>
                    <p className="text-xs text-emerald-800">
                      {getCourseStatus(selectedRC) === 'reconciled'
                        ? 'Combined with the Course Officer submission and filed.'
                        : `Sent to ${formatRC(selectedRC)} Course Officer for auto-combination.`}
                    </p>
                  </div>
                </div>
                {nextUnsubmittedRC !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRC(nextUnsubmittedRC);
                      setLastCompletedRC(null);
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                  >
                    <span>Continue to {formatRC(nextUnsubmittedRC)}</span>
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )}

            {/* Per-Course Female Strength Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label
                  htmlFor="matron-female-strength"
                  className="block text-sm font-bold text-slate-900"
                >
                  {formatRC(selectedRC)} Female Strength
                </label>
                <p className="text-xs text-slate-500">
                  Total female cadets in {formatRC(selectedRC)} (enter 0 if none)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="matron-female-strength"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="e.g. 48"
                  value={strengthInput}
                  onChange={e => {
                    setStrengthInput(e.target.value);
                    setSavedStrengthRC(null);
                  }}
                  onBlur={e => handleSaveStrength(e.target.value)}
                  className="w-28 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-600 text-base font-bold text-slate-900 tabular-nums outline-none transition-colors"
                />
                <button
                  type="button"
                  disabled={isSavingStrength || strengthInput.trim() === ''}
                  onClick={() => handleSaveStrength(strengthInput)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-xs font-bold text-slate-800 flex items-center gap-1.5 transition-colors"
                >
                  <Save size={14} />
                  <span>
                    {isSavingStrength
                      ? 'Saving...'
                      : savedStrengthRC === selectedRC
                      ? 'Saved'
                      : 'Save'}
                  </span>
                </button>
              </div>
            </div>

            {/* Identical ParadeForm Submission Interface */}
            <ParadeForm
              overrideCourseNumber={selectedRC}
              overrideTotalCadets={parsedStrength}
              submissionSegment="female"
              externalDate={selectedDate}
              externalParadeType={selectedParadeType}
              onDateChange={setSelectedDate}
              onSubmittedSuccess={() => {
                setLastCompletedRC(selectedRC);
                loadMatronData();
              }}
            />
          </div>
        </main>

        <BottomNav />
      </div>
    </div>
  );
};
