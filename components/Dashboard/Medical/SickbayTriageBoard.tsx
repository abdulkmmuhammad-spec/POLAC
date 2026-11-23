import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  CheckCircle2,
  XCircle,
  Send,
  ChevronRight,
  RotateCcw,
  X
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../../../context/AuthContext';
import { dbService } from '../../../services/dbService';
import { SickbayVerification } from '../../../types';
import { formatRC } from '../../../utils/rcHelpers';
import { SickbayChatDrawer } from './SickbayChatDrawer';
import { acquireScrollLock, releaseScrollLock } from '../../../utils/scrollLock';
import { toast } from 'react-hot-toast';

const QUICK_NOTES = [
  'Not in sickbay during roll call',
  'No clinic record today',
  'Found in hostel'
] as const;

const RECIPIENT_OPTIONS: { value: 'dfs' | 'course_officer'; label: string }[] = [
  { value: 'dfs', label: 'Director Field Studies' },
  { value: 'course_officer', label: 'Course Officer' }
];

type TriageTab = 'pending_verification' | 'admitted' | 'not_admitted';

/**
 * SickbayTriageBoard — Mobile-First Binary Triage (PRD v3.0).
 * Modeled after Apple Reminders & iOS Triage Queues:
 *   - 3-segment control defaulting to "To Check"
 *   - Ultra-clean 2-line cards (<= 4 data points)
 *   - 4-second Undo toast on Admitted
 *   - Focused iOS Bottom Sheet for Not Admitted escalation
 */
