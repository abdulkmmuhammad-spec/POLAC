import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ArrowLeft,
  Send,
  CheckCheck,
  CheckCircle2,
  FileText,
  FileDown,
  Loader2,
  Plus
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../../../context/AuthContext';
import { dbService } from '../../../services/dbService';
import { CommandReport } from '../../../types';
import { isDFS } from '../../../utils/commandHierarchy';
import { markExecutiveChatRead, getLatestExecutiveItemMs } from '../../../utils/executiveChatState';
import { exportCommandReportPDF } from './WeeklyCommandReportSheet';
import { toast } from 'react-hot-toast';

interface ExecutiveChatDrawerProps {
  isOpen: boolean;
  partnerTitle: string;
  partnerMonogram: string;
  reports: CommandReport[];
  onClose: () => void;
  onUpdated: (updated: CommandReport) => void;
  onComposeReport?: () => void;
}

const EXEC_QUICK_REPLIES = [
  'Acknowledged, thank you',
  'Brief me in office',
  'Escalate defaulters to Orderly Room',
  'Maintain current supervision'
];

const DFS_QUICK_REPLIES = [
  'Submitting updated parade figures',
  'Following up with Course Officers',
  'Sickbay sweep completed',
  'Report dispatched for review'
];

export const ExecutiveChatDrawer: React.FC<ExecutiveChatDrawerProps> = ({
  isOpen,
  partnerTitle,
  partnerMonogram,
  reports,
  onClose,
  onUpdated,
  onComposeReport
}) => {
  const { currentUser } = useAuth();
  const shouldReduceMotion = useReducedMotion();
  const userIsDFS = isDFS(currentUser);

  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isAckingId, setIsAckingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sort oldest -> newest for WhatsApp chronological reading
  const orderedReports = useMemo(
    () =>
      [...reports].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    [reports]
  );

  const latestReport = orderedReports[orderedReports.length - 1] || null;
  const partnerKey =
    partnerMonogram === 'CMD'
      ? 'commandant'
      : partnerMonogram === 'DCMD'
      ? 'deputy_commandant'
      : 'dfs';

  useEffect(() => {
    if (isOpen && currentUser) {
      markExecutiveChatRead(
        currentUser.id,
        partnerKey,
        getLatestExecutiveItemMs(orderedReports)
      );
    }
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isOpen, orderedReports, latestReport?.messages?.length, currentUser, partnerKey]);

  const handleSendReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentUser || !latestReport || !replyText.trim() || isSending) return;

    const text = replyText.trim();
    setIsSending(true);
    try {
      const res = await dbService.replyCommandReport({
        reportId: latestReport.id,
        senderId: String(currentUser.id),
        senderName: currentUser.fullName,
        senderDesignation: currentUser.designation,
        message: text
      });

      const updated: CommandReport = {
        ...latestReport,
        messages: res.messages || [
          ...(latestReport.messages || []),
          {
            id: `local-${Date.now()}`,
            senderId: String(currentUser.id),
            senderName: currentUser.fullName,
            senderDesignation: currentUser.designation,
            text,
            createdAt: new Date().toISOString()
          }
        ]
      };
      onUpdated(updated);
      setReplyText('');
      window.dispatchEvent(new CustomEvent('command-reports-updated'));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send reply.');
    } finally {
      setIsSending(false);
    }
  };

  const handleAcknowledge = async (report: CommandReport) => {
    if (!currentUser || isAckingId) return;
    setIsAckingId(report.id);
    try {
      const res = await dbService.replyCommandReport({
        reportId: report.id,
        senderId: String(currentUser.id),
        senderName: currentUser.fullName,
        senderDesignation: currentUser.designation,
        message: '',
        acknowledge: true
      });
      const updated: CommandReport = {
        ...report,
        status: 'acknowledged',
        acknowledgedBy: currentUser.fullName,
        acknowledgedAt: new Date().toISOString(),
        messages: res.messages || report.messages
      };
      onUpdated(updated);
      window.dispatchEvent(new CustomEvent('command-reports-updated'));
      toast.success('Weekly Report acknowledged');
    } catch {
      toast.error('Failed to acknowledge report.');
    } finally {
      setIsAckingId(null);
    }
  };

  const quickPrompts = userIsDFS ? DFS_QUICK_REPLIES : EXEC_QUICK_REPLIES;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-open="true"
          className="fixed inset-0 z-[999] flex justify-end"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
          />

          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { x: '100%' }}
            animate={{ x: 0, opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { x: '100%' }}
            transition={
              shouldReduceMotion
                ? { duration: 0.12 }
                : { type: 'spring', damping: 28, stiffness: 300 }
            }
            drag={shouldReduceMotion ? false : 'x'}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 120 || info.velocity.x > 500) {
                onClose();
              }
            }}
            className="relative w-full md:max-w-lg bg-[#efeae2] h-full flex flex-col shadow-2xl z-10 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-blue-900 text-white px-3.5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between gap-3 shrink-0 shadow-md">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Back"
                  className="min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                >
                  <ArrowLeft size={20} className="md:hidden" />
                  <X size={20} className="hidden md:block" />
                </button>

                <div className="w-10 h-10 rounded-full bg-white/15 border border-white/25 flex items-center justify-center font-mono text-xs font-bold shrink-0">
                  {partnerMonogram}
                </div>

                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{partnerTitle}</h3>
                  <p className="text-[11px] text-blue-200 truncate">
                    Executive Command Channel
                  </p>
                </div>
              </div>

              {userIsDFS && onComposeReport && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onComposeReport();
                  }}
                  className="min-h-[38px] px-3 py-1.5 rounded-full bg-white text-blue-900 text-xs font-bold inline-flex items-center gap-1 shrink-0 shadow-2xs"
                >
                  <Plus size={14} />
                  <span>New Report</span>
                </button>
              )}
            </div>

            {/* Stream */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-4 space-y-4">
              {orderedReports.length === 0 ? (
                <div className="text-center py-14 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/80 text-blue-900 flex items-center justify-center mx-auto shadow-2xs">
                    <FileText size={22} />
                  </div>
                  <p className="text-sm font-bold text-slate-800">No Weekly Reports yet</p>
                  <p className="text-xs text-slate-600 max-w-xs mx-auto">
                    {userIsDFS
                      ? 'Generate and send a Weekly Command Report to start this executive chat.'
                      : 'Weekly Command Reports from the Director Field Studies will appear here.'}
                  </p>
                </div>
              ) : (
                orderedReports.map(rep => {
                  const s = rep.summaryPayload;
                  const isAcked = rep.status === 'acknowledged';
                  return (
                    <div key={rep.id} className="space-y-2.5">
                      {/* Structured Weekly Command Report Card */}
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-blue-900 text-white flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText size={15} className="shrink-0 text-blue-200" />
                            <span className="text-xs font-bold truncate">
                              Weekly Command Report ({rep.weekStart} → {rep.weekEnd})
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                              isAcked
                                ? 'bg-emerald-500/25 text-emerald-100 border border-emerald-400/40'
                                : 'bg-amber-400 text-slate-950'
                            }`}
                          >
                            {isAcked ? 'Acknowledged' : 'New Report'}
                          </span>
                        </div>

                        <div className="p-4 space-y-3">
                          <div className="grid grid-cols-4 gap-2 text-center bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                            <div>
                              <p className="text-[10px] text-slate-500 font-medium">Rate</p>
                              <p className="text-sm font-bold text-emerald-700 font-mono">
                                {(s?.attendanceRate ?? 100).toFixed(1)}%
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-500 font-medium">Parades</p>
                              <p className="text-sm font-bold text-slate-900 font-mono">
                                {s?.totalParades ?? 0}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-500 font-medium">Absent</p>
                              <p className="text-sm font-bold text-rose-600 font-mono">
                                {s?.totalAbsent ?? 0}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-500 font-medium">Sick</p>
                              <p className="text-sm font-bold text-amber-700 font-mono">
                                {s?.totalSick ?? 0}
                              </p>
                            </div>
                          </div>

                          {rep.executiveNote && (
                            <p className="text-xs text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 leading-relaxed">
                              {rep.executiveNote}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                exportCommandReportPDF(
                                  rep.weekStart,
                                  rep.weekEnd,
                                  rep.senderName,
                                  s,
                                  rep.executiveNote
                                )
                              }
                              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
                            >
                              <FileDown size={14} />
                              <span>Download PDF</span>
                            </button>

                            {!userIsDFS && !isAcked && (
                              <button
                                type="button"
                                onClick={() => handleAcknowledge(rep)}
                                disabled={isAckingId === rep.id}
                                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {isAckingId === rep.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <CheckCircle2 size={14} />
                                )}
                                <span>Acknowledge</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Follow-up Chat Bubbles */}
                      {(rep.messages || []).map(msg => {
                        const isOwn =
                          currentUser &&
                          (String(msg.senderId) === String(currentUser.id) ||
                            (msg.senderDesignation || '').toLowerCase() ===
                              (currentUser.designation || '').toLowerCase());
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 shadow-2xs ${
                                isOwn
                                  ? 'bg-blue-600 text-white rounded-br-sm'
                                  : 'bg-white text-slate-800 border border-slate-200/70 rounded-bl-sm'
                              }`}
                            >
                              {!isOwn && (
                                <p className="text-[11px] font-bold text-blue-900 mb-0.5">
                                  {msg.senderName}
                                </p>
                              )}
                              <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                                {msg.text}
                              </p>
                              <div
                                className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                                  isOwn ? 'text-blue-100' : 'text-slate-400'
                                }`}
                              >
                                <span>
                                  {new Date(msg.createdAt).toLocaleTimeString([], {
                                    hour: 'numeric',
                                    minute: '2-digit'
                                  })}
                                </span>
                                {isOwn && <CheckCheck size={12} />}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            {/* Sticky Bottom Reply Bar */}
            {latestReport && (
              <div className="bg-slate-100 border-t border-slate-200 p-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2 shrink-0">
                <div
                  data-no-page-swipe="true"
                  className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
                >
                  {quickPrompts.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setReplyText(p)}
                      className="px-2.5 py-1 rounded-full bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 text-xs font-medium whitespace-nowrap shrink-0"
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSendReply} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder={`Message ${partnerTitle}...`}
                    className="flex-1 min-h-[44px] bg-white border border-slate-200 focus:border-blue-600 rounded-full px-4 py-2 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!replyText.trim() || isSending}
                    aria-label="Send message"
                    className="min-w-[44px] min-h-[44px] rounded-full bg-blue-900 hover:bg-blue-800 disabled:opacity-40 text-white flex items-center justify-center shrink-0 shadow-sm transition-colors"
                  >
                    {isSending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
                  </button>
                </form>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

