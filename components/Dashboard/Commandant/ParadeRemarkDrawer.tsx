import React, { useState, useEffect, useRef } from 'react';
import {
    X,
    MessageSquarePlus,
    Flag,
    Send,
    CheckCircle2,
    Clock,
    AlertTriangle,
    User,
    Calendar,
    FileText,
    Sparkles,
    CornerDownRight,
    CheckCheck,
    Loader2,
    Users,
    RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ParadeRecordMetadata,
    CommandantRemark,
    CadetDetail,
    CadetStatus,
    UserRole
} from '../../../types';
import { dbService } from '../../../services/dbService';
import { useAuth } from '../../../context/AuthContext';
import { useParade } from '../../../context/ParadeContext';
import { formatRC, calculateCurrentLevel } from '../../../utils/rcHelpers';
import { getStatusFullLabel, getStatusBadgeStyles } from '../../../utils/statusHelpers';
import { toast } from 'react-hot-toast';

export interface ParadeRemarkTarget {
    id: string | number;
    officerId?: string | number;
    officerName: string;
    courseName?: string;
    courseNumber?: number;
    yearGroup?: number;
    date: string;
    paradeType: string;
    presentCount: number;
    absentCount: number;
    sickCount: number;
    detentionCount: number;
    passCount?: number;
    suspensionCount?: number;
    yetToReportCount?: number;
    grandTotal: number;
}

interface ParadeRemarkDrawerProps {
    submission: ParadeRemarkTarget | ParadeRecordMetadata | null;
    isOpen: boolean;
    onClose: () => void;
    focusLog?: boolean;
}

const QUICK_PROMPTS = [
    {
        label: 'Low Turnout / Failure to Fall Out',
        text: 'Inquiry: Reason for low turnout / failure to fall out?'
    },
    {
        label: 'Medical Verification Required',
        text: 'Medical verification required for absentees.'
    },
    {
        label: 'Commendation for Turnout',
        text: "Commandant's Commendation for excellent turnout."
    }
];

const FOLLOW_UP_PROMPTS = [
    'Justification insufficient — provide official medical or duty pass documentation.',
    'Clarify the exact whereabouts of the absent cadets immediately.',
    'Ensure all listed absentees report to the Orderly Room for verification.'
];

