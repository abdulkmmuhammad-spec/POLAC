import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  X,
  ArrowLeft,
  Send,
  CheckCheck,
  CheckCircle2,
  Stethoscope,
  Loader2,
  CornerUpLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../../context/AuthContext';
import { dbService } from '../../../services/dbService';
import { SickbayVerification, SickbayMessage, UserRole } from '../../../types';
import { formatRC } from '../../../utils/rcHelpers';
import { toast } from 'react-hot-toast';

interface SickbayChatDrawerProps {
  /** Single-cadet thread mode (e.g., from MedicalRemarksCenter or OfficerRemarksCenter) */
  verification?: SickbayVerification | null;
  /** Unified Medical Officer channel mode (Commandant sees all cadets from one MO in one WhatsApp chat) */
  verifications?: SickbayVerification[] | null;
  channelTitle?: string;
  onClose: () => void;
  onUpdated?: (updated: SickbayVerification) => void;
}

interface UnifiedTimelineMessage extends SickbayMessage {
  verificationId: string;
  cadetName: string;
  courseNumber: number;
  squad?: string;
  paradeDate: string;
  paradeType: string;
  disposition: SickbayVerification['status'];
  threadStatus?: SickbayVerification['threadStatus'];
}

const COMMANDANT_QUICK_REPLIES = [
  'Dispatch Provost to hostel',
  'Course Officer to investigate & report',
  'Escalate to Orderly Room',
  'Acknowledged, monitor situation'
];

const OFFICER_QUICK_REPLIES = [
  'Cadet located & escorted to sickbay',
  'Ordering cadet to Orderly Room',
  'Cadet was on authorized duty pass',
  'Following up with Sickbay now'
];

const MEDICAL_QUICK_REPLIES = [
  'Still absent from sickbay',
  'Cadet has now reported to clinic',
  'No clinic intake record found',
  'Cleared & discharged to lines'
];

const formatDateDivider = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (target === todayStart) return 'Today';
  if (target === yesterdayStart) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

