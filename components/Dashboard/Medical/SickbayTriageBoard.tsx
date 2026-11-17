import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Send,
  Stethoscope,
  User,
  Shield,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../../context/AuthContext';
import { dbService } from '../../../services/dbService';
import { SickbayVerification, MedicalVerificationStatus } from '../../../types';
import { toast } from 'react-hot-toast';

// ─── Quick-note presets for "Not Admitted" remark ──────────────────────
const QUICK_NOTES = [
  'Cadet not present in sickbay during roll call',
  'No clinic intake record found today',
  'Found in hostel during medical sweep',
  'Cadet left without medical clearance'
] as const;

// ─── Recipient options ─────────────────────────────────────────────────
const RECIPIENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'commandant', label: 'Commandant' },
  { value: 'dfs', label: 'Director of Field Studies (DFS)' },
  { value: 'course_officer', label: 'Course Officer' }
];

type StatusFilter = 'all' | MedicalVerificationStatus;

// ─── Main Component ────────────────────────────────────────────────────
export const SickbayTriageBoard: React.FC = () => {
  const { currentUser } = useAuth();

  // ── Data state ───────────────────────────────────────────────────────
  const [verifications, setVerifications] = useState<SickbayVerification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // ── Inline action state (per-card) ───────────────────────────────────
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [remarkRecipient, setRemarkRecipient] = useState('commandant');
  const [remarkNote, setRemarkNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);

  // ── Fetch data ───────────────────────────────────────────────────────
  const loadVerifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await dbService.fetchSickbayVerifications({
        status: activeFilter === 'all' ? undefined : activeFilter,
        searchTerm: searchTerm.trim() || undefined
      });
      setVerifications(data);
    } catch {
      toast.error('Failed to load verifications');
    } finally {
      setIsLoading(false);
    }
  }, [activeFilter, searchTerm]);

  useEffect(() => {
    loadVerifications();
  }, [loadVerifications]);

  // Listen for realtime updates
  useEffect(() => {
    const handler = () => loadVerifications();
    window.addEventListener('sickbay-verifications-updated', handler);
    return () => window.removeEventListener('sickbay-verifications-updated', handler);
  }, [loadVerifications]);

  // ── Counts ───────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const all = verifications.length;
    // We need unfiltered counts — re-fetch once or count from full set
    // Since filters are applied at fetch, keep a separate unfiltered list
    return {
      pending: 0,
      admitted: 0,
      notAdmitted: 0,
      total: all
    };
  }, [verifications]);

  // For KPI counts, we fetch all statuses separately
  const [kpiCounts, setKpiCounts] = useState({ pending: 0, admitted: 0, notAdmitted: 0 });

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [pending, admitted, notAdmitted] = await Promise.all([
          dbService.fetchSickbayVerifications({ status: 'pending_verification' }),
          dbService.fetchSickbayVerifications({ status: 'admitted' }),
          dbService.fetchSickbayVerifications({ status: 'not_admitted' })
        ]);
        setKpiCounts({
          pending: pending.length,
          admitted: admitted.length,
          notAdmitted: notAdmitted.length
        });
      } catch {}
    };
    fetchCounts();
  }, [verifications]); // recalculate when verifications change

  // ── Handle binary verification ───────────────────────────────────────
  const handleVerify = async (
    verification: SickbayVerification,
    status: 'admitted' | 'not_admitted'
  ) => {
    if (!currentUser) return;
    setIsSubmitting(verification.id);

    if (status === 'not_admitted') {
      // Expand the remark composer
      setExpandedCardId(verification.id);
      setIsSubmitting(null);
      return;
    }

    try {
      await dbService.verifySickbayCadet({
        verificationId: verification.id,
        medicalOfficerId: String(currentUser.id),
        status: 'admitted'
      });
      toast.success(`${verification.cadetName} marked as Admitted`);
      window.dispatchEvent(new CustomEvent('sickbay-verifications-updated'));
      await loadVerifications();
    } catch {
      toast.error('Verification failed. Please try again.');
    } finally {
      setIsSubmitting(null);
    }
  };

  // ── Submit Not Admitted with remark ──────────────────────────────────
  const handleSubmitNotAdmitted = async (verification: SickbayVerification) => {
    if (!currentUser || !remarkNote.trim()) {
      toast.error('Please add a remark before sending.');
      return;
    }
    setIsSubmitting(verification.id);
    try {
      await dbService.verifySickbayCadet({
        verificationId: verification.id,
        medicalOfficerId: String(currentUser.id),
        status: 'not_admitted',
        clinicalNote: remarkNote.trim(),
        targetedRecipientRole: remarkRecipient as 'commandant' | 'dfs' | 'course_officer'
      });
      toast.success(`${verification.cadetName} marked Not Admitted — remark sent`);
      setExpandedCardId(null);
      setRemarkNote('');
      setRemarkRecipient('commandant');
      window.dispatchEvent(new CustomEvent('sickbay-verifications-updated'));
      await loadVerifications();
    } catch {
      toast.error('Failed to submit verification. Please try again.');
    } finally {
      setIsSubmitting(null);
    }
  };

  // ── Status badge helper ──────────────────────────────────────────────
  const statusConfig: Record<MedicalVerificationStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
    pending_verification: {
      label: 'Pending',
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-700',
      icon: <Clock size={13} className="text-amber-500" />
    },
    admitted: {
      label: 'Admitted',
      bg: 'bg-emerald-50 border-emerald-200',
      text: 'text-emerald-700',
      icon: <CheckCircle2 size={13} className="text-emerald-500" />
    },
    not_admitted: {
      label: 'Not Admitted',
      bg: 'bg-rose-50 border-rose-200',
      text: 'text-rose-700',
      icon: <XCircle size={13} className="text-rose-500" />
    }
  };

  // ── Filter pills ─────────────────────────────────────────────────────
  const filterPills: { key: StatusFilter; label: string; count: number; color: string; activeColor: string }[] = [
    { key: 'pending_verification', label: 'Pending', count: kpiCounts.pending, color: 'text-amber-600', activeColor: 'bg-amber-500 text-white shadow-[0_0_12px_rgba(245,158,11,0.3)]' },
    { key: 'admitted', label: 'Admitted', count: kpiCounts.admitted, color: 'text-emerald-600', activeColor: 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]' },
    { key: 'not_admitted', label: 'Not Admitted', count: kpiCounts.notAdmitted, color: 'text-rose-600', activeColor: 'bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.3)]' }
  ];

  return (
    <div className="min-h-full bg-slate-50">
      {/* ── Header area ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        {/* KPI Filter Pills */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {filterPills.map(pill => (
              <button
                key={pill.key}
                onClick={() => setActiveFilter(activeFilter === pill.key ? 'all' : pill.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                  activeFilter === pill.key
                    ? pill.activeColor + ' border-transparent'
                    : 'bg-white border-slate-200 hover:border-slate-300 ' + pill.color
                }`}
              >
                <span>{pill.label}</span>
                <span className={`font-mono text-[11px] ${
                  activeFilter === pill.key ? 'opacity-90' : 'opacity-70'
                }`}>
                  {pill.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Search bar */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search cadet, RC, or squad..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
        </div>
      </div>

      {/* ── Card List ───────────────────────────────────────────────── */}
      <div className="px-4 py-4 space-y-3 pb-28">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400 font-medium">Loading verifications...</p>
          </div>
        ) : verifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">
              {activeFilter === 'all' ? 'No verifications found' : `No ${activeFilter.replace('_', ' ')} cases`}
            </p>
            <p className="text-xs text-slate-400">
              {activeFilter !== 'all' ? 'Try a different filter' : 'Sick cadets will appear here automatically'}
            </p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {verifications.map((v) => {
              const cfg = statusConfig[v.status];
              const isExpanded = expandedCardId === v.id;
              const isCardSubmitting = isSubmitting === v.id;
              const dateStr = v.paradeDate
                ? new Date(v.paradeDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                : '';

              return (
                <motion.div
                  key={v.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.2 }}
                  className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition-shadow hover:shadow-md ${cfg.bg}`}
                >
                  {/* Card header */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                          <User size={18} className="text-slate-400" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 truncate">{v.cadetName}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-[10px] font-bold text-blue-700 border border-blue-100">
                              RC {v.courseNumber}
                            </span>
                            {v.squad && (
                              <span className="text-[10px] text-slate-400 font-medium">{v.squad}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Status pill */}
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border shrink-0 ${cfg.bg} ${cfg.text}`}>
                        {cfg.icon}
                        {cfg.label}
                      </span>
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Stethoscope size={11} className="shrink-0" />
                        {v.paradeType?.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      {dateStr && <span>•</span>}
                      {dateStr && <span>{dateStr}</span>}
                      <span>•</span>
                      <span className="truncate">{v.reportedByOfficer}</span>
                    </div>

                    {/* Verified info (for already-verified cards) */}
                    {v.status !== 'pending_verification' && v.medicalOfficerName && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                        <p className="text-[11px] text-slate-500">
                          <span className="font-semibold">Verified by:</span>{' '}
                          {v.medicalOfficerName}
                          {v.verifiedAt && (
                            <span className="text-slate-400 ml-1">
                              • {new Date(v.verifiedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </p>
                        {v.clinicalNote && (
                          <p className="mt-1 text-[11px] text-slate-600 italic bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                            "{v.clinicalNote}"
                          </p>
                        )}
                      </div>
                    )}

                    {/* Binary action buttons (only for pending) */}
                    {v.status === 'pending_verification' && !isExpanded && (
                      <div className="grid grid-cols-2 gap-2.5 mt-3.5">
                        <button
                          onClick={() => handleVerify(v, 'admitted')}
                          disabled={!!isCardSubmitting}
                          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold transition-all disabled:opacity-50"
                        >
                          <CheckCircle2 size={15} />
                          Admitted
                        </button>
                        <button
                          onClick={() => handleVerify(v, 'not_admitted')}
                          disabled={!!isCardSubmitting}
                          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold transition-all disabled:opacity-50"
                        >
                          <XCircle size={15} />
                          Not Admitted
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── Expanded remark composer ────────────────────────── */}
                  <AnimatePresence>
                    {isExpanded && v.status === 'pending_verification' && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-rose-200 bg-rose-50/50 overflow-hidden"
                      >
                        <div className="p-4 space-y-3">
                          {/* Alert bar */}
                          <div className="flex items-center gap-2 text-rose-700 bg-rose-100 rounded-xl px-3 py-2 border border-rose-200">
                            <AlertTriangle size={14} className="shrink-0" />
                            <p className="text-[11px] font-semibold">Cadet not found in sickbay — send a remark to leadership</p>
                          </div>

                          {/* Recipient dropdown */}
                          <div className="relative">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                              Send remark to
                            </label>
                            <div className="relative">
                              <select
                                value={remarkRecipient}
                                onChange={e => setRemarkRecipient(e.target.value)}
                                className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2.5 pr-8 text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
                              >
                                {RECIPIENT_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                          </div>

                          {/* Quick-note chips */}
                          <div>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Quick notes</p>
                            <div className="flex flex-wrap gap-1.5">
                              {QUICK_NOTES.map(note => (
                                <button
                                  key={note}
                                  type="button"
                                  onClick={() => setRemarkNote(note)}
                                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                                    remarkNote === note
                                      ? 'bg-rose-600 text-white border-rose-600'
                                      : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300 hover:text-rose-700'
                                  }`}
                                >
                                  {note}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Text input */}
                          <div>
                            <textarea
                              value={remarkNote}
                              onChange={e => setRemarkNote(e.target.value)}
                              placeholder="Add remark or clinical note..."
                              rows={2}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 resize-none"
                            />
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setExpandedCardId(null);
                                setRemarkNote('');
                              }}
                              className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSubmitNotAdmitted(v)}
                              disabled={!remarkNote.trim() || !!isCardSubmitting}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all disabled:opacity-50"
                            >
                              {isCardSubmitting ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <>
                                  <Send size={13} />
                                  Send Remark
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