export const SickbayTriageBoard: React.FC = () => {
  const { currentUser } = useAuth();
  const shouldReduceMotion = useReducedMotion();

  const [allVerifications, setAllVerifications] = useState<SickbayVerification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TriageTab>('pending_verification');
  const [searchTerm, setSearchTerm] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  // Flag Not Admitted bottom sheet state
  const [sheetTarget, setSheetTarget] = useState<SickbayVerification | null>(null);
  const [remarkRecipient, setRemarkRecipient] = useState<'dfs' | 'course_officer'>('dfs');
  const [remarkNote, setRemarkNote] = useState('');
  const [isSendingAlert, setIsSendingAlert] = useState(false);

  // Direct chat drawer state for verified tabs
  const [activeChat, setActiveChat] = useState<SickbayVerification | null>(null);

  const loadVerifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await dbService.fetchSickbayVerifications();
      setAllVerifications(data);
    } catch {
      toast.error('Failed to load sickbay verifications.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVerifications();
    const handler = () => loadVerifications();
    window.addEventListener('sickbay-verifications-updated', handler);
    return () => window.removeEventListener('sickbay-verifications-updated', handler);
  }, [loadVerifications]);

  // Body scroll lock while bottom sheet is open
  useEffect(() => {
    if (!sheetTarget) return;
    acquireScrollLock();
    return () => {
      releaseScrollLock();
    };
  }, [sheetTarget]);

  const counts = useMemo(
    () => ({
      pending: allVerifications.filter(v => v.status === 'pending_verification').length,
      admitted: allVerifications.filter(v => v.status === 'admitted').length,
      notAdmitted: allVerifications.filter(v => v.status === 'not_admitted').length
    }),
    [allVerifications]
  );

  const visibleList = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allVerifications.filter(v => {
      if (v.status !== activeTab) return false;
      if (!q) return true;
      return (
        v.cadetName.toLowerCase().includes(q) ||
        (v.squad || '').toLowerCase().includes(q) ||
        `rc ${v.courseNumber}`.includes(q)
      );
    });
  }, [allVerifications, activeTab, searchTerm]);

  const handleUndoAdmit = async (verification: SickbayVerification, toastId: string) => {
    if (!currentUser) return;
    toast.dismiss(toastId);
    try {
      await dbService.verifySickbayCadet({
        verificationId: verification.id,
        medicalOfficerId: String(currentUser.id),
        status: 'pending_verification'
      });
      toast.success(`Reverted ${verification.cadetName} to Pending`);
      window.dispatchEvent(new CustomEvent('sickbay-verifications-updated'));
      await loadVerifications();
    } catch {
      toast.error('Could not undo verification.');
    }
  };

  const handleAdmit = async (verification: SickbayVerification) => {
    if (!currentUser || submittingId) return;
    setSubmittingId(verification.id);
    try {
      await dbService.verifySickbayCadet({
        verificationId: verification.id,
        medicalOfficerId: String(currentUser.id),
        status: 'admitted'
      });

      window.dispatchEvent(new CustomEvent('sickbay-verifications-updated'));
      await loadVerifications();

      toast(
        t => (
          <div className="flex items-center gap-3">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span className="text-xs font-semibold text-slate-900">
              Marked {verification.cadetName} as Admitted
            </span>
            <button
              type="button"
              onClick={() => handleUndoAdmit(verification, t.id)}
              className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold inline-flex items-center gap-1 shrink-0 hover:bg-slate-800"
            >
              <RotateCcw size={12} />
              Undo
            </button>
          </div>
        ),
        { duration: 4000 }
      );
    } catch {
      toast.error('Verification failed. Please try again.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleOpenSheet = (verification: SickbayVerification) => {
    setSheetTarget(verification);
    setRemarkRecipient('dfs');
    setRemarkNote('');
  };

  const handleSendAlert = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!sheetTarget || !currentUser || isSendingAlert) return;

    const finalNote = remarkNote.trim() || 'Not in sickbay during roll call';
    setIsSendingAlert(true);
    try {
      await dbService.verifySickbayCadet({
        verificationId: sheetTarget.id,
        medicalOfficerId: String(currentUser.id),
        status: 'not_admitted',
        clinicalNote: finalNote,
        targetedRecipientRole: remarkRecipient
      });
      toast.success(`Alert sent for ${sheetTarget.cadetName}`);
      setSheetTarget(null);
      setRemarkNote('');
      window.dispatchEvent(new CustomEvent('sickbay-verifications-updated'));
      await loadVerifications();
    } catch {
      toast.error('Failed to send alert. Please try again.');
    } finally {
      setIsSendingAlert(false);
    }
  };

  const formatCardDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const todayISO = new Date().toISOString().split('T')[0];
    if (dateStr === todayISO) return 'Today';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const formatParadeLabel = (paradeType?: string) => {
    if (!paradeType) return 'Muster';
    const clean = paradeType.replace(/_/g, ' ').toLowerCase();
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  };

  return (
    <div className="space-y-4">
      {/* ── 3-Segment Control & Compact Search ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-3.5 space-y-3">
        {/* 3-Segment Control */}
        <div
          data-no-page-swipe="true"
          className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl"
        >
          {(
            [
              { key: 'pending_verification', label: `Pending (${counts.pending})` },
              { key: 'admitted', label: `Admitted (${counts.admitted})` },
              { key: 'not_admitted', label: `Not Admitted (${counts.notAdmitted})` }
            ] as const
          ).map(seg => {
            const isActive = activeTab === seg.key;
            return (
              <button
                key={seg.key}
                type="button"
                onClick={() => setActiveTab(seg.key)}
                className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-semibold truncate transition-all ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {seg.label}
              </button>
            );
          })}
        </div>

        {/* Compact Search (16px text-base prevents iOS auto-zoom) */}
        <div className="relative flex items-center">
          <Search size={16} className="absolute left-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search cadet or RC..."
            className="w-full min-h-[44px] pl-10 pr-10 py-2 bg-slate-100/80 focus:bg-white border border-transparent focus:border-slate-300 rounded-full text-base sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
              className="absolute right-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* ── Triage Cards ── */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-700 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Loading sickbay queue...</p>
        </div>
      ) : visibleList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 size={24} />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            {activeTab === 'pending_verification'
              ? 'All cadets verified'
              : activeTab === 'admitted'
              ? 'No admitted cadets'
              : 'No unverified absences'}
          </h3>
          <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
            {activeTab === 'pending_verification'
              ? 'Cadets marked sick on any parade state will appear here automatically.'
              : 'Records in this category will appear here once processed.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleList.map(v => {
            const isCardSubmitting = submittingId === v.id;
            const line2 = [
              v.squad ? `Squad ${v.squad}` : null,
              formatParadeLabel(v.paradeType),
              formatCardDate(v.paradeDate)
            ]
              .filter(Boolean)
              .join(' • ');

            return (
              <div
                key={v.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 space-y-3.5"
              >
                {/* Line 1: Cadet Full Name + [RC X] */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-900 truncate">
                      {v.cadetName}
                    </h3>
                    {/* Line 2: Squad • Parade • Date */}
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {line2}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-100 text-[11px] font-bold shrink-0">
                    {formatRC(v.courseNumber)}
                  </span>
                </div>

                {/* Action Row for "To Check" */}
                {activeTab === 'pending_verification' ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleAdmit(v)}
                      disabled={Boolean(isCardSubmitting)}
                      className="min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-bold transition-all disabled:opacity-50"
                    >
                      <CheckCircle2 size={16} />
                      <span>Admitted</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenSheet(v)}
                      disabled={Boolean(isCardSubmitting)}
                      className="min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white text-xs font-bold transition-all disabled:opacity-50"
                    >
                      <XCircle size={16} />
                      <span>Not Admitted</span>
                    </button>
                  </div>
                ) : (
                  /* Admitted / Not Admitted Tabs: 1-line note preview + Chat › row trigger */
                  <button
                    type="button"
                    onClick={() => setActiveChat(v)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-between gap-3 text-left transition-colors"
                  >
                    <p className="text-xs text-slate-600 truncate">
                      {v.clinicalNote
                        ? v.clinicalNote
                        : v.status === 'admitted'
                        ? 'Verified at sickbay'
                        : 'Flagged not admitted'}
                    </p>
                    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-blue-700 shrink-0">
                      <span>Chat</span>
                      <ChevronRight size={15} />
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Focused iOS Bottom Sheet: Flag Not Admitted ── */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {sheetTarget && (
              <div
                role="dialog"
                aria-modal="true"
                data-drawer-open="true"
                className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center"
              >
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  onClick={() => !isSendingAlert && setSheetTarget(null)}
                  className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
                />

                {/* Sheet Container */}
                <motion.form
                  onSubmit={handleSendAlert}
                  initial={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.9 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.9 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0.12 }
                      : { type: 'spring', stiffness: 360, damping: 32 }
                  }
                  className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4"
                >
                  {/* Mobile Grabber */}
                  <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto -mt-1 sm:hidden" />

                  {/* 1. Header */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-slate-900">
                        Flag Not Admitted
                      </h3>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {sheetTarget.cadetName} ({formatRC(sheetTarget.courseNumber)})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSheetTarget(null)}
                      aria-label="Close"
                      className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* 2. Who to notify (3 Segmented Pills) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Who to notify
                    </label>
                    <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                      {RECIPIENT_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setRemarkRecipient(opt.value)}
                          className={`min-h-[44px] px-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                            remarkRecipient === opt.value
                              ? 'bg-rose-600 text-white shadow-2xs font-bold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Reason (1-Tap Quick Chips + Optional Input) */}
                  <div className="space-y-2.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Reason
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_NOTES.map(note => (
                        <button
                          key={note}
                          type="button"
                          onClick={() => setRemarkNote(note)}
                          className={`min-h-[38px] px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            remarkNote === note
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-rose-300'
                          }`}
                        >
                          {note}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      value={remarkNote}
                      onChange={e => setRemarkNote(e.target.value)}
                      placeholder="Add specific note..."
                      className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-rose-500 rounded-xl px-3.5 py-2 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all"
                    />
                  </div>

                  {/* 4. Primary CTA */}
                  <button
                    type="submit"
                    disabled={isSendingAlert}
                    className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-sm transition-all disabled:opacity-50"
                  >
                    {isSendingAlert ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                    <span>{isSendingAlert ? 'Sending Alert...' : 'Send Alert'}</span>
                  </button>
                </motion.form>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* ── WhatsApp-Style Chat Drawer ── */}
      <SickbayChatDrawer
        verification={activeChat}
        onClose={() => setActiveChat(null)}
        onUpdated={updated => {
          setAllVerifications(prev => prev.map(item => (item.id === updated.id ? updated : item)));
          setActiveChat(updated);
        }}
      />
    </div>
  );
};