export const ParadeRemarkDrawer: React.FC<ParadeRemarkDrawerProps> = ({
    submission,
    isOpen,
    onClose,
    focusLog = false
}) => {
    const { currentUser } = useAuth();
    const { activeRC, remarks, refreshRemarks } = useParade();

    const [remarkText, setRemarkText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
    const [submittingReplyId, setSubmittingReplyId] = useState<string | null>(null);
    const [resolvingId, setResolvingId] = useState<string | null>(null);

    // State for Commandant follow-up ("Not Satisfied • Text Officer Again")
    const [followUpOpenById, setFollowUpOpenById] = useState<Record<string, boolean>>({});
    const [followUpTexts, setFollowUpTexts] = useState<Record<string, string>>({});
    const [submittingFollowUpId, setSubmittingFollowUpId] = useState<string | null>(null);

    const [cadets, setCadets] = useState<CadetDetail[]>([]);
    const [isLoadingCadets, setIsLoadingCadets] = useState(false);
    const [showCadetList, setShowCadetList] = useState(true);
    const logSectionRef = useRef<HTMLDivElement>(null);

    const isCommandant = currentUser?.role === UserRole.COMMANDANT;

    // Filter remarks belonging to this specific submission (or fallback by courseNumber + date if synthetic ID)
    const submissionRemarks = React.useMemo(() => {
        if (!submission) return [];
        const directMatches = remarks.filter(r => String(r.submissionId) === String(submission.id));
        if (directMatches.length > 0) return directMatches;

        const cNum = submission.courseNumber || submission.yearGroup;
        if (cNum) {
            return remarks.filter(
                r =>
                    Number(r.courseNumber) === Number(cNum) &&
                    (!r.paradeDate || !submission.date || r.paradeDate === submission.date)
            );
        }
        return [];
    }, [remarks, submission]);

    useEffect(() => {
        if (isOpen && focusLog && logSectionRef.current) {
            const timer = setTimeout(() => {
                logSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 220);
            return () => clearTimeout(timer);
        }
    }, [isOpen, focusLog, submissionRemarks.length]);

    useEffect(() => {
        if (!submission || !isOpen) {
            setCadets([]);
            setRemarkText('');
            return;
        }

        let cancelled = false;
        const loadDetails = async () => {
            setIsLoadingCadets(true);
            try {
                const { data } = await dbService.getParadeDetails(submission.id);
                if (!cancelled) {
                    setCadets(data || []);
                }
            } catch (err) {
                console.warn('Failed to load cadet details for remark drawer:', err);
            } finally {
                if (!cancelled) {
                    setIsLoadingCadets(false);
                }
            }
        };

        loadDetails();
        return () => {
            cancelled = true;
        };
    }, [submission, isOpen]);

    if (!submission) return null;

    const nonPresentCadets = cadets.filter(c => c.status !== CadetStatus.PRESENT);
    const courseNum = submission.courseNumber || submission.yearGroup || 0;
    const rcLabel = courseNum > 0 ? formatRC(courseNum) : submission.courseName || 'Course';
    const yearLevel = courseNum > 0 ? calculateCurrentLevel(courseNum, activeRC) : submission.yearGroup || 1;

    const handleSelectQuickPrompt = (promptText: string) => {
        setRemarkText(prev => {
            const trimmed = prev.trim();
            if (!trimmed) return promptText;
            if (trimmed.includes(promptText)) return prev;
            return `${trimmed} ${promptText}`;
        });
    };

    const handleInsertCadetReference = (cadet: CadetDetail) => {
        const tag = `${cadet.name} (${cadet.squad} - ${getStatusFullLabel(cadet.status)})`;
        setRemarkText(prev => {
            const trimmed = prev.trim();
            if (!trimmed) return `Inquiry regarding ${tag}: please provide justification for failure to fall out.`;
            return `${trimmed} [${tag}]`;
        });
    };

    const handleSubmitRemark = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!remarkText.trim()) {
            toast.error('Please enter a remark or select a quick prompt.');
            return;
        }

        setIsSubmitting(true);
        try {
            await dbService.createCommandantRemark({
                submissionId: submission.id,
                commandantId: currentUser?.id || null,
                commandantName: currentUser?.fullName || 'COMMANDANT',
                courseOfficerId: submission.officerId || null,
                courseOfficerName: submission.officerName || 'Course Officer',
                courseNumber: courseNum || undefined,
                paradeType: String(submission.paradeType || 'muster'),
                paradeDate: submission.date,
                remarkText: remarkText.trim()
            });

            setRemarkText('');
            await refreshRemarks();
            toast.success(`Official remark dispatched to ${submission.officerName || rcLabel}.`);
        } catch (err: any) {
            console.error('Error submitting remark:', err);
            toast.error(err?.message || 'Failed to dispatch remark.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOfficerReply = async (remark: CommandantRemark) => {
        const reply = (replyTexts[remark.id] || '').trim();
        if (!reply) {
            toast.error('Please enter a justification response.');
            return;
        }

        setSubmittingReplyId(remark.id);
        try {
            await dbService.respondToCommandantRemark({
                remarkId: remark.id,
                officerResponse: reply,
                officerName: currentUser?.fullName || submission.officerName || 'Course Officer',
                officerId: currentUser?.id
            });
            setReplyTexts(prev => ({ ...prev, [remark.id]: '' }));
            await refreshRemarks();
            toast.success('Official response submitted to the Commandant.');
        } catch (err) {
            console.error('Error submitting response:', err);
            toast.error('Failed to submit response.');
        } finally {
            setSubmittingReplyId(null);
        }
    };

    const handleResolveRemark = async (remark: CommandantRemark) => {
        setResolvingId(remark.id);
        try {
            await dbService.resolveCommandantRemark({
                remarkId: remark.id,
                commandantName: currentUser?.fullName || 'COMMANDANT',
                commandantId: currentUser?.id
            });
            await refreshRemarks();
            toast.success('Remark marked as Addressed / Resolved.');
        } catch (err) {
            console.error('Error resolving remark:', err);
            toast.error('Failed to update remark status.');
        } finally {
            setResolvingId(null);
        }
    };

    const handleSendFollowUp = async (remark: CommandantRemark) => {
        const text = (followUpTexts[remark.id] || '').trim();
        if (!text) {
            toast.error('Please enter your follow-up message for the Course Officer.');
            return;
        }

        setSubmittingFollowUpId(remark.id);
        try {
            await dbService.followUpCommandantRemark({
                remark,
                followUpText: text,
                commandantName: currentUser?.fullName || 'COMMANDANT',
                commandantId: currentUser?.id
            });
            setFollowUpTexts(prev => ({ ...prev, [remark.id]: '' }));
            setFollowUpOpenById(prev => ({ ...prev, [remark.id]: false }));
            await refreshRemarks();
            toast.success('Follow-up inquiry sent to the Course Officer.');
        } catch (err) {
            console.error('Error sending follow-up:', err);
            toast.error('Failed to send follow-up inquiry.');
        } finally {
            setSubmittingFollowUpId(null);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[120] overflow-hidden">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
                    />

                    {/* Slide-Over Panel */}
                    <div className="fixed inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10">
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                            className="w-screen max-w-xl bg-white shadow-2xl border-l border-slate-200 flex flex-col h-full"
                        >
                            {/* ── 1. Drawer Header ── */}
                            <div className="bg-slate-900 text-white px-4 py-4 sm:px-6 sm:py-5 border-b border-slate-800 shrink-0">
                                <div className="flex items-start justify-between gap-3 sm:gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
                                            <Flag size={18} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">
                                                    Parade State Review
                                                </span>
                                                <span className="px-2 py-0.5 rounded bg-blue-500/20 border border-blue-400/30 text-blue-300 text-[10px] font-mono font-black uppercase">
                                                    {rcLabel} • YEAR {yearLevel}
                                                </span>
                                            </div>
                                            <h3 className="text-sm sm:text-lg font-black tracking-tight text-white uppercase mt-0.5 leading-snug">
                                                Commandant Parade Remarks & Audit
                                            </h3>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors shrink-0"
                                        aria-label="Close drawer"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                {/* Submission Metadata Bar */}
                                <div className="mt-3.5 pt-3 border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-2.5 text-xs text-slate-300">
                                    <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                                        <span className="flex items-center gap-1.5 font-bold">
                                            <User size={13} className="text-blue-400 shrink-0" />
                                            <span className="truncate max-w-[160px] sm:max-w-none">{submission.officerName || 'Course Officer'}</span>
                                        </span>
                                        <span className="flex items-center gap-1.5 font-mono">
                                            <Calendar size={13} className="text-blue-400 shrink-0" />
                                            <span>{new Date(submission.date).toLocaleDateString()}</span>
                                        </span>
                                        <span className="flex items-center gap-1.5 uppercase font-black tracking-wider text-amber-300">
                                            <FileText size={13} className="shrink-0" />
                                            <span>{submission.paradeType}</span>
                                        </span>
                                    </div>
                                    <span className="font-mono text-[11px] font-black text-white bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                                        Strength: {submission.presentCount} / {submission.grandTotal}
                                    </span>
                                </div>
                            </div>

                            {/* ── 2. Scrollable Body ── */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6 bg-slate-50/60">
                                {/* Attendance Snapshot Strip */}
                                <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            Submitted Parade Accountability
                                        </span>
                                        {nonPresentCadets.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setShowCadetList(prev => !prev)}
                                                className="text-[10px] font-black uppercase tracking-wider text-blue-700 hover:underline flex items-center gap-1 py-1"
                                            >
                                                <Users size={12} />
                                                {showCadetList
                                                    ? 'Hide Non-Present Cadets'
                                                    : `Show Non-Present Cadets (${nonPresentCadets.length})`}
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center font-mono">
                                        <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200/70">
                                            <p className="text-[9px] font-black uppercase text-emerald-700">Present</p>
                                            <p className="text-sm font-black text-emerald-900">{submission.presentCount}</p>
                                        </div>
                                        <div className="p-2 rounded-xl bg-rose-50 border border-rose-200/70">
                                            <p className="text-[9px] font-black uppercase text-rose-700">Absent</p>
                                            <p className="text-sm font-black text-rose-900">{submission.absentCount}</p>
                                        </div>
                                        <div className="p-2 rounded-xl bg-amber-50 border border-amber-200/70">
                                            <p className="text-[9px] font-black uppercase text-amber-700">Sick</p>
                                            <p className="text-sm font-black text-amber-900">{submission.sickCount}</p>
                                        </div>
                                        <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200/70">
                                            <p className="text-[9px] font-black uppercase text-indigo-700">Detention</p>
                                            <p className="text-sm font-black text-indigo-900">{submission.detentionCount}</p>
                                        </div>
                                        <div className="p-2 rounded-xl bg-slate-100 border border-slate-200 col-span-2 sm:col-span-1">
                                            <p className="text-[9px] font-black uppercase text-slate-600">Pass/Oth</p>
                                            <p className="text-sm font-black text-slate-900">
                                                {(submission.passCount || 0) +
                                                    (submission.suspensionCount || 0) +
                                                    (submission.yetToReportCount || 0)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Non-Present Cadets Quick-Tag List */}
                                    {isLoadingCadets ? (
                                        <div className="py-3 flex items-center justify-center gap-2 text-xs text-slate-400">
                                            <Loader2 size={14} className="animate-spin text-blue-600" />
                                            <span>Loading muster roll exceptions...</span>
                                        </div>
                                    ) : (
                                        showCadetList &&
                                        nonPresentCadets.length > 0 && (
                                            <div className="pt-2 border-t border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                                    Non-Present Cadets {isCommandant && '(Click cadet to cite in remark)'}
                                                </p>
                                                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                                                    {nonPresentCadets.map((c, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => isCommandant && handleInsertCadetReference(c)}
                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                                                                isCommandant
                                                                    ? 'cursor-pointer hover:border-blue-500 hover:shadow-xs'
                                                                    : 'cursor-default'
                                                            } bg-slate-50 border-slate-200 text-slate-800`}
                                                        >
                                                            <span className="font-black uppercase">{c.name}</span>
                                                            <span className="text-slate-400 font-mono text-[9px]">{c.squad}</span>
                                                            <span
                                                                className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase ${getStatusBadgeStyles(
                                                                    c.status
                                                                )}`}
                                                            >
                                                                {getStatusFullLabel(c.status)}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>

                                {/* ── Commandant Compose Remark Form ── */}
                                {isCommandant && (
                                    <form
                                        onSubmit={handleSubmitRemark}
                                        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4"
                                    >
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                                                <MessageSquarePlus size={15} className="text-blue-900" />
                                                <span>Issue Official Remark / Flag Absence</span>
                                            </label>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">
                                                Notifies Course Officer
                                            </span>
                                        </div>

                                        {/* Quick Prompts Pills */}
                                        <div className="space-y-1.5">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                                                <Sparkles size={11} className="text-amber-500" />
                                                <span>Quick Prompts</span>
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {QUICK_PROMPTS.map((qp, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => handleSelectQuickPrompt(qp.text)}
                                                        className="text-left px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-900 border border-slate-200 hover:border-blue-300 text-[11px] font-bold transition-all"
                                                    >
                                                        {qp.text}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Remark Textarea */}
                                        <div>
                                            <textarea
                                                rows={3}
                                                value={remarkText}
                                                onChange={e => setRemarkText(e.target.value)}
                                                placeholder="Enter official inquiry, absence flag, or directive for the Course Officer..."
                                                className="w-full p-3.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-900 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none transition-all resize-none"
                                            />
                                        </div>

                                        <div className="flex justify-end">
                                            <button
                                                type="submit"
                                                disabled={isSubmitting || !remarkText.trim()}
                                                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-blue-900 hover:bg-blue-800 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-md shadow-blue-900/15 transition-all"
                                            >
                                                {isSubmitting ? (
                                                    <>
                                                        <Loader2 size={14} className="animate-spin" />
                                                        <span>Dispatching...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Send size={14} />
                                                        <span>Dispatch Remark</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </form>
                                )}

                                {/* ── Remarks & Resolution Audit Thread ── */}
                                <div ref={logSectionRef} className="space-y-3 scroll-mt-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                                            Remarks & Resolution Log ({submissionRemarks.length})
                                        </h4>
                                    </div>

                                    {submissionRemarks.length === 0 ? (
                                        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center space-y-2">
                                            <CheckCircle2 size={28} className="text-emerald-500 mx-auto opacity-80" />
                                            <p className="text-xs font-black uppercase tracking-wider text-slate-600">
                                                No Remarks Flagged on This Submission
                                            </p>
                                            <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                                                {isCommandant
                                                    ? 'Use the form above or select a quick prompt to issue an official inquiry to the Course Officer.'
                                                    : 'No inquiries or absence flags have been issued by the Commandant for this parade state.'}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {submissionRemarks.map(remark => {
                                                const isResolved = remark.status === 'resolved';
                                                const hasResponse = Boolean(remark.officerResponse);
                                                const isFollowUpOpen = Boolean(followUpOpenById[remark.id]);
                                                const threadHistory = remark.thread || [];

                                                return (
                                                    <div
                                                        key={remark.id}
                                                        className={`bg-white rounded-2xl border p-5 shadow-xs space-y-4 transition-all ${
                                                            isResolved
                                                                ? 'border-emerald-200/90'
                                                                : hasResponse
                                                                ? 'border-blue-200'
                                                                : 'border-amber-300 ring-1 ring-amber-200/50'
                                                        }`}
                                                    >
                                                        {/* Status Header */}
                                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                                            <div className="flex items-center gap-2">
                                                                {isResolved ? (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                                        <CheckCheck size={12} />
                                                                        Addressed / Resolved
                                                                    </span>
                                                                ) : hasResponse ? (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
                                                                        <Clock size={12} />
                                                                        Response Filed • Awaiting Ack
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                                                                        <AlertTriangle size={12} />
                                                                        Pending Review
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-[10px] font-mono font-semibold text-slate-400">
                                                                {new Date(remark.updatedAt || remark.createdAt).toLocaleString([], {
                                                                    month: 'short',
                                                                    day: 'numeric',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit'
                                                                })}
                                                            </span>
                                                        </div>

                                                        {/* Prior Conversation Thread History (if follow-ups occurred) */}
                                                        {threadHistory.length > 0 && (
                                                            <div className="space-y-2.5 pb-3 border-b border-dashed border-slate-200">
                                                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                                                                    Previous Exchange History
                                                                </p>
                                                                {threadHistory.map(item => (
                                                                    <div
                                                                        key={item.id}
                                                                        className={
                                                                            item.senderRole === 'commandant'
                                                                                ? 'bg-slate-50/80 p-3 rounded-xl border border-slate-200/70'
                                                                                : 'pl-3 border-l-2 border-blue-400 space-y-1'
                                                                        }
                                                                    >
                                                                        <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">
                                                                            <span
                                                                                className={
                                                                                    item.senderRole === 'commandant'
                                                                                        ? 'text-slate-500'
                                                                                        : 'text-blue-700 flex items-center gap-1'
                                                                                }
                                                                            >
                                                                                {item.senderRole === 'course_officer' && (
                                                                                    <CornerDownRight size={11} />
                                                                                )}
                                                                                {item.senderRole === 'commandant'
                                                                                    ? `Commandant's Remark (${item.senderName})`
                                                                                    : `Course Officer Reply (${item.senderName})`}
                                                                            </span>
                                                                            <span className="font-mono">
                                                                                {new Date(item.timestamp).toLocaleString([], {
                                                                                    month: 'short',
                                                                                    day: 'numeric',
                                                                                    hour: '2-digit',
                                                                                    minute: '2-digit'
                                                                                })}
                                                                            </span>
                                                                        </div>
                                                                        <p
                                                                            className={
                                                                                item.senderRole === 'commandant'
                                                                                    ? 'text-xs font-semibold text-slate-700'
                                                                                    : 'text-xs font-medium text-slate-700 bg-blue-50/40 p-2.5 rounded-lg border border-blue-100/70'
                                                                            }
                                                                        >
                                                                            "{item.message}"
                                                                        </p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Latest Commandant's Remark Text */}
                                                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                                                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                                                                {threadHistory.length > 0
                                                                    ? `Commandant's Follow-Up Remark (${remark.commandantName})`
                                                                    : `Commandant's Remark (${remark.commandantName})`}
                                                            </p>
                                                            <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                                                                "{remark.remarkText}"
                                                            </p>
                                                        </div>

                                                        {/* Course Officer's Reply */}
                                                        {hasResponse ? (
                                                            <div className="pl-3 border-l-2 border-blue-600 space-y-1.5">
                                                                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-blue-700">
                                                                    <span className="flex items-center gap-1.5">
                                                                        <CornerDownRight size={12} />
                                                                        Course Officer Justification ({remark.courseOfficerName || submission.officerName})
                                                                    </span>
                                                                    {remark.respondedAt && (
                                                                        <span className="font-mono text-slate-400">
                                                                            {new Date(remark.respondedAt).toLocaleString([], {
                                                                                month: 'short',
                                                                                day: 'numeric',
                                                                                hour: '2-digit',
                                                                                minute: '2-digit'
                                                                            })}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs sm:text-sm font-medium text-slate-700 bg-blue-50/60 p-3 rounded-xl border border-blue-100">
                                                                    "{remark.officerResponse}"
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            <div className="pl-3 border-l-2 border-amber-300">
                                                                <p className="text-xs font-semibold text-amber-800 bg-amber-50/70 px-3 py-2 rounded-xl border border-amber-200/70 italic">
                                                                    Awaiting Course Officer's reply / justification...
                                                                </p>
                                                            </div>
                                                        )}

                                                        {/* Course Officer Reply Composer */}
                                                        {!isCommandant && !hasResponse && !isResolved && (
                                                            <div className="space-y-2.5 pt-1">
                                                                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600">
                                                                    Submit Official Justification / Explanation
                                                                </label>
                                                                <textarea
                                                                    rows={2}
                                                                    value={replyTexts[remark.id] || ''}
                                                                    onChange={e =>
                                                                        setReplyTexts(prev => ({
                                                                            ...prev,
                                                                            [remark.id]: e.target.value
                                                                        }))
                                                                    }
                                                                    placeholder="e.g., Cadets undergoing medical clearance at sick bay..."
                                                                    className="w-full p-3 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-xl text-xs font-medium text-slate-800 outline-none resize-none"
                                                                />
                                                                <div className="flex justify-end">
                                                                    <button
                                                                        type="button"
                                                                        disabled={
                                                                            submittingReplyId === remark.id ||
                                                                            !(replyTexts[remark.id] || '').trim()
                                                                        }
                                                                        onClick={() => handleOfficerReply(remark)}
                                                                        className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-xs transition-all"
                                                                    >
                                                                        {submittingReplyId === remark.id ? (
                                                                            <>
                                                                                <Loader2 size={13} className="animate-spin" />
                                                                                <span>Sending...</span>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <Send size={13} />
                                                                                <span>Submit Justification</span>
                                                                            </>
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Commandant Actions: Not Satisfied (Text Officer Again) & Acknowledge/Resolve */}
                                                        {isCommandant && (
                                                            <div className="pt-3 border-t border-slate-100 space-y-3">
                                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setFollowUpOpenById(prev => ({
                                                                                ...prev,
                                                                                [remark.id]: !prev[remark.id]
                                                                            }))
                                                                        }
                                                                        className={`w-full sm:w-auto min-h-[42px] px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 border transition-all ${
                                                                            isFollowUpOpen
                                                                                ? 'bg-amber-100 text-amber-900 border-amber-300'
                                                                                : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                                                                        }`}
                                                                    >
                                                                        <RotateCcw size={12} />
                                                                        <span>
                                                                            {hasResponse
                                                                                ? 'Not Satisfied • Text Officer Again'
                                                                                : 'Send Follow-Up Message'}
                                                                        </span>
                                                                    </button>

                                                                    {!isResolved && (
                                                                        <button
                                                                            type="button"
                                                                            disabled={resolvingId === remark.id}
                                                                            onClick={() => handleResolveRemark(remark)}
                                                                            className="w-full sm:w-auto min-h-[42px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-xs transition-all"
                                                                        >
                                                                            {resolvingId === remark.id ? (
                                                                                <Loader2 size={12} className="animate-spin" />
                                                                            ) : (
                                                                                <CheckCheck size={13} />
                                                                            )}
                                                                            <span>Acknowledge & Resolve</span>
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {/* Inline Follow-Up Composer when Commandant is not satisfied */}
                                                                {isFollowUpOpen && (
                                                                    <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                                                                        <p className="text-[10px] font-black uppercase tracking-wider text-amber-900">
                                                                            Follow-Up Directive to Course Officer (Re-opens Action Required)
                                                                        </p>
                                                                        <div className="flex flex-wrap gap-1.5">
                                                                            {FOLLOW_UP_PROMPTS.map((fp, fIdx) => (
                                                                                <button
                                                                                    key={fIdx}
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        setFollowUpTexts(prev => ({
                                                                                            ...prev,
                                                                                            [remark.id]: fp
                                                                                        }))
                                                                                    }
                                                                                    className="text-left px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100/70 text-slate-700 border border-amber-200 text-[10px] font-bold transition-colors"
                                                                                >
                                                                                    {fp}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                        <textarea
                                                                            rows={2}
                                                                            value={followUpTexts[remark.id] || ''}
                                                                            onChange={e =>
                                                                                setFollowUpTexts(prev => ({
                                                                                    ...prev,
                                                                                    [remark.id]: e.target.value
                                                                                }))
                                                                            }
                                                                            placeholder="State why the response is insufficient or issue additional instructions to the Course Officer..."
                                                                            className="w-full p-2.5 bg-white border border-amber-300 focus:border-blue-900 rounded-xl text-xs font-medium text-slate-800 outline-none resize-none"
                                                                        />
                                                                        <div className="flex justify-end gap-2">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    setFollowUpOpenById(prev => ({
                                                                                        ...prev,
                                                                                        [remark.id]: false
                                                                                    }))
                                                                                }
                                                                                className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase text-slate-500 hover:bg-slate-200/60"
                                                                            >
                                                                                Cancel
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                disabled={
                                                                                    submittingFollowUpId === remark.id ||
                                                                                    !(followUpTexts[remark.id] || '').trim()
                                                                                }
                                                                                onClick={() => handleSendFollowUp(remark)}
                                                                                className="px-4 py-1.5 bg-blue-900 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs"
                                                                            >
                                                                                {submittingFollowUpId === remark.id ? (
                                                                                    <Loader2 size={12} className="animate-spin" />
                                                                                ) : (
                                                                                    <Send size={12} />
                                                                                )}
                                                                                <span>Send to Course Officer</span>
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
                                </div>
                            </div>

                            {/* ── 3. Drawer Footer ── */}
                            <div className="px-4 py-3.5 sm:px-6 sm:py-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
                                <span className="text-[10px] font-mono text-slate-400 uppercase truncate">
                                    ID: {String(submission.id).slice(0, 12)}
                                </span>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-5 py-2.5 min-h-[42px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-colors shrink-0"
                                >
                                    Close Panel
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </div>
            )}
        </AnimatePresence>
    );
};

