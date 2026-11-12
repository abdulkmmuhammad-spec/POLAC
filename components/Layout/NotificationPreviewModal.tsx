import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Bell, AlertTriangle, Settings, User, ArrowRight,
    Activity, Clock, CheckCheck, Shield, MessageSquare,
    CornerDownRight, Send, RotateCcw
} from 'lucide-react';
import { Notification, UserRole, CommandantRemark } from '../../types';
import { inferSeverity, getSeverityStyles, parseNotificationTarget } from '../../utils/notificationUtils';
import { formatRC } from '../../utils/rcHelpers';
import { useParade } from '../../context/ParadeContext';
import { useAuth } from '../../context/AuthContext';
import { dbService } from '../../services/dbService';
import { toast } from 'react-hot-toast';

interface NotificationPreviewModalProps {
    notification: Notification | null;
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (targetRoute: string, state?: any) => void;
    onAcknowledge: (id: string) => void;
}

const formatDateTime = (timestamp: string): string => {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return 'Unknown time';
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${dateStr} at ${timeStr}`;
};

export const NotificationPreviewModal: React.FC<NotificationPreviewModalProps> = ({
    notification,
    isOpen,
    onClose,
    onNavigate,
    onAcknowledge
}) => {
    const { currentUser } = useAuth();
    const { remarks, refreshRemarks } = useParade();
    const isCommandant = currentUser?.role === UserRole.COMMANDANT;

    const [followUpOpenId, setFollowUpOpenId] = useState<string | null>(null);
    const [followUpText, setFollowUpText] = useState<string>('');
    const [officerReplyText, setOfficerReplyText] = useState<string>('');
    const [isBusy, setIsBusy] = useState<boolean>(false);

    const isParadeRemarkNotification = useMemo(() => {
        if (!notification) return false;
        const lowerTitle = (notification.title || '').toLowerCase();
        return (
            notification.type === 'commandant_remark' ||
            notification.type === 'remark_response' ||
            notification.type === 'remark_resolved' ||
            lowerTitle.includes("commandant's parade remark") ||
            lowerTitle.includes('commandant parade remark') ||
            lowerTitle.includes('officer justification') ||
            lowerTitle.includes('parade inquiry')
        );
    }, [notification]);

    const matchedRemarks = useMemo<CommandantRemark[]>(() => {
        if (!notification || !isParadeRemarkNotification) return [];
        const metaRemarkId = notification.metadata?.remarkId;
        const metaRecordId = notification.metadata?.recordId;

        if (metaRemarkId) {
            const byId = remarks.filter(r => String(r.id) === String(metaRemarkId));
            if (byId.length > 0) return byId;
        }
        if (metaRecordId) {
            const bySub = remarks.filter(r => String(r.submissionId) === String(metaRecordId));
            if (bySub.length > 0) return bySub;
        }

        const rcMatch = (notification.title || '').match(/RC\s*(\d+)/i);
        const targetCourse =
            notification.courseNumber ||
            notification.metadata?.courseNumber ||
            (rcMatch ? parseInt(rcMatch[1], 10) : undefined) ||
            (notification.yearGroup > 0 ? notification.yearGroup : undefined);

        const contentLower = (notification.content || '').toLowerCase();

        if (targetCourse) {
            const byCourse = remarks.filter(r => Number(r.courseNumber) === Number(targetCourse));
            if (byCourse.length > 0) {
                const exactContentMatches = byCourse.filter(r => {
                    const rText = (r.remarkText || '').toLowerCase();
                    const oResp = (r.officerResponse || '').toLowerCase();
                    return (
                        (rText && contentLower.includes(rText)) ||
                        (oResp && contentLower.includes(oResp))
                    );
                });
                return exactContentMatches.length > 0 ? exactContentMatches : [byCourse[0]];
            }
        }

        const anyContentMatch = remarks.filter(r => {
            const rText = (r.remarkText || '').toLowerCase();
            const oResp = (r.officerResponse || '').toLowerCase();
            return (
                (rText && contentLower.includes(rText)) ||
                (oResp && contentLower.includes(oResp))
            );
        });
        return anyContentMatch.length > 0 ? [anyContentMatch[0]] : (remarks.length > 0 ? [remarks[0]] : []);
    }, [notification, isParadeRemarkNotification, remarks]);

    if (!notification) return null;

    const severity = inferSeverity(notification);
    const styles = getSeverityStyles(severity);
    const target = parseNotificationTarget(notification);
    const counts = notification.metadata?.counts || target.counts;
    const courseNum =
        notification.courseNumber ||
        notification.metadata?.courseNumber ||
        matchedRemarks[0]?.courseNumber ||
        (notification.yearGroup > 0 ? notification.yearGroup : undefined);

    const primaryRemark = matchedRemarks[0] || null;

    const handleSendFollowUp = async (remark: CommandantRemark) => {
        if (!followUpText.trim()) {
            toast.error('Please enter your follow-up message for the Course Officer.');
            return;
        }
        setIsBusy(true);
        try {
            await dbService.followUpCommandantRemark({
                remark,
                followUpText: followUpText.trim(),
                commandantName: currentUser?.fullName || 'COMMANDANT',
                commandantId: currentUser?.id
            });
            toast.success('Follow-up inquiry dispatched to the Course Officer.');
            setFollowUpText('');
            setFollowUpOpenId(null);
            onAcknowledge(notification.id);
            await refreshRemarks();
        } catch (err: any) {
            toast.error(err?.message || 'Failed to send follow-up inquiry.');
        } finally {
            setIsBusy(false);
        }
    };

    const handleResolveRemark = async (remark: CommandantRemark) => {
        setIsBusy(true);
        try {
            await dbService.resolveCommandantRemark({
                remarkId: remark.id,
                commandantName: currentUser?.fullName || 'COMMANDANT',
                commandantId: currentUser?.id
            });
            toast.success('Parade inquiry marked as Addressed / Resolved.');
            onAcknowledge(notification.id);
            await refreshRemarks();
        } catch (err: any) {
            toast.error(err?.message || 'Failed to resolve remark.');
        } finally {
            setIsBusy(false);
        }
    };

    const handleSubmitOfficerReply = async (remark: CommandantRemark) => {
        if (!officerReplyText.trim()) {
            toast.error('Please enter your explanation before submitting.');
            return;
        }
        setIsBusy(true);
        try {
            await dbService.respondToCommandantRemark({
                remarkId: remark.id,
                officerResponse: officerReplyText.trim(),
                officerName: currentUser?.fullName || remark.courseOfficerName || 'Course Officer',
                officerId: currentUser?.id
            });
            toast.success('Response submitted to the Commandant.');
            setOfficerReplyText('');
            onAcknowledge(notification.id);
            await refreshRemarks();
        } catch (err: any) {
            toast.error(err?.message || 'Failed to submit response.');
        } finally {
            setIsBusy(false);
        }
    };

    const handleActionClick = () => {
        onAcknowledge(notification.id);
        onClose();

        if (isParadeRemarkNotification) {
            const destinationRoute = isCommandant ? '/commandant' : '/officer/history';
            const navState = {
                courseNumber: courseNum || target.courseNumber,
                paradeType: primaryRemark?.paradeType || target.paradeType,
                openRemarkSubmissionId: primaryRemark?.submissionId || notification.metadata?.recordId,
                remarkId: primaryRemark?.id || notification.metadata?.remarkId,
                focusLog: true,
                notificationId: notification.id
            };

            onNavigate(destinationRoute, navState);

            // Also dispatch a custom event so if the user is already on /commandant or /officer/history,
            // the ParadeRemarkDrawer opens immediately to the Remarks & Resolution Log
            setTimeout(() => {
                window.dispatchEvent(
                    new CustomEvent('open-parade-remark-drawer', {
                        detail: {
                            submissionId: primaryRemark?.submissionId || notification.metadata?.recordId,
                            remarkId: primaryRemark?.id || notification.metadata?.remarkId,
                            courseNumber: courseNum || target.courseNumber,
                            paradeType: primaryRemark?.paradeType || target.paradeType,
                            remark: primaryRemark || undefined,
                            focusLog: true
                        }
                    })
                );
            }, 80);
            return;
        }

        onNavigate(target.route, {
            courseNumber: target.courseNumber,
            paradeType: target.paradeType,
            searchTerm: target.cadetName,
            notificationId: notification.id,
            previewMode: target.previewMode
        });
    };

    const handleMarkAndClose = () => {
        onAcknowledge(notification.id);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-slate-950/60 backdrop-blur-md"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 15 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10"
                        role="dialog"
                        aria-modal="true"
                    >
                        {/* ── 1. Top Header Bar (Spacious, Uncrowded Layout) ── */}
                        <div className="bg-gradient-to-br from-blue-900 via-blue-950 to-slate-900 text-white px-6 pt-6 pb-5 relative">
                            {/* Top Badge & Action Strip */}
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`text-[10px] font-black uppercase tracking-[0.18em] px-2.5 py-1 rounded-md border ${styles.badge}`}>
                                        {styles.label} Intel
                                    </span>
                                    {courseNum && (
                                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-200 border border-blue-400/30">
                                            {formatRC(courseNum)}
                                        </span>
                                    )}
                                    {target.paradeType && (
                                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md bg-slate-800 text-slate-200 border border-slate-700">
                                            {target.paradeType}
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                                    aria-label="Close modal"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Title & Icon Header */}
                            <div className="flex items-start gap-3.5">
                                <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/15 shrink-0 shadow-inner mt-0.5">
                                    {severity === 'critical' ? (
                                        <AlertTriangle className="text-rose-400" size={20} />
                                    ) : severity === 'system' ? (
                                        <Settings className="text-blue-300" size={20} />
                                    ) : (
                                        <Bell className="text-emerald-300" size={20} />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-base sm:text-lg font-black tracking-tight text-white leading-snug">
                                        {notification.title}
                                    </h3>
                                </div>
                            </div>
                        </div>

                        {/* ── 2. Modal Body (Clean Hierarchy & Balanced Padding) ── */}
                        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                            {/* Metadata Summary Line */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-2.5 px-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                    <User size={14} className="text-blue-600 shrink-0" />
                                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Officer:</span>
                                    <span className="font-black text-slate-800 truncate">{notification.officerName || 'System'}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <Clock size={14} className="text-slate-400 shrink-0" />
                                    <span className="font-mono text-xs font-semibold text-slate-600 whitespace-nowrap">
                                        {formatDateTime(notification.timestamp)}
                                    </span>
                                </div>
                            </div>

                            {/* Content Description */}
                            <div className="text-slate-700 text-sm leading-relaxed px-1 font-medium">
                                {notification.content}
                            </div>

                            {/* ── Commandant's Remark & Course Officer's Reply (Standard Log Format) ── */}
                            {isParadeRemarkNotification && matchedRemarks.length > 0 && (
                                <div className="pt-3 border-t border-slate-100 space-y-3">
                                    <div className="flex items-center justify-between px-1">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-1.5">
                                            <MessageSquare size={14} className="text-blue-600" />
                                            Remarks & Resolution Log
                                        </h4>
                                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                            {matchedRemarks.length} {matchedRemarks.length === 1 ? 'Thread' : 'Threads'}
                                        </span>
                                    </div>

                                    {matchedRemarks.map(remark => {
                                        const isResolved = remark.status === 'resolved';
                                        const isAddressed =
                                            remark.status === 'addressed' ||
                                            (remark.status === 'pending' && Boolean(remark.officerResponse));
                                        const isFollowUpOpen = followUpOpenId === remark.id;

                                        return (
                                            <div
                                                key={remark.id}
                                                className={`rounded-2xl border p-4 space-y-3 transition-all ${
                                                    isResolved
                                                        ? 'bg-emerald-50/40 border-emerald-200'
                                                        : isAddressed
                                                        ? 'bg-blue-50/40 border-blue-200'
                                                        : 'bg-amber-50/40 border-amber-200'
                                                }`}
                                            >
                                                {/* Status & Timestamp Header */}
                                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                                                            <Shield size={12} />
                                                        </span>
                                                        <div>
                                                            <p className="text-xs font-black text-slate-900">
                                                                {remark.commandantName}
                                                            </p>
                                                            <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                                                                <Clock size={10} />
                                                                {formatDateTime(remark.createdAt)}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {isResolved ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                            <CheckCheck size={12} />
                                                            Addressed / Resolved
                                                        </span>
                                                    ) : isAddressed ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
                                                            <Clock size={12} />
                                                            Response Filed • Awaiting Ack
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                                                            <AlertTriangle size={12} />
                                                            Pending Review
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Prior Exchange Thread History (if Commandant followed up previously) */}
                                                {remark.thread && remark.thread.length > 0 && (
                                                    <div className="space-y-2 pl-2.5 border-l-2 border-slate-200">
                                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                                                            Previous Exchange History ({remark.thread.length})
                                                        </p>
                                                        {remark.thread.map((msg, idx) => (
                                                            <div
                                                                key={msg.id || idx}
                                                                className={`rounded-xl p-2.5 border text-xs ${
                                                                    msg.senderRole === 'commandant'
                                                                        ? 'bg-white border-slate-200 text-slate-800'
                                                                        : 'bg-slate-50 border-slate-200/80 text-slate-700 ml-2'
                                                                }`}
                                                            >
                                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                                    <span
                                                                        className={`text-[9px] font-black uppercase tracking-wider ${
                                                                            msg.senderRole === 'commandant'
                                                                                ? 'text-blue-900'
                                                                                : 'text-slate-600'
                                                                        }`}
                                                                    >
                                                                        {msg.senderRole === 'commandant'
                                                                            ? `Commandant (${msg.senderName})`
                                                                            : `Course Officer (${msg.senderName})`}
                                                                    </span>
                                                                    <span className="text-[9px] text-slate-400 font-semibold">
                                                                        {formatDateTime(msg.timestamp)}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs leading-relaxed font-medium">
                                                                    {msg.message}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Commandant's Remark Box */}
                                                <div className="bg-white/95 rounded-xl p-3 border border-slate-200/80">
                                                    <p className="text-[10px] font-black uppercase tracking-wider text-blue-900 mb-1">
                                                        Commandant's Remark
                                                    </p>
                                                    <p className="text-xs text-slate-800 font-medium leading-relaxed">
                                                        {remark.remarkText}
                                                    </p>
                                                </div>

                                                {/* Course Officer's Reply Box */}
                                                {remark.officerResponse ? (
                                                    <div className="pl-3 border-l-2 border-blue-400 space-y-1.5">
                                                        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-bold text-blue-800">
                                                            <span className="flex items-center gap-1 uppercase tracking-wider font-black">
                                                                <CornerDownRight size={12} className="shrink-0" />
                                                                <span>Course Officer's Reply ({remark.courseOfficerName})</span>
                                                            </span>
                                                            {remark.respondedAt && (
                                                                <span className="text-slate-400">
                                                                    {formatDateTime(remark.respondedAt)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-slate-700 bg-white rounded-xl p-3 border border-blue-100 font-medium leading-relaxed">
                                                            {remark.officerResponse}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="pl-3 border-l-2 border-amber-300">
                                                        <p className="text-[11px] font-bold text-amber-800 italic bg-white/80 rounded-xl px-3 py-2 border border-amber-200/80">
                                                            Awaiting Course Officer's reply / justification...
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Course Officer Inline Reply Form (if not Commandant and awaiting reply) */}
                                                {!isCommandant && !isResolved && !remark.officerResponse && (
                                                    <div className="pt-1 space-y-2">
                                                        <textarea
                                                            rows={2}
                                                            value={officerReplyText}
                                                            onChange={e => setOfficerReplyText(e.target.value)}
                                                            placeholder="Submit justification (e.g., Cadets undergoing medical clearance at sick bay)..."
                                                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 outline-none resize-none"
                                                        />
                                                        <div className="flex justify-end">
                                                            <button
                                                                type="button"
                                                                disabled={isBusy}
                                                                onClick={() => handleSubmitOfficerReply(remark)}
                                                                className="w-full sm:w-auto min-h-[42px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                                                            >
                                                                <Send size={12} />
                                                                <span>Submit Justification</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Commandant Follow-Up & Resolution Actions */}
                                                {isCommandant && (
                                                    <div className="pt-1 space-y-2.5">
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (isFollowUpOpen) {
                                                                        setFollowUpOpenId(null);
                                                                        setFollowUpText('');
                                                                    } else {
                                                                        setFollowUpOpenId(remark.id);
                                                                        setFollowUpText('');
                                                                    }
                                                                }}
                                                                className={`w-full sm:w-auto min-h-[40px] px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all border ${
                                                                    isFollowUpOpen
                                                                        ? 'bg-slate-200 text-slate-800 border-slate-300'
                                                                        : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                                                                }`}
                                                            >
                                                                <RotateCcw size={12} />
                                                                <span>
                                                                    {remark.officerResponse
                                                                        ? 'Not Satisfied • Text Officer Again'
                                                                        : 'Send Follow-Up Message'}
                                                                </span>
                                                            </button>

                                                            {!isResolved && (
                                                                <button
                                                                    type="button"
                                                                    disabled={isBusy}
                                                                    onClick={() => handleResolveRemark(remark)}
                                                                    className="w-full sm:w-auto min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-xs disabled:opacity-50"
                                                                >
                                                                    <CheckCheck size={13} />
                                                                    <span>Acknowledge & Resolve</span>
                                                                </button>
                                                            )}
                                                        </div>

                                                        {isFollowUpOpen && (
                                                            <div className="bg-white rounded-xl p-3 border border-amber-300 space-y-2 shadow-xs">
                                                                <label className="block text-[10px] font-black uppercase tracking-wider text-amber-900">
                                                                    Follow-Up Directive to Course Officer ({formatRC(remark.courseNumber)})
                                                                </label>
                                                                <textarea
                                                                    rows={2}
                                                                    value={followUpText}
                                                                    onChange={e => setFollowUpText(e.target.value)}
                                                                    placeholder="State why the explanation is insufficient or request further verification..."
                                                                    className="w-full rounded-xl border border-slate-300 bg-slate-50/60 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-amber-600 outline-none resize-none"
                                                                />
                                                                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setFollowUpOpenId(null);
                                                                            setFollowUpText('');
                                                                        }}
                                                                        className="px-3 py-2 rounded-lg text-[10px] font-bold text-slate-500 hover:bg-slate-100 text-center"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        disabled={isBusy}
                                                                        onClick={() => handleSendFollowUp(remark)}
                                                                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-xs transition-all disabled:opacity-50"
                                                                    >
                                                                        <Send size={11} />
                                                                        <span>Dispatch to Course Officer</span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Tactical Metrics Grid */}
                            {counts && (
                                <div className="pt-2 border-t border-slate-100 space-y-3">
                                    <div className="flex items-center justify-between px-1">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-1.5">
                                            <Activity size={14} className="text-blue-600" />
                                            Parade Metrics Breakdown
                                        </h4>
                                        {counts.grandTotal !== undefined && (
                                            <span className="text-[11px] font-mono font-black text-slate-700">
                                                Total Cadets: {counts.grandTotal}
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                        {counts.present !== undefined && (
                                            <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-emerald-700">Present</p>
                                                <p className="text-lg font-black font-mono text-emerald-900">{counts.present}</p>
                                            </div>
                                        )}
                                        {counts.absent !== undefined && (
                                            <div className="p-2.5 rounded-xl bg-rose-50/80 border border-rose-200/80 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-rose-700">Absent</p>
                                                <p className="text-lg font-black font-mono text-rose-900">{counts.absent}</p>
                                            </div>
                                        )}
                                        {counts.sick !== undefined && (
                                            <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-amber-700">Medical</p>
                                                <p className="text-lg font-black font-mono text-amber-900">{counts.sick}</p>
                                            </div>
                                        )}
                                        {counts.detention !== undefined && counts.detention > 0 && (
                                            <div className="p-2.5 rounded-xl bg-purple-50/80 border border-purple-200/80 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-purple-700">Detention</p>
                                                <p className="text-lg font-black font-mono text-purple-900">{counts.detention}</p>
                                            </div>
                                        )}
                                        {counts.pass !== undefined && counts.pass > 0 && (
                                            <div className="p-2.5 rounded-xl bg-sky-50/80 border border-sky-200/80 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-sky-700">Pass</p>
                                                <p className="text-lg font-black font-mono text-sky-900">{counts.pass}</p>
                                            </div>
                                        )}
                                        {counts.suspension !== undefined && counts.suspension > 0 && (
                                            <div className="p-2.5 rounded-xl bg-red-50/80 border border-red-200/80 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-red-700">Suspension</p>
                                                <p className="text-lg font-black font-mono text-red-900">{counts.suspension}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── 3. Action Footer ── */}
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                            <button
                                onClick={handleMarkAndClose}
                                className="w-full sm:w-auto px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCheck size={16} />
                                {notification.read ? 'Close' : 'Acknowledge'}
                            </button>
                            <button
                                onClick={handleActionClick}
                                className="w-full sm:w-auto px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-blue-900/20 flex items-center justify-center gap-2"
                            >
                                {target.actionLabel}
                                <ArrowRight size={14} />
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

