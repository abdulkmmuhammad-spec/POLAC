import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ArrowLeft,
  AlertTriangle,
  ShieldCheck,
  Trash2,
  Download,
  Lock,
  Eye,
  EyeOff,
  Check,
  Loader2
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../../../context/AuthContext';
import { dbService } from '../../../services/dbService';
import { downloadCourseBackupCSV } from '../../../services/cadetImportService';
import { acquireScrollLock, releaseScrollLock } from '../../../utils/scrollLock';
import { toast } from 'react-hot-toast';

type WipeStep = 'overview' | 'confirm' | 'success';

interface FullWipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWipeComplete: () => void;
}

export const FullWipeModal: React.FC<FullWipeModalProps> = ({
  isOpen,
  onClose,
  onWipeComplete
}) => {
  const { currentUser } = useAuth();
  const shouldReduceMotion = useReducedMotion();

  const [step, setStep] = useState<WipeStep>('overview');
  const [acknowledged, setAcknowledged] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [wipeSummary, setWipeSummary] = useState<{
    deletedCadets?: number;
    deletedParadeRecords?: number;
    deletedOfficers?: number;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep('overview');
    setAcknowledged(false);
    setPhrase('');
    setAdminPassword('');
    setShowPassword(false);
    setIsWiping(false);
    setWipeSummary(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    acquireScrollLock();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isWiping) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseScrollLock();
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, isWiping, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const isPhraseValid = phrase.trim().toUpperCase() === 'WIPE ALL DATA';
  const canExecuteWipe = acknowledged && isPhraseValid && adminPassword.trim().length > 0 && !isWiping;

  const handleDownloadBackup = async () => {
    setIsExportingBackup(true);
    try {
      const cadets = await dbService.getAllCadetsForBackup();
      if (!cadets || cadets.length === 0) {
        toast('No cadets currently in registry to back up.');
        return;
      }
      const courseNumbers = Array.from(
        new Set(
          cadets
            .map((c: any) => Number(c.course_number))
            .filter((n: number) => Number.isFinite(n) && n > 0)
        )
      );
      const filename = downloadCourseBackupCSV(cadets, courseNumbers);
      toast.success(`Backup saved (${cadets.length} cadets): ${filename}`);
    } catch {
      toast.error('Failed to export backup.');
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleExecuteWipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id || !canExecuteWipe) return;

    setIsWiping(true);
    try {
      const summary = await dbService.wipeApplicationData({
        adminId: String(currentUser.id),
        currentPassword: adminPassword,
        confirmationPhrase: phrase.trim(),
        callerIdentity: {
          email: currentUser.email,
          username: currentUser.username
        }
      });

      setWipeSummary(summary);
      setAdminPassword('');
      setStep('success');
      onWipeComplete();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to wipe application data.');
    } finally {
      setIsWiping(false);
    }
  };

  const springTransition = shouldReduceMotion
    ? { duration: 0.12 }
    : { type: 'spring' as const, stiffness: 380, damping: 34 };

  return createPortal(
    <AnimatePresence>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Wipe Application Data"
        data-drawer-open="true"
        className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => !isWiping && onClose()}
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
        />

        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.96 }}
          animate={{ y: 0, opacity: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.96 }}
          transition={springTransition}
          className="relative z-10 w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 max-h-[88dvh] flex flex-col overflow-hidden"
        >
          {/* Mobile Grabber */}
          <div className="pt-2.5 pb-1 sm:hidden flex justify-center shrink-0">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>

          {/* Header */}
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {step === 'confirm' && (
                <button
                  type="button"
                  disabled={isWiping}
                  onClick={() => setStep('overview')}
                  className="min-w-[40px] min-h-[40px] -ml-2 px-2 inline-flex items-center gap-1 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-semibold transition-colors"
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
              )}
              <h3 className="text-base font-bold text-slate-900 truncate">
                {step === 'overview'
                  ? 'Wipe Application Data'
                  : step === 'confirm'
                  ? 'Confirm Permanent Wipe'
                  : 'Application Reset Complete'}
              </h3>
            </div>

            <button
              type="button"
              disabled={isWiping}
              onClick={onClose}
              aria-label="Close"
              className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto">
            <AnimatePresence mode="wait" initial={false}>
              {/* ── STEP 1: IMPACT OVERVIEW & OPTIONAL BACKUP ── */}
              {step === 'overview' && (
                <motion.div
                  key="overview"
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                  transition={{ duration: 0.16 }}
                  className="space-y-4"
                >
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Reset the academy portal to a clean state. Review what will be removed before continuing.
                  </p>

                  {/* 2-Card Scannable Split (Meta Accounts Center / Google Account pattern) */}
                  <div className="space-y-2.5">
                    <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200/80 space-y-1.5">
                      <div className="flex items-center gap-2 text-rose-800">
                        <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                        <span className="text-xs font-bold">Permanently Deleted</span>
                      </div>
                      <p className="text-xs text-rose-900/80 leading-relaxed">
                        All cadets, parade submissions, sickbay logs, command reports, alerts, notifications, audit history, and officer accounts.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                      <div className="flex items-center gap-2 text-slate-800">
                        <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
                        <span className="text-xs font-bold">Preserved (No Lockout)</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Your active <span className="font-semibold text-slate-800">System Administrator</span> account and core portal window settings remain intact.
                      </p>
                    </div>
                  </div>

                  {/* Optional Safety Backup (WhatsApp / Google Takeout pattern) */}
                  <button
                    type="button"
                    disabled={isExportingBackup}
                    onClick={handleDownloadBackup}
                    className="w-full min-h-[46px] px-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    {isExportingBackup ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Download size={15} />
                    )}
                    <span>{isExportingBackup ? 'Preparing Backup...' : 'Download Cadet Backup (CSV) First'}</span>
                  </button>

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
                      onClick={() => setStep('confirm')}
                      className="flex-1 min-h-[46px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold transition-colors"
                    >
                      Continue
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── STEP 2: 3-GATE SAFEGUARDS ── */}
              {step === 'confirm' && (
                <motion.form
                  key="confirm"
                  onSubmit={handleExecuteWipe}
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
                  transition={{ duration: 0.16 }}
                  className="space-y-4"
                >
                  {/* Safeguard 1: Explicit Acknowledgment */}
                  <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={e => setAcknowledged(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 shrink-0"
                    />
                    <span className="text-xs text-slate-700 leading-relaxed font-medium">
                      I understand this permanently erases all academy records, cadets, and officer accounts and cannot be undone.
                    </span>
                  </label>

                  {/* Safeguard 2: Typed Confirmation Phrase */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700">
                        Type <span className="font-mono font-bold text-slate-900">WIPE ALL DATA</span> to confirm
                      </label>
                      {isPhraseValid && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <Check size={12} /> Matched
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={phrase}
                      onChange={e => setPhrase(e.target.value)}
                      placeholder="WIPE ALL DATA"
                      className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-rose-500 rounded-xl px-3.5 py-2 text-base sm:text-sm font-mono text-slate-900 placeholder:text-slate-400 outline-none"
                    />
                  </div>

                  {/* Safeguard 3: Administrator Password */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <Lock size={13} className="text-slate-500" />
                      <span>Administrator Password</span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={adminPassword}
                        onChange={e => setAdminPassword(e.target.value)}
                        placeholder="Enter your password to authorize"
                        className="w-full min-h-[44px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-rose-500 rounded-xl pl-3.5 pr-11 py-2 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(prev => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-1 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={isWiping}
                      onClick={onClose}
                      className="flex-1 min-h-[46px] rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-sm font-semibold transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!canExecuteWipe}
                      className="flex-[1.3] min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold shadow-sm transition-all"
                    >
                      {isWiping ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      <span>{isWiping ? 'Wiping Data...' : 'Wipe All Data'}</span>
                    </button>
                  </div>
                </motion.form>
              )}

              {/* ── STEP 3: SUCCESS RECEIPT ── */}
              {step === 'success' && (
                <motion.div
                  key="success"
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="py-3 text-center space-y-5"
                >
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

                  <div className="space-y-1.5 px-2">
                    <h4 className="text-lg font-bold text-slate-900">Application Data Wiped</h4>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      All academy records, cadet enrollments, and officer accounts have been permanently cleared.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 border border-slate-200/80 px-4 py-3 text-left space-y-1">
                    <p className="text-xs font-semibold text-slate-800">
                      System Administrator account & portal settings preserved
                    </p>
                    {wipeSummary &&
                      (wipeSummary.deletedCadets !== undefined ||
                        wipeSummary.deletedParadeRecords !== undefined) && (
                        <p className="text-xs text-slate-500 tabular-nums">
                          Removed {wipeSummary.deletedCadets ?? 0} cadets,{' '}
                          {wipeSummary.deletedParadeRecords ?? 0} parade records, and{' '}
                          {wipeSummary.deletedOfficers ?? 0} officer accounts.
                        </p>
                      )}
                  </div>

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
