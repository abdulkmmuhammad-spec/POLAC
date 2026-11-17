import React, { useState, useMemo, useEffect } from 'react';
import {
    MessageSquare,
    Shield,
    CheckCheck,
    Clock,
    AlertOctagon,
    Search,
    CheckCircle2,
    X,
    ChevronRight,
    CornerDownRight
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useParade } from '../../../context/ParadeContext';
import { dbService } from '../../../services/dbService';
import { CommandantRemark, SickbayVerification } from '../../../types';
import { formatRC, calculateCurrentLevel } from '../../../utils/rcHelpers';
import { parseMisconductRemark } from '../../../utils/notificationUtils';
import { ParadeRemarkDrawer, ParadeRemarkTarget } from '../Commandant/ParadeRemarkDrawer';
import { SickbayChatDrawer } from '../Medical/SickbayChatDrawer';

type StatusFilter = 'ALL' | 'NEEDS_REPLY' | 'AWAITING_REVIEW' | 'RESOLVED';

const formatRelativeTimestamp = (isoDate?: string): string => {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86_400_000;
    const targetTime = date.getTime();

    if (targetTime >= todayStart) {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    if (targetTime >= yesterdayStart) {
        return 'Yesterday';
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

interface AuthorityConversation {
    key: string;
    authorityTitle: string;
    monogram: string;
    remarks: CommandantRemark[];
    latestRemark: CommandantRemark;
    latestActivityAt: string;
    pendingCount: number; // Waiting on Officer reply
    awaitingReviewCount: number; // Officer replied, waiting on Senior Officer review
    resolvedCount: number;
    totalCount: number;
    hasMisconduct: boolean;
    latestPreviewText: string;
    latestParadeContext: string;
}

export const OfficerRemarksCenter: React.FC = () => {
    const { currentUser } = useAuth();
    const { remarks, records, courseSummary, yesterdaySummary, activeRC } = useParade();

    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    // Target drawer state
    const [drawerTarget, setDrawerTarget] = useState<ParadeRemarkTarget | null>(null);
    const [activeRemarkId, setActiveRemarkId] = useState<string | null>(null);
    const [selectedAuthority, setSelectedAuthority] = useState<string | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const officerCourseNumber =
        currentUser?.courseNumber ??
        (currentUser?.yearGroup ? activeRC - currentUser.yearGroup + 1 : undefined);

    // Medical Officer Sickbay threads targeted to this Course Officer's RC
    const [sickbayThreads, setSickbayThreads] = useState<SickbayVerification[]>([]);
    const [activeSickbayChat, setActiveSickbayChat] = useState<SickbayVerification | null>(null);

    useEffect(() => {
        if (!officerCourseNumber) return;
        const load = async () => {
            try {
                const items = await dbService.fetchSickbayVerifications({
                    courseNumber: officerCourseNumber
                });
                const targeted = items.filter(v => {
                    if (v.status !== 'not_admitted' && !v.clinicalNote && (!v.messages || v.messages.length === 0)) {
                        return false;
                    }
                    return !v.targetedRecipientRole || v.targetedRecipientRole === 'course_officer';
                });
                setSickbayThreads(targeted);
            } catch {
                // silent
            }
        };
        load();
        window.addEventListener('sickbay-verifications-updated', load);
        return () => window.removeEventListener('sickbay-verifications-updated', load);
    }, [officerCourseNumber]);

    const getNormalizedRoleTitle = (remark: CommandantRemark): string => {
        const raw = (remark.issuerRoleTitle || '').trim();
        const nameUpper = (remark.commandantName || '').trim().toUpperCase();
        if (
            raw.toLowerCase() === 'director field studies' &&
            (nameUpper === 'DIRECTOR FIELD STUDIES' || nameUpper === 'COMMANDANT')
        ) {
            return 'Commandant';
        }
        if (raw) return raw;
        return 'Commandant';
    };

    const getAuthorityMonogram = (title: string): string => {
        const lower = title.toLowerCase();
        if (lower.includes('commandant')) return 'CMD';
        if (lower.includes('field') || lower.includes('dfs')) return 'DFS';
        if (lower.includes('adjutant')) return 'ADJ';
        return title.slice(0, 3).toUpperCase();
    };

    // Filter remarks strictly scoped to this Course Officer's course
    const scopedRemarks = useMemo(() => {
        if (!currentUser) return [];
        return remarks.filter(r => {
            const matchesCourse =
                officerCourseNumber &&
                r.courseNumber &&
                Number(r.courseNumber) === Number(officerCourseNumber);

            const matchesOfficerId =
                r.courseOfficerId && String(r.courseOfficerId) === String(currentUser.id);

            const matchesOfficerName =
                r.courseOfficerName &&
                currentUser.fullName &&
                r.courseOfficerName.toLowerCase() === currentUser.fullName.toLowerCase();

            return matchesCourse || matchesOfficerId || matchesOfficerName;
        });
    }, [remarks, currentUser, officerCourseNumber]);

    // Group remarks into single rows per Senior Officer Authority Channel
    const conversations = useMemo<AuthorityConversation[]>(() => {
        const map = new Map<string, AuthorityConversation>();

        for (const r of scopedRemarks) {
            const authTitle = getNormalizedRoleTitle(r);
            const groupKey = authTitle.toLowerCase();

            const isResolved = r.status === 'resolved';
            const hasReply = Boolean(r.officerResponse && r.officerResponse.trim());
            const isPendingReply = !isResolved && r.status === 'pending' && !hasReply;
            const isAwaitingReview = !isResolved && hasReply;
            const isMisconduct = parseMisconductRemark(r.remarkText).isMisconduct;

            const rActivity = r.respondedAt || r.updatedAt || r.createdAt;

            let conv = map.get(groupKey);
            if (!conv) {
                conv = {
                    key: groupKey,
                    authorityTitle: authTitle,
                    monogram: getAuthorityMonogram(authTitle),
                    remarks: [r],
                    latestRemark: r,
                    latestActivityAt: rActivity,
                    pendingCount: isPendingReply ? 1 : 0,
                    awaitingReviewCount: isAwaitingReview ? 1 : 0,
                    resolvedCount: isResolved ? 1 : 0,
                    totalCount: 1,
                    hasMisconduct: isMisconduct,
                    latestPreviewText: '',
                    latestParadeContext: ''
                };
                map.set(groupKey, conv);
            } else {
                conv.remarks.push(r);
                conv.totalCount++;
                if (isPendingReply) conv.pendingCount++;
                if (isAwaitingReview) conv.awaitingReviewCount++;
                if (isResolved) conv.resolvedCount++;
                if (isMisconduct) conv.hasMisconduct = true;

                if (new Date(rActivity).getTime() > new Date(conv.latestActivityAt).getTime()) {
                    conv.latestActivityAt = rActivity;
                    conv.latestRemark = r;
                }
            }
        }

        // Construct 1-line message preview & parade context for each authority channel
        for (const conv of map.values()) {
            const latestR = conv.latestRemark;
            const hasOfficerReply = Boolean(latestR.officerResponse && latestR.officerResponse.trim());
            const parsedMeta = parseMisconductRemark(latestR.remarkText);

            if (hasOfficerReply) {
                conv.latestPreviewText = `You: ${String(latestR.officerResponse).trim()}`;
            } else {
                conv.latestPreviewText = `${conv.authorityTitle}: ${parsedMeta.cleanText}`;
            }

            const pType = String(latestR.paradeType || 'Muster').toLowerCase();
            const pTypeShort = pType === 'special' ? 'Special' : pType === 'tattoo' ? 'Tattoo' : 'Muster';
            let pDateShort = '';
            if (latestR.paradeDate) {
                const parsedD = new Date(latestR.paradeDate);
                if (!isNaN(parsedD.getTime())) {
                    pDateShort = parsedD.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }
            }
            conv.latestParadeContext = pDateShort ? `${pTypeShort} • ${pDateShort}` : pTypeShort;
        }

        return Array.from(map.values());
    }, [scopedRemarks]);

    // Metrics across authority conversations
    const metrics = useMemo(() => {
        let total = 0;
        let needsReply = 0;
        let awaitingReview = 0;
        let resolved = 0;

        for (const c of conversations) {
            total += c.totalCount;
            needsReply += c.pendingCount;
            awaitingReview += c.awaitingReviewCount;
            resolved += c.resolvedCount;
        }

        return { total, needsReply, awaitingReview, resolved };
    }, [conversations]);

    // Filter and sort conversations: Pending reply floats to top, then recency
    const filteredConversations = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();

        return conversations
            .filter(c => {
                if (statusFilter === 'NEEDS_REPLY' && c.pendingCount === 0) return false;
                if (statusFilter === 'AWAITING_REVIEW' && c.awaitingReviewCount === 0) return false;
                if (statusFilter === 'RESOLVED' && c.pendingCount > 0) return false;

                if (q) {
                    const allText = c.remarks
                        .map(r => `${r.remarkText} ${r.officerResponse || ''}`)
                        .join(' ')
                        .toLowerCase();

                    const haystack = `${c.authorityTitle} ${allText}`;
                    if (!haystack.includes(q)) return false;
                }
                return true;
            })
            .sort((a, b) => {
                // Tier 1: Channels with pending replies float to top
                const aPending = a.pendingCount > 0 ? 0 : 1;
                const bPending = b.pendingCount > 0 ? 0 : 1;
                if (aPending !== bPending) return aPending - bPending;

                // Tier 2: Recency
                return new Date(b.latestActivityAt).getTime() - new Date(a.latestActivityAt).getTime();
            });
    }, [conversations, statusFilter, searchQuery]);

    const handleOpenConversation = (conv: AuthorityConversation) => {
        const cNum = officerCourseNumber || conv.latestRemark.courseNumber || 0;
        setActiveRemarkId(conv.latestRemark.id);
        setSelectedAuthority(conv.authorityTitle);

        const summaryMatch =
            courseSummary.find(c => Number(c.courseNumber) === Number(cNum)) ||
            yesterdaySummary.find(c => Number(c.courseNumber) === Number(cNum));

        const matchedRecord = records.find(
            r =>
                (cNum > 0 && Number(r.courseNumber) === Number(cNum)) ||
                String(r.id) === String(conv.latestRemark.submissionId)
        );

        const targetData: ParadeRemarkTarget = {
            id: matchedRecord?.id || conv.latestRemark.submissionId || `rc-${cNum}-today`,
            officerId: currentUser?.id,
            officerName: currentUser?.fullName || `${formatRC(cNum)} Course Officer`,
            courseName: cNum ? formatRC(cNum) : 'Course',
            courseNumber: cNum || undefined,
            yearGroup: cNum ? calculateCurrentLevel(cNum, activeRC) : 1,
            date: conv.latestRemark.paradeDate || new Date().toISOString().split('T')[0],
            paradeType: String(conv.latestRemark.paradeType || 'MUSTER').toUpperCase(),
            presentCount: matchedRecord?.presentCount ?? summaryMatch?.present ?? 0,
            absentCount: matchedRecord?.absentCount ?? summaryMatch?.absent ?? 0,
            sickCount: matchedRecord?.sickCount ?? summaryMatch?.sick ?? 0,
            detentionCount: matchedRecord?.detentionCount ?? summaryMatch?.detention ?? 0,
            passCount: matchedRecord?.passCount ?? summaryMatch?.pass ?? 0,
            suspensionCount: matchedRecord?.suspensionCount ?? summaryMatch?.suspension ?? 0,
            yetToReportCount: matchedRecord?.yetToReportCount ?? summaryMatch?.yet_to_report ?? 0,
            grandTotal: matchedRecord?.grandTotal ?? summaryMatch?.total ?? 0
        };

        setDrawerTarget(targetData);
        setIsDrawerOpen(true);
    };

    return (
        <div className="space-y-4 pb-20 animate-in fade-in duration-200">
            {/* ── 1. Top Search & Status Filter Toolbar ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-3 sm:p-4 space-y-3">
                <div className="relative flex items-center">
                    <Search size={16} className="absolute left-3.5 text-slate-400 pointer-events-none" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search directives, cadet citations, or remarks..."
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-100/80 focus:bg-white border border-transparent focus:border-slate-300 rounded-full text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 rounded-full"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Status Filter Pill Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    <button
                        type="button"
                        onClick={() => setStatusFilter('ALL')}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap inline-flex items-center gap-1.5 ${
                            statusFilter === 'ALL'
                                ? 'bg-slate-900 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                        }`}
                    >
                        <span>All</span>
                        <span className={`text-[11px] ${statusFilter === 'ALL' ? 'text-slate-300' : 'text-slate-400'}`}>
                            {metrics.total}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setStatusFilter(statusFilter === 'NEEDS_REPLY' ? 'ALL' : 'NEEDS_REPLY')}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap inline-flex items-center gap-1.5 ${
                            statusFilter === 'NEEDS_REPLY'
                                ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                        }`}
                    >
                        {metrics.needsReply > 0 && statusFilter !== 'NEEDS_REPLY' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        )}
                        <span>Needs Reply</span>
                        <span className={`text-[11px] ${statusFilter === 'NEEDS_REPLY' ? 'text-slate-900/80' : 'text-slate-400'}`}>
                            {metrics.needsReply}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setStatusFilter(statusFilter === 'AWAITING_REVIEW' ? 'ALL' : 'AWAITING_REVIEW')}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap inline-flex items-center gap-1.5 ${
                            statusFilter === 'AWAITING_REVIEW'
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                        }`}
                    >
                        <span>Awaiting Review</span>
                        <span className={`text-[11px] ${statusFilter === 'AWAITING_REVIEW' ? 'text-blue-100' : 'text-slate-400'}`}>
                            {metrics.awaitingReview}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setStatusFilter(statusFilter === 'RESOLVED' ? 'ALL' : 'RESOLVED')}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap inline-flex items-center gap-1.5 ${
                            statusFilter === 'RESOLVED'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                        }`}
                    >
                        <span>Resolved</span>
                        <span className={`text-[11px] ${statusFilter === 'RESOLVED' ? 'text-emerald-100' : 'text-slate-400'}`}>
                            {metrics.resolved}
                        </span>
                    </button>
                </div>
            </div>

            {/* ── 2. WhatsApp/Instagram Authority Conversation List ── */}
            {filteredConversations.length === 0 && sickbayThreads.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                        <CheckCircle2 size={24} />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">
                        {conversations.length === 0 ? 'No Active Inquiries or Directives' : 'No Matching Inquiries'}
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                        {conversations.length === 0
                            ? `Senior Officer remarks and inquiries issued to ${
                                  officerCourseNumber ? formatRC(officerCourseNumber) : 'your course'
                              } will appear here for fast review and official justification.`
                            : 'No inquiries match your current search or filter selection.'}
                    </p>
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold"
                        >
                            Clear search
                        </button>
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden divide-y divide-slate-100">
                    {sickbayThreads
                        .filter(v => {
                            const q = searchQuery.trim().toLowerCase();
                            if (!q) return true;
                            return (
                                v.cadetName.toLowerCase().includes(q) ||
                                (v.medicalOfficerName || '').toLowerCase().includes(q) ||
                                (v.clinicalNote || '').toLowerCase().includes(q)
                            );
                        })
                        .filter(v => {
                            const tStatus = v.threadStatus || 'open';
                            if (statusFilter === 'RESOLVED') return tStatus === 'resolved';
                            if (statusFilter === 'NEEDS_REPLY') return tStatus === 'open';
                            if (statusFilter === 'AWAITING_REVIEW') return tStatus === 'replied';
                            return true;
                        })
                        .map(v => {
                            const msgs = v.messages || [];
                            const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
                            const previewText = lastMsg?.text || v.clinicalNote || 'Cadet flagged Not Admitted at Sickbay';
                            const isResolved = v.threadStatus === 'resolved';
                            const isReplied = v.threadStatus === 'replied';
                            const isNeedsReply = !isResolved && !isReplied;
                            const ringClass = isNeedsReply
                                ? 'bg-rose-50 text-rose-700 ring-2 ring-rose-500 ring-offset-2'
                                : isReplied
                                ? 'bg-blue-50 text-blue-900 ring-2 ring-blue-600 ring-offset-2'
                                : 'bg-slate-100 text-slate-600';

                            return (
                                <div
                                    key={`med-${v.id}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setActiveSickbayChat(v)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            setActiveSickbayChat(v);
                                        }
                                    }}
                                    className="px-4 py-3.5 flex items-center gap-3 hover:bg-slate-50/80 active:bg-slate-50 cursor-pointer transition-colors"
                                >
                                    <div className={`w-[46px] h-[46px] rounded-full flex items-center justify-center shrink-0 font-mono text-xs font-black tracking-tight ${ringClass}`}>
                                        MED
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className={`truncate text-sm ${isNeedsReply ? 'font-black text-slate-950' : 'font-semibold text-slate-800'}`}>
                                                {v.medicalOfficerName || 'Medical Officer'}
                                            </span>
                                            <span className="text-[11px] text-rose-600 font-semibold truncate">
                                                • {v.cadetName}
                                            </span>
                                        </div>
                                        <p className={`text-xs truncate mt-0.5 ${isNeedsReply ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>
                                            {lastMsg && lastMsg.senderRole === 'course_officer' ? 'You: ' : ''}
                                            {previewText}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end justify-center gap-1 shrink-0 pl-1">
                                        <span className="text-[11px] font-medium text-slate-400">
                                            {formatRelativeTimestamp(lastMsg?.createdAt || v.verifiedAt || v.createdAt)}
                                        </span>
                                        {isNeedsReply ? (
                                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                                        ) : isReplied ? (
                                            <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-600">
                                                <Clock size={13} />
                                                <span>In Review</span>
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                                                <CheckCheck size={14} />
                                                <span>Resolved</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    {filteredConversations.map(conv => {
                        const isPending = conv.pendingCount > 0;
                        const isAwaiting = !isPending && conv.awaitingReviewCount > 0;
                        const isResolved = !isPending && !isAwaiting;

                        // Instagram-style status ring
                        const ringClass = isPending
                            ? 'bg-amber-50 text-amber-950 ring-2 ring-amber-500 ring-offset-2'
                            : isAwaiting
                            ? 'bg-blue-50 text-blue-900 ring-2 ring-blue-600 ring-offset-2'
                            : 'bg-slate-100 text-slate-600';

                        const relativeTime = formatRelativeTimestamp(conv.latestActivityAt);

                        return (
                            <div
                                key={conv.key}
                                role="button"
                                tabIndex={0}
                                onClick={() => handleOpenConversation(conv)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleOpenConversation(conv);
                                    }
                                }}
                                className="px-4 py-3.5 flex items-center gap-3 hover:bg-slate-50/80 active:bg-slate-50 cursor-pointer transition-colors"
                            >
                                {/* 1. Left Avatar (46px circle with Instagram-style status ring) */}
                                <div
                                    className={`w-[46px] h-[46px] rounded-full flex items-center justify-center shrink-0 font-mono text-xs font-black tracking-tight ${ringClass}`}
                                >
                                    {conv.monogram}
                                </div>

                                {/* 2. Center Column (2-line stack) */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span
                                            className={`truncate text-sm ${
                                                isPending
                                                    ? 'font-black text-slate-950'
                                                    : 'font-semibold text-slate-800'
                                            }`}
                                        >
                                            {conv.authorityTitle}
                                        </span>
                                        {conv.latestParadeContext && (
                                            <span className="text-[11px] text-slate-400 font-medium shrink-0">
                                                [{conv.latestParadeContext}]
                                            </span>
                                        )}
                                        {conv.hasMisconduct && (
                                            <span
                                                className="text-rose-600 font-black text-xs shrink-0"
                                                title="Flagged Misconduct Case"
                                            >
                                                !
                                            </span>
                                        )}
                                    </div>

                                    <p
                                        className={`truncate text-sm mt-0.5 ${
                                            isPending
                                                ? 'text-slate-900 font-semibold'
                                                : 'text-slate-500 font-normal'
                                        }`}
                                    >
                                        {conv.latestPreviewText}
                                    </p>
                                </div>

                                {/* 3. Right Column: Timestamp & Action Badge */}
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                    <span
                                        className={`text-[11px] whitespace-nowrap ${
                                            isPending ? 'text-amber-700 font-bold' : 'text-slate-400'
                                        }`}
                                    >
                                        {relativeTime}
                                    </span>

                                    {isPending ? (
                                        <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow-2xs">
                                            Reply Needed ({conv.pendingCount})
                                        </span>
                                    ) : isAwaiting ? (
                                        <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-600">
                                            <Clock size={13} />
                                            <span>In Review</span>
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                                            <CheckCheck size={14} />
                                            <span>Resolved</span>
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── 3. Dedicated Chat Screen via ParadeRemarkDrawer ── */}
            <ParadeRemarkDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                submission={drawerTarget}
                targetCourseNumber={officerCourseNumber}
                targetAuthorityTitle={selectedAuthority}
                activeRemarkId={activeRemarkId}
            />

            {/* ── 4. Medical Officer Sickbay WhatsApp Chat Drawer ── */}
            <SickbayChatDrawer
                verification={activeSickbayChat}
                onClose={() => setActiveSickbayChat(null)}
                onUpdated={(updated) => {
                    setSickbayThreads(prev => prev.map(item => item.id === updated.id ? updated : item));
                    setActiveSickbayChat(updated);
                }}
            />
        </div>
    );
};