export const SickbayChatDrawer: React.FC<SickbayChatDrawerProps> = ({
  verification,
  verifications,
  channelTitle,
  onClose,
  onUpdated
}) => {
  const { currentUser } = useAuth();
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [localItems, setLocalItems] = useState<SickbayVerification[]>([]);
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isUnifiedMode = Boolean(verifications && verifications.length > 0);
  const isOpen = Boolean(verification) || Boolean(verifications && verifications.length > 0);

  // Sync incoming props into local state
  useEffect(() => {
    if (verifications && verifications.length > 0) {
      setLocalItems(verifications);
    } else if (verification) {
      setLocalItems([verification]);
    } else {
      setLocalItems([]);
    }
    setReplyText('');
  }, [verification, verifications]);

  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const isMedical = currentUser?.role === UserRole.MEDICAL_OFFICER;
  const isOfficer = currentUser?.role === UserRole.COURSE_OFFICER;

  // Build chronologically sorted timeline across all verifications in this chat
  const timelineMessages: UnifiedTimelineMessage[] = useMemo(() => {
    const all: UnifiedTimelineMessage[] = [];
    for (const v of localItems) {
      const baseMsgs: SickbayMessage[] =
        v.messages && v.messages.length > 0
          ? v.messages
          : v.clinicalNote
          ? [
              {
                id: `legacy-${v.id}`,
                senderId: v.medicalOfficerId || '',
                senderName: v.medicalOfficerName || 'Medical Officer',
                senderRole: 'medical_officer',
                senderDesignation: 'Medical Officer',
                text: v.clinicalNote,
                createdAt: v.verifiedAt || v.createdAt || new Date().toISOString()
              }
            ]
          : [
              {
                id: `status-${v.id}`,
                senderId: v.medicalOfficerId || '',
                senderName: v.medicalOfficerName || 'Medical Officer',
                senderRole: 'medical_officer',
                senderDesignation: 'Medical Officer',
                text:
                  v.status === 'not_admitted'
                    ? 'Cadet flagged Not Admitted at Sickbay.'
                    : 'Cadet verified at Sickbay.',
                createdAt: v.verifiedAt || v.createdAt || new Date().toISOString()
              }
            ];

      for (const m of baseMsgs) {
        all.push({
          ...m,
          verificationId: v.id,
          cadetName: v.cadetName,
          courseNumber: v.courseNumber,
          squad: v.squad,
          paradeDate: v.paradeDate,
          paradeType: v.paradeType,
          disposition: v.status,
          threadStatus: v.threadStatus
        });
      }
    }

    return all.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [localItems]);

  // Default reply target = explicitly selected cadet, or most recent open cadet, or latest cadet
  const activeReplyTarget: SickbayVerification | null = useMemo(() => {
    if (localItems.length === 0) return null;
    if (replyTargetId) {
      const found = localItems.find(v => v.id === replyTargetId);
      if (found) return found;
    }
    const latestOpen = [...localItems]
      .reverse()
      .find(v => v.threadStatus !== 'resolved');
    return latestOpen || localItems[localItems.length - 1];
  }, [localItems, replyTargetId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [timelineMessages.length, isOpen]);

  const quickPrompts = isMedical
    ? MEDICAL_QUICK_REPLIES
    : isOfficer
    ? OFFICER_QUICK_REPLIES
    : COMMANDANT_QUICK_REPLIES;

  const openCaseCount = useMemo(
    () => localItems.filter(v => v.threadStatus !== 'resolved').length,
    [localItems]
  );

  const headerPrimaryTitle = useMemo(() => {
    if (channelTitle) return channelTitle;
    if (isUnifiedMode && localItems[0]) {
      return localItems[0].medicalOfficerName || 'Medical Officer';
    }
    return localItems[0]?.cadetName || 'Medical Chat';
  }, [channelTitle, isUnifiedMode, localItems]);

  const headerSubtitle = useMemo(() => {
    if (isUnifiedMode) {
      return `${localItems.length} ${localItems.length === 1 ? 'cadet' : 'cadets'} • ${openCaseCount} open`;
    }
    const single = localItems[0];
    if (!single) return '';
    return `${single.medicalOfficerName || 'Medical Officer'} • ${
      single.status === 'not_admitted' ? 'Not Admitted' : 'Admitted'
    }`;
  }, [isUnifiedMode, localItems, openCaseCount]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeReplyTarget || !currentUser || !replyText.trim() || isSending) return;

    const text = replyText.trim();
    setIsSending(true);
    try {
      const res = await dbService.replySickbayThread({
        verificationId: activeReplyTarget.id,
        senderId: String(currentUser.id),
        senderName: currentUser.fullName,
        senderRole: currentUser.role,
        senderDesignation: currentUser.designation,
        message: text
      });

      const currentMsgs = activeReplyTarget.messages || [];
      const updated: SickbayVerification = {
        ...activeReplyTarget,
        messages: res.messages || [
          ...currentMsgs,
          {
            id: `local-${Date.now()}`,
            senderId: String(currentUser.id),
            senderName: currentUser.fullName,
            senderRole: currentUser.role,
            senderDesignation: currentUser.designation,
            text,
            createdAt: new Date().toISOString()
          }
        ],
        threadStatus: (res.thread_status as any) || (isMedical ? 'open' : 'replied')
      };

      setLocalItems(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      setReplyText('');
      onUpdated?.(updated);
      window.dispatchEvent(new CustomEvent('sickbay-verifications-updated'));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send reply.');
    } finally {
      setIsSending(false);
    }
  };

  const handleResolveTarget = async (target: SickbayVerification) => {
    if (!currentUser || isResolving) return;
    setIsResolving(true);
    try {
      const res = await dbService.replySickbayThread({
        verificationId: target.id,
        senderId: String(currentUser.id),
        senderName: currentUser.fullName,
        senderRole: currentUser.role,
        senderDesignation: currentUser.designation,
        message: '',
        resolve: true
      });
      const updated: SickbayVerification = {
        ...target,
        messages: res.messages || target.messages,
        threadStatus: 'resolved'
      };
      setLocalItems(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      onUpdated?.(updated);
      window.dispatchEvent(new CustomEvent('sickbay-verifications-updated'));
      toast.success(`${target.cadetName} marked as resolved.`);
    } catch {
      toast.error('Failed to resolve thread.');
    } finally {
      setIsResolving(false);
    }
  };

  const formatMsgTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" data-drawer-open="true">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
          />

          {/* Drawer / Full-screen mobile chat */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.45 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 120 || info.velocity.x > 500) {
                onClose();
              }
            }}
            className="relative w-full md:max-w-lg bg-[#efeae2] h-full flex flex-col shadow-2xl z-10 overflow-hidden"
          >
            {/* ── WhatsApp-style Header ── */}
            <div className="bg-blue-900 text-white px-3.5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between gap-3 shrink-0 shadow-md">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 -ml-1 rounded-full hover:bg-white/10 transition-colors"
                  aria-label="Back"
                >
                  <ArrowLeft size={20} className="md:hidden" />
                  <X size={20} className="hidden md:block" />
                </button>

                <div className="w-10 h-10 rounded-full bg-rose-500/20 border border-rose-300/40 flex items-center justify-center text-rose-200 font-black text-xs shrink-0">
                  MED
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-bold text-white truncate">
                      {headerPrimaryTitle}
                    </h3>
                    {!isUnifiedMode && localItems[0] && (
                      <span className="px-1.5 py-0.5 rounded bg-white/15 text-[10px] font-bold shrink-0">
                        {formatRC(localItems[0].courseNumber)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-blue-200 truncate">
                    {headerSubtitle}
                  </p>
                </div>
              </div>

              {!isAdmin && activeReplyTarget && activeReplyTarget.threadStatus !== 'resolved' && (
                <button
                  type="button"
                  onClick={() => handleResolveTarget(activeReplyTarget)}
                  disabled={isResolving}
                  title={`Mark ${activeReplyTarget.cadetName} as resolved`}
                  className="px-2.5 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors disabled:opacity-50"
                >
                  {isResolving ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={13} />
                  )}
                  <span>Resolve</span>
                </button>
              )}
            </div>

            {/* ── Quick Cadet Filter / Context Strip (when multiple cadets in one chat) ── */}
            {isUnifiedMode && localItems.length > 1 && (
              <div
                data-no-page-swipe="true"
                className="bg-white/95 backdrop-blur-xs border-b border-slate-200/80 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0"
              >
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                  Reply to:
                </span>
                {localItems.map(item => {
                  const isSelected = activeReplyTarget?.id === item.id;
                  const itemResolved = item.threadStatus === 'resolved';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setReplyTargetId(item.id)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 flex items-center gap-1 border transition-all ${
                        isSelected
                          ? 'bg-blue-900 text-white border-blue-900 shadow-2xs'
                          : itemResolved
                          ? 'bg-slate-100 text-slate-500 border-slate-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                      }`}
                    >
                      <span>{item.cadetName}</span>
                      <span className="opacity-75 text-[10px]">RC{item.courseNumber}</span>
                      {itemResolved && <CheckCheck size={11} className="text-emerald-400" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Chat Messages Stream with Date Dividers & Quoted Cadet Cards ── */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-3.5 py-4 space-y-2.5"
            >
              {timelineMessages.length === 0 ? (
                <div className="text-center py-10">
                  <span className="inline-block px-3 py-1.5 rounded-full bg-white/80 text-slate-500 text-xs font-medium shadow-2xs">
                    No messages in this chat yet.
                  </span>
                </div>
              ) : (
                timelineMessages.map((msg, idx) => {
                  const isOwn =
                    currentUser &&
                    (String(msg.senderId) === String(currentUser.id) ||
                      msg.senderRole === currentUser.role);

                  const prevDivider =
                    idx > 0 ? formatDateDivider(timelineMessages[idx - 1].createdAt) : '';
                  const currentDivider = formatDateDivider(msg.createdAt);
                  const showDivider = currentDivider && currentDivider !== prevDivider;

                  const isTargetResolved = msg.threadStatus === 'resolved';

                  return (
                    <React.Fragment key={msg.id}>
                      {showDivider && (
                        <div className="flex justify-center my-2">
                          <span className="px-3 py-1 rounded-full bg-white/85 text-slate-600 text-[11px] font-semibold shadow-2xs">
                            {currentDivider}
                          </span>
                        </div>
                      )}

                      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div
                          onClick={() => {
                            if (isUnifiedMode && !isAdmin) {
                              setReplyTargetId(msg.verificationId);
                            }
                          }}
                          className={`max-w-[85%] rounded-2xl px-3 py-2.5 shadow-2xs ${
                            isUnifiedMode && !isAdmin ? 'cursor-pointer' : ''
                          } ${
                            isOwn
                              ? 'bg-blue-600 text-white rounded-br-sm'
                              : 'bg-white text-slate-800 border border-slate-200/70 rounded-bl-sm'
                          }`}
                        >
                          {/* WhatsApp-style Quoted Cadet Context Block (Differentiates cadets in 1 chat) */}
                          <div
                            className={`mb-2 px-2.5 py-1.5 rounded-lg border-l-4 text-[11px] flex items-center justify-between gap-2 ${
                              isOwn
                                ? 'bg-blue-700/60 border-blue-200 text-blue-50'
                                : msg.disposition === 'not_admitted'
                                ? 'bg-rose-50/90 border-rose-500 text-slate-800'
                                : 'bg-emerald-50/90 border-emerald-500 text-slate-800'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Stethoscope
                                  size={11}
                                  className={
                                    isOwn
                                      ? 'text-blue-200 shrink-0'
                                      : msg.disposition === 'not_admitted'
                                      ? 'text-rose-600 shrink-0'
                                      : 'text-emerald-600 shrink-0'
                                  }
                                />
                                <span className="font-bold truncate">{msg.cadetName}</span>
                                <span
                                  className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                                    isOwn
                                      ? 'bg-white/20 text-white'
                                      : 'bg-blue-100 text-blue-800'
                                  }`}
                                >
                                  {formatRC(msg.courseNumber)}
                                </span>
                                {isTargetResolved && (
                                  <span
                                    className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                                      isOwn
                                        ? 'bg-emerald-400/30 text-emerald-100'
                                        : 'bg-emerald-100 text-emerald-800'
                                    }`}
                                  >
                                    Resolved
                                  </span>
                                )}
                              </div>
                              <p
                                className={`text-[10px] truncate mt-0.5 ${
                                  isOwn ? 'text-blue-100' : 'text-slate-500'
                                }`}
                              >
                                {msg.paradeType?.toUpperCase()} • {msg.paradeDate}
                                {msg.squad ? ` • Squad ${msg.squad}` : ''}
                              </p>
                            </div>
                            {isUnifiedMode && !isAdmin && (
                              <CornerUpLeft
                                size={12}
                                className={`shrink-0 opacity-60 ${
                                  isOwn ? 'text-blue-100' : 'text-slate-400'
                                }`}
                              />
                            )}
                          </div>

                          {!isOwn && (
                            <p className="text-[10px] font-bold text-rose-600 mb-0.5">
                              {msg.senderName}
                              {msg.senderDesignation ? ` (${msg.senderDesignation})` : ''}
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
                            <span>{formatMsgTime(msg.createdAt)}</span>
                            {isOwn && <CheckCheck size={12} />}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
            </div>

            {/* ── Sticky Bottom Reply Bar with Active Cadet Quote Preview ── */}
            {!isAdmin && activeReplyTarget && activeReplyTarget.threadStatus !== 'resolved' && (
              <div className="bg-slate-100 border-t border-slate-200 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] space-y-2 shrink-0">
                {/* Active WhatsApp Quote-Reply Indicator */}
                {isUnifiedMode && (
                  <div className="flex items-center justify-between gap-2 bg-white rounded-xl px-3 py-1.5 border-l-4 border-rose-500 shadow-2xs">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">
                        Replying about
                      </p>
                      <p className="text-xs font-bold text-slate-800 truncate">
                        {activeReplyTarget.cadetName} ({formatRC(activeReplyTarget.courseNumber)}
                        {activeReplyTarget.squad ? ` • Squad ${activeReplyTarget.squad}` : ''})
                      </p>
                    </div>
                  </div>
                )}

                {/* 1-Tap Quick Replies */}
                <div
                  data-no-page-swipe="true"
                  className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
                >
                  {quickPrompts.map(prompt => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setReplyText(prompt)}
                      className="px-2.5 py-1 rounded-full bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                {/* Input & Send */}
                <form onSubmit={handleSend} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder={`Reply regarding ${activeReplyTarget.cadetName}...`}
                    className="flex-1 bg-white border border-slate-200 focus:border-blue-500 rounded-full px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!replyText.trim() || isSending}
                    className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition-colors shadow-sm"
                    aria-label="Send reply"
                  >
                    {isSending ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <Send size={17} />
                    )}
                  </button>
                </form>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
