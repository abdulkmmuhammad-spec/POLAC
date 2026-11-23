import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  GraduationCap,
  RefreshCw,
  ShieldAlert,
  AlertTriangle,
  ChevronRight,
  X
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GraduationPanel } from './GraduationPanel';
import { HandoverWizard } from './HandoverWizard';
import { BulkCoursePurgeModal } from '../../CadetRegistry/BulkCoursePurgeModal';
import { FullWipeModal } from './FullWipeModal';
import { acquireScrollLock, releaseScrollLock } from '../../../utils/scrollLock';

type ActiveLifecycleSheet = 'graduation' | 'handover' | null;

interface CourseLifecycleViewProps {
  activeRC: number;
  onDataChanged: () => void;
  onWipeComplete: () => void;
}

export const CourseLifecycleView: React.FC<CourseLifecycleViewProps> = ({
  activeRC,
  onDataChanged,
  onWipeComplete
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [activeSheet, setActiveSheet] = useState<ActiveLifecycleSheet>(null);
  const [incomingRC, setIncomingRC] = useState<number | null>(null);
  const [isBulkPurgeOpen, setIsBulkPurgeOpen] = useState(false);
  const [isFullWipeOpen, setIsFullWipeOpen] = useState(false);

  useEffect(() => {
    if (!activeSheet) return;
    acquireScrollLock();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveSheet(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseScrollLock();
      window.removeEventListener('keydown', onKey);
    };
  }, [activeSheet]);

  const springTransition = shouldReduceMotion
    ? { duration: 0.12 }
    : { type: 'spring' as const, stiffness: 380, damping: 34 };

  return (
    <div className="space-y-6">
      {/* ── GROUP 1: ACADEMIC & COMMAND OPERATIONS ── */}
      <section aria-label="Academic and Command Operations" className="space-y-2">
        <div className="px-1">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Academic & Command Operations
          </h4>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
          <button
            type="button"
            onClick={() => setActiveSheet('graduation')}
            className="w-full min-h-[68px] px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 active:bg-slate-100 text-left transition-colors"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                <GraduationCap size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">
                  Regular Course Graduation
                </p>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  Archive a graduating Regular Course and advance remaining intakes
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => setActiveSheet('handover')}
            className="w-full min-h-[68px] px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 active:bg-slate-100 text-left transition-colors"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                <RefreshCw size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">
                  Change of Command Handover
                </p>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  Transfer a Regular Course to a newly commissioned officer
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-400 shrink-0" />
          </button>
        </div>
      </section>

      {/* ── GROUP 2: DANGER ZONE ── */}
      <section aria-label="Danger Zone" className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
            Danger Zone
          </h4>
          <span className="text-[11px] font-semibold text-rose-600">
            Irreversible Actions
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-rose-200/90 overflow-hidden divide-y divide-rose-100">
          <button
            type="button"
            onClick={() => setIsBulkPurgeOpen(true)}
            className="w-full min-h-[68px] px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-rose-50/50 active:bg-rose-50 text-left transition-colors"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <ShieldAlert size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">
                  Bulk Course Purge & Re-Enrollment
                </p>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  Clear a course roster and optionally upload a corrected list
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-rose-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => setIsFullWipeOpen(true)}
            className="w-full min-h-[68px] px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-rose-50/50 active:bg-rose-50 text-left transition-colors"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-rose-700 truncate">
                    Wipe Application Data
                  </p>
                  <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold shrink-0">
                    Factory Reset
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  Erase all cadets, parades, alerts, and officer accounts
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-rose-400 shrink-0" />
          </button>
        </div>
      </section>

      {/* ── FOCUSED LIFECYCLE OPERATION SHEET (Graduation / Handover) ── */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {activeSheet && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label={
                  activeSheet === 'graduation'
                    ? 'Regular Course Graduation'
                    : 'Change of Command Handover'
                }
                data-drawer-open="true"
                className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => setActiveSheet(null)}
                  className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs"
                />

                <motion.div
                  initial={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.96 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.96 }}
                  transition={springTransition}
                  className="relative z-10 w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 max-h-[88dvh] flex flex-col overflow-hidden"
                >
                  <div className="pt-2.5 pb-1 sm:hidden flex justify-center shrink-0">
                    <div className="w-10 h-1 bg-slate-300 rounded-full" />
                  </div>

                  <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
                    <h3 className="text-base font-bold text-slate-900 truncate">
                      {activeSheet === 'graduation'
                        ? 'Regular Course Graduation'
                        : 'Change of Command Handover'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveSheet(null)}
                      aria-label="Close"
                      className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="p-4 sm:p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto">
                    {activeSheet === 'graduation' ? (
                      <GraduationPanel
                        onCommissionIncoming={newRC => {
                          setIncomingRC(newRC);
                          setActiveSheet('handover');
                        }}
                      />
                    ) : (
                      <HandoverWizard
                        prefilledTargetRC={incomingRC}
                        onClearPrefill={() => setIncomingRC(null)}
                      />
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* ── BULK COURSE PURGE MODAL ── */}
      <BulkCoursePurgeModal
        isOpen={isBulkPurgeOpen}
        onClose={() => setIsBulkPurgeOpen(false)}
        activeRC={activeRC}
        onPurgeAndSeedComplete={onDataChanged}
      />

      {/* ── FULL APPLICATION WIPE MODAL ── */}
      <FullWipeModal
        isOpen={isFullWipeOpen}
        onClose={() => setIsFullWipeOpen(false)}
        onWipeComplete={onWipeComplete}
      />
    </div>
  );
};
