import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    ArrowLeft,
    Send,
    CheckCheck,
    Clock,
    User,
    Loader2,
    Users,
    Shield,
    Eye,
    AlertOctagon,
    ChevronDown,
    ChevronUp,
    MessageSquarePlus,
    FileText,
    X,
    Calendar
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
import { parseMisconductRemark } from '../../../utils/notificationUtils';
import { markRemarkChatRead } from '../../../utils/executiveChatState';
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
    activeRemarkId?: string | null;
    targetCourseNumber?: number | null;
    targetAuthorityTitle?: string | null;
    isOpen: boolean;
    onClose: () => void;
    focusLog?: boolean;
}

const SENIOR_OFFICER_INITIAL_PROMPTS = [
    'Inquiry: Reason for low turnout / failure to fall out?',
    'Medical verification required for absentees.',
    "Commandant's Commendation for excellent turnout."
];

const SENIOR_OFFICER_FOLLOW_UP_PROMPTS = [
    'Justification insufficient — provide official medical or duty pass documentation.',
    'Clarify the exact whereabouts of the absent cadets immediately.',
    'Ensure all listed absentees report to the Orderly Room for verification.'
];

const COURSE_OFFICER_REPLY_PROMPTS = [
    'Cadets undergoing medical clearance at Sickbay; documentation filed.',
    'Formal query issued; cadet ordered to report to Orderly Room immediately.',
    'Cadet on authorized duty pass; pass permit verified.',
    'Turnout impacted by scheduled academic examination; attendance verified.'
];

interface UnifiedChatMessage {
    id: string;
    senderRole: 'commandant' | 'course_officer';
    senderName: string;
    senderTitle?: string;
    message: string;
    timestamp: string;
    isOwnMessage: boolean;
    paradeType: string;
    paradeDate: string;
    submissionId: string;
    remarkId: string;
    isMisconduct?: boolean;
    misconductMeta?: any;
}

interface TaggingParadeContext {
    submissionId: string;
    paradeType: string;
    date: string;
    label: string;
}

const formatParadeName = (type?: string | null): string => {
    const raw = String(type || 'muster').toLowerCase();
    if (raw === 'special') return 'Special Parade';
    if (raw === 'tattoo') return 'Tattoo Parade';
    return 'Muster Parade';
};

const formatShortDate = (isoOrDate?: string | null): string => {
    if (!isoOrDate) return '';
    const d = new Date(isoOrDate);
    if (isNaN(d.getTime())) return String(isoOrDate);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const ParadeRemarkDrawer: React.FC<ParadeRemarkDrawerProps> = ({
    submission,
    activeRemarkId = null,
    targetCourseNumber = null,
    targetAuthorityTitle = null,
    isOpen,
    onClose
}) => {
    const { currentUser } = useAuth();
    const { activeRC, activeDate, remarks, records, courseSummary, yesterdaySummary, refreshRemarks } = useParade();

    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isResolving, setIsResolving] = useState(false);

    useEffect(() => {
        if (!isOpen || !currentUser) return;
        const cNum = targetCourseNumber || submission?.courseNumber || currentUser.courseNumber || 0;
        if (!cNum) return;
        const courseRemarks = remarks.filter(r => Number(r.courseNumber) === Number(cNum));
        let maxMs = 0;
        for (const r of courseRemarks) {
            const cMs = new Date(r.createdAt).getTime();
            const rMs = r.respondedAt ? new Date(r.respondedAt).getTime() : 0;
            if (!Number.isNaN(cMs) && cMs > maxMs) maxMs = cMs;
            if (!Number.isNaN(rMs) && rMs > maxMs) maxMs = rMs;
        }
        markRemarkChatRead(currentUser.id, `course_${cNum}`, maxMs);
    }, [isOpen, currentUser, targetCourseNumber, submission?.courseNumber, remarks]);

    // Collapsible Pinned Context / Parade Roll state
    const [isRollExpanded, setIsRollExpanded] = useState(false);
    const [cadets, setCadets] = useState<CadetDetail[]>([]);
    const [isLoadingCadets, setIsLoadingCadets] = useState(false);
    const [expandedFullHistory, setExpandedFullHistory] = useState(false);

    // Guardrail 1: Tagging parade context state & switcher
    const [activeTaggingParade, setActiveTaggingParade] = useState<TaggingParadeContext | null>(null);
    const [isParadeSelectorOpen, setIsParadeSelectorOpen] = useState(false);
    const [activeRollSubmissionId, setActiveRollSubmissionId] = useState<string | null>(null);

    // Roll Dynamic Highlight Animation state
    const [isRollFlashing, setIsRollFlashing] = useState(false);
    const rollFlashTimerRef = useRef<NodeJS.Timeout | null>(null);

    const chatEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // 1:1 Swipe-to-Dismiss Interactive Physics references
    const drawerPanelRef = useRef<HTMLDivElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);
    const drawerTouchStartX = useRef<number>(0);
    const drawerTouchStartY = useRef<number>(0);
    const drawerTouchStartTime = useRef<number>(0);
    const isDraggingDrawer = useRef<boolean>(false);
    const isDrawerLockedVertical = useRef<boolean>(false);

    const isCommandant = currentUser?.role === UserRole.COMMANDANT;
    const isAdmin = currentUser?.role === UserRole.ADMIN;
    const isCourseOfficer = currentUser?.role === UserRole.COURSE_OFFICER;
    const currentOfficerDesignation = (currentUser?.designation || 'Commandant').trim();

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

    const isRemarkOwner = (remark: CommandantRemark): boolean => {
        if (!currentUser || currentUser.role !== UserRole.COMMANDANT) return false;
        if (
            remark.commandantId !== null &&
            remark.commandantId !== undefined &&
            String(remark.commandantId).trim() !== ''
        ) {
            return String(remark.commandantId) === String(currentUser.id);
        }
        const remarkTitle = getNormalizedRoleTitle(remark).toLowerCase();
        const myDesignation = (currentUser.designation || 'Commandant').trim().toLowerCase();
        if (remarkTitle === myDesignation) return true;
        return (
            (remark.commandantName || '').trim().toLowerCase() ===
            (currentUser.fullName || '').trim().toLowerCase()
        );
    };

    const getCleanThread = (remark: CommandantRemark) => {
        const raw = remark.thread;
        if (!Array.isArray(raw) || raw.length === 0) return [];
        const seen = new Set<string>();
        const cleaned: NonNullable<CommandantRemark['thread']> = [];
        const normActiveRemark = String(remark.remarkText || '').trim().toLowerCase();
        const normActiveResponse = String(remark.officerResponse || '').trim().toLowerCase();

        for (const item of raw) {
            if (!item || !item.message) continue;
            const msgNorm = String(item.message).trim().toLowerCase();
            if (!msgNorm) continue;
            const role = item.senderRole === 'course_officer' ? 'course_officer' : 'commandant';

            if (role === 'commandant' && msgNorm === normActiveRemark) continue;
            if (role === 'course_officer' && normActiveResponse && msgNorm === normActiveResponse) continue;

            const key = `${role}::${msgNorm}`;
            if (seen.has(key)) continue;
            seen.add(key);
            cleaned.push(item);
        }

        return cleaned.slice(-20);
    };

    const getRemarkMisconductMeta = (remark: CommandantRemark) => {
        const direct = parseMisconductRemark(remark.remarkText);
        if (direct.isMisconduct) return direct;
        const cleanHistory = getCleanThread(remark);
        for (const item of cleanHistory) {
            const parsedItem = parseMisconductRemark(item.message);
            if (parsedItem.isMisconduct) {
                return {
                    ...parsedItem,
                    cleanText: direct.cleanText
                };
            }
        }
        return direct;
    };

    // Resolved course number
    const courseNum =
        targetCourseNumber ||
        submission?.courseNumber ||
        (submission as any)?.yearGroup ||
        (isCourseOfficer ? currentUser?.courseNumber : undefined) ||
        0;

    // All remarks for this Regular Course
    const courseRemarks = useMemo(() => {
        if (!courseNum) {
            if (!submission) return [];
            return remarks.filter(r => String(r.submissionId) === String(submission.id));
        }
        return remarks.filter(r => Number(r.courseNumber) === Number(courseNum));
    }, [remarks, courseNum, submission]);

    // Distinct Senior Officer Authority channels for this course
    const distinctAuthorities = useMemo(() => {
        const list: string[] = [];
        courseRemarks.forEach(r => {
            const title = getNormalizedRoleTitle(r);
            if (!list.some(a => a.toLowerCase() === title.toLowerCase())) {
                list.push(title);
            }
        });
        if (list.length === 0 && currentOfficerDesignation) {
            list.push(currentOfficerDesignation);
        }
        return list;
    }, [courseRemarks, currentOfficerDesignation]);

    // Active Authority Channel selection
    const [selectedAuthority, setSelectedAuthority] = useState<string>('Commandant');

    useEffect(() => {
        if (!isOpen) return;
        if (targetAuthorityTitle) {
            setSelectedAuthority(targetAuthorityTitle);
        } else if (activeRemarkId) {
            const found = remarks.find(r => String(r.id) === String(activeRemarkId));
            if (found) {
                setSelectedAuthority(getNormalizedRoleTitle(found));
            }
        } else if (isCommandant && currentOfficerDesignation) {
            setSelectedAuthority(currentOfficerDesignation);
        } else if (distinctAuthorities.length > 0) {
            setSelectedAuthority(distinctAuthorities[0]);
        }
    }, [isOpen, targetAuthorityTitle, activeRemarkId, remarks, isCommandant, currentOfficerDesignation, distinctAuthorities]);

    // Remarks filtered strictly by the selected Senior Officer authority channel
    const authorityRemarks = useMemo(() => {
        if (!selectedAuthority) return courseRemarks;
        return courseRemarks.filter(
            r => getNormalizedRoleTitle(r).toLowerCase() === selectedAuthority.toLowerCase()
        );
    }, [courseRemarks, selectedAuthority]);

    // Available Parade Submissions for this Course (Guardrail 1: Historical Parade Switcher)
    const availableParadesForCourse = useMemo<TaggingParadeContext[]>(() => {
        const map = new Map<string, TaggingParadeContext>();

        // 1. From records
        records
            .filter(r => Number(r.courseNumber) === Number(courseNum))
            .forEach(r => {
                const pType = String(r.paradeType || 'muster').toLowerCase();
                const key = `${r.date}::${pType}`;
                map.set(key, {
                    submissionId: String(r.id),
                    paradeType: pType,
                    date: r.date,
                    label: `${formatParadeName(r.paradeType)} • ${formatShortDate(r.date)}`
                });
            });

        // 2. From courseSummary / yesterdaySummary
        const cs =
            courseSummary.find(c => Number(c.courseNumber) === Number(courseNum)) ||
            yesterdaySummary.find(c => Number(c.courseNumber) === Number(courseNum));
        if (cs?.latestSubmission) {
            const sub = cs.latestSubmission;
            const pType = String(sub.paradeType || 'muster').toLowerCase();
            const key = `${sub.date}::${pType}`;
            if (!map.has(key)) {
                map.set(key, {
                    submissionId: String(sub.id),
                    paradeType: pType,
                    date: sub.date,
                    label: `${formatParadeName(sub.paradeType)} • ${formatShortDate(sub.date)}`
                });
            }
        }

        // 3. From authorityRemarks
        authorityRemarks.forEach(r => {
            if (r.paradeDate) {
                const pType = String(r.paradeType || 'muster').toLowerCase();
                const key = `${r.paradeDate}::${pType}`;
                if (!map.has(key)) {
                    map.set(key, {
                        submissionId: String(r.submissionId),
                        paradeType: pType,
                        date: r.paradeDate,
                        label: `${formatParadeName(pType)} • ${formatShortDate(r.paradeDate)}`
                    });
                }
            }
        });

        return Array.from(map.values()).sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
    }, [records, courseSummary, yesterdaySummary, authorityRemarks, courseNum]);

    // Initial Active Tagging Parade Auto-Selection (Guardrail 1)
    useEffect(() => {
        if (!isOpen) return;

        if (submission && submission.date && submission.paradeType) {
            const pType = String(submission.paradeType).toLowerCase();
            setActiveTaggingParade({
                submissionId: String(submission.id),
                paradeType: pType,
                date: submission.date,
                label: `${formatParadeName(pType)} • ${formatShortDate(submission.date)}`
            });
            return;
        }

        const activeR =
            authorityRemarks.find(r => r.status === 'addressed' || (r.status === 'pending' && Boolean(r.officerResponse))) ||
            authorityRemarks.find(r => r.status === 'pending');

        if (activeR && activeR.paradeDate) {
            const pType = String(activeR.paradeType || 'muster').toLowerCase();
            setActiveTaggingParade({
                submissionId: String(activeR.submissionId),
                paradeType: pType,
                date: activeR.paradeDate,
                label: `${formatParadeName(pType)} • ${formatShortDate(activeR.paradeDate)}`
            });
            return;
        }

        if (availableParadesForCourse.length > 0) {
            setActiveTaggingParade(availableParadesForCourse[0]);
        } else {
            setActiveTaggingParade(null);
        }
    }, [isOpen, submission?.id, authorityRemarks.length]);

    // Load muster roll cadets for a given parade submission
    const loadRollForSubmission = async (subId: string) => {
        setActiveRollSubmissionId(subId);
        setIsLoadingCadets(true);
        try {
            const { data } = await dbService.getParadeDetails(subId);
            setCadets(data || []);
        } catch {
            setCadets([]);
        } finally {
            setIsLoadingCadets(false);
        }
    };

    useEffect(() => {
        if (!isOpen) {
            setCadets([]);
            return;
        }
        const initialSubId = activeTaggingParade?.submissionId || (submission?.id ? String(submission.id) : null);
        if (initialSubId) {
            loadRollForSubmission(initialSubId);
        }
    }, [isOpen, submission?.id]);

    const handleSelectParadeContext = (subId: string, pType: string, date: string) => {
        const normType = String(pType || 'muster').toLowerCase();
        const tag: TaggingParadeContext = {
            submissionId: String(subId),
            paradeType: normType,
            date,
            label: `${formatParadeName(normType)} • ${formatShortDate(date)}`
        };
        setActiveTaggingParade(tag);
        setIsParadeSelectorOpen(false);
        loadRollForSubmission(subId);
        setIsRollExpanded(true);

        // Flash and pulse the pinned roll banner at the top so the user immediately sees the change
        setIsRollFlashing(true);
        if (rollFlashTimerRef.current) clearTimeout(rollFlashTimerRef.current);
        rollFlashTimerRef.current = setTimeout(() => setIsRollFlashing(false), 2600);

        // Smoothly scroll chat container towards the top so the roll banner is immediately in view
        chatContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });

        toast.success(`📋 Parade state loaded at top for ${tag.label} (inspect above)`, {
            id: 'inspect-roll-toast',
            duration: 3500
        });
    };

    // Unified Chronological Chat Timeline across all parades for (Course, Authority)
    const unifiedChatMessages = useMemo<UnifiedChatMessage[]>(() => {
        if (authorityRemarks.length === 0) return [];

        const rawList: UnifiedChatMessage[] = [];
        const seen = new Set<string>();

        const sortedRemarks = [...authorityRemarks].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        for (const r of sortedRemarks) {
            const issuerTitle = getNormalizedRoleTitle(r);
            const ownsThis = isRemarkOwner(r);
            const rDate = r.paradeDate || r.createdAt.split('T')[0];
            const rType = String(r.paradeType || 'muster').toLowerCase();
            const rSubId = String(r.submissionId);
            const rMisconduct = getRemarkMisconductMeta(r);

            // 1. Thread messages
            const cleanHistory = getCleanThread(r);
            for (const item of cleanHistory) {
                const isCmd = item.senderRole === 'commandant';
                const cleanText = parseMisconductRemark(item.message).cleanText;
                const itemDate = (item as any).paradeDate || rDate;
                const dedupeKey = `${item.senderRole}::${cleanText.toLowerCase()}::${itemDate}`;
                if (seen.has(dedupeKey)) continue;
                seen.add(dedupeKey);

                const isOwn = (isCmd && isCommandant && ownsThis) || (!isCmd && isCourseOfficer);
                const normalizedSenderName =
                    String(item.senderName || '').trim().toUpperCase() === 'DIRECTOR FIELD STUDIES' &&
                    issuerTitle.toLowerCase() === 'commandant'
                        ? 'COMMANDANT'
                        : item.senderName;

                rawList.push({
                    id: item.id || `msg-${Date.now()}-${Math.random()}`,
                    senderRole: item.senderRole,
                    senderName: isCmd ? normalizedSenderName : item.senderName,
                    senderTitle: isCmd ? (item.senderTitle || issuerTitle) : 'Course Officer',
                    message: cleanText,
                    timestamp: item.timestamp,
                    isOwnMessage: isOwn,
                    paradeType: (item as any).paradeType || rType,
                    paradeDate: itemDate,
                    submissionId: (item as any).submissionId || rSubId,
                    remarkId: r.id,
                    isMisconduct: rMisconduct.isMisconduct,
                    misconductMeta: rMisconduct
                });
            }

            // 2. Head directive
            const cleanHeadDirective = parseMisconductRemark(r.remarkText).cleanText;
            const headDedupeKey = `commandant::${cleanHeadDirective.toLowerCase()}::${rDate}`;
            if (!seen.has(headDedupeKey)) {
                seen.add(headDedupeKey);
                const headTime = cleanHistory.length > 0 ? (r.updatedAt || r.createdAt) : r.createdAt;
                const normalizedCmdName =
                    String(r.commandantName || '').trim().toUpperCase() === 'DIRECTOR FIELD STUDIES' &&
                    issuerTitle.toLowerCase() === 'commandant'
                        ? 'COMMANDANT'
                        : r.commandantName || issuerTitle;

                rawList.push({
                    id: `head-cmd-${r.id}`,
                    senderRole: 'commandant',
                    senderName: normalizedCmdName,
                    senderTitle: issuerTitle,
                    message: cleanHeadDirective,
                    timestamp: headTime,
                    isOwnMessage: Boolean(isCommandant && ownsThis),
                    paradeType: rType,
                    paradeDate: rDate,
                    submissionId: rSubId,
                    remarkId: r.id,
                    isMisconduct: rMisconduct.isMisconduct,
                    misconductMeta: rMisconduct
                });
            }

            // 3. Head officer response
            if (r.officerResponse && r.officerResponse.trim()) {
                const cleanResp = r.officerResponse.trim();
                const respDedupeKey = `course_officer::${cleanResp.toLowerCase()}::${rDate}`;
                if (!seen.has(respDedupeKey)) {
                    seen.add(respDedupeKey);
                    const respTime = r.respondedAt || r.updatedAt || r.createdAt;
                    rawList.push({
                        id: `head-off-${r.id}`,
                        senderRole: 'course_officer',
                        senderName: r.courseOfficerName || submission?.officerName || 'Course Officer',
                        senderTitle: 'Course Officer',
                        message: cleanResp,
                        timestamp: respTime,
                        isOwnMessage: Boolean(isCourseOfficer),
                        paradeType: rType,
                        paradeDate: rDate,
                        submissionId: rSubId,
                        remarkId: r.id
                    });
                }
            }
        }

        return rawList.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }, [authorityRemarks, isCommandant, isCourseOfficer, submission, currentUser]);

    // Auto-scroll chat to bottom
    useEffect(() => {
        if (isOpen && unifiedChatMessages.length > 0) {
            const timer = setTimeout(() => {
                chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }, 120);
            return () => clearTimeout(timer);
        }
    }, [isOpen, unifiedChatMessages.length]);

    // Reset 1:1 drawer drag position when opening (must be called unconditionally before any return)
    useEffect(() => {
        if (isOpen && drawerPanelRef.current) {
            drawerPanelRef.current.style.transform = '';
            drawerPanelRef.current.style.transition = '';
            if (backdropRef.current) {
                backdropRef.current.style.opacity = '';
                backdropRef.current.style.transition = '';
            }
        }
    }, [isOpen]);

    const nonPresentCadets = cadets.filter(c => c.status !== CadetStatus.PRESENT);
    const rcLabel = courseNum > 0 ? formatRC(courseNum) : submission?.courseName || 'Course';
    const rcShortCode = courseNum > 0 ? `RC ${courseNum}` : 'HQ';
    const officerDisplayName =
        authorityRemarks[0]?.courseOfficerName || submission?.officerName || `${rcLabel} Course Officer`;

    // Multi-Remark Resolution & Lifecycle State (Guardrail 2)
    const openRemarks = authorityRemarks.filter(r => r.status !== 'resolved');
    const isResolved = authorityRemarks.length > 0 && openRemarks.length === 0;
    const hasOfficerResponse = authorityRemarks.some(
        r => r.status !== 'resolved' && (r.status === 'addressed' || Boolean(r.officerResponse))
    );
    const ownsActiveThread = authorityRemarks.some(r => isRemarkOwner(r));

    // Active Misconduct Metadata
    const latestMisconduct = authorityRemarks
        .map(r => getRemarkMisconductMeta(r))
        .find(m => m.isMisconduct);
    const isMisconduct = Boolean(latestMisconduct?.isMisconduct);

    // Permission checks for input composer
    const canSendAsSeniorOfficer = isCommandant && (authorityRemarks.length === 0 || ownsActiveThread);
    const canSendAsCourseOfficer = isCourseOfficer && authorityRemarks.some(r => r.status !== 'resolved');
    const canComposeMessage = canSendAsSeniorOfficer || canSendAsCourseOfficer;

    const quickPrompts = canSendAsCourseOfficer
        ? COURSE_OFFICER_REPLY_PROMPTS
        : authorityRemarks.length > 0
        ? SENIOR_OFFICER_FOLLOW_UP_PROMPTS
        : SENIOR_OFFICER_INITIAL_PROMPTS;

    const handleInsertCadetReference = (cadet: CadetDetail) => {
        if (!canComposeMessage) return;
        const tag = `${cadet.name} (${cadet.squad} - ${getStatusFullLabel(cadet.status)})`;
        setInputText(prev => {
            const trimmed = prev.trim();
            if (!trimmed) return `Inquiry regarding ${tag}: please provide justification.`;
            return `${trimmed} [${tag}]`;
        });
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = inputText.trim();
        if (!trimmed || !canComposeMessage) return;

        setIsSending(true);
        try {
            const targetSubId =
                activeTaggingParade?.submissionId ||
                submission?.id ||
                `rc-${courseNum}-${activeDate || new Date().toISOString().split('T')[0]}`;
            const targetParadeType = activeTaggingParade?.paradeType || String(submission?.paradeType || 'muster');
            const targetParadeDate = activeTaggingParade?.date || submission?.date || new Date().toISOString().split('T')[0];

            if (canSendAsCourseOfficer) {
                const targetRemark =
                    authorityRemarks.find(r => r.status === 'pending') ||
                    authorityRemarks.find(r => r.status !== 'resolved') ||
                    authorityRemarks[0];
                if (targetRemark) {
                    await dbService.respondToCommandantRemark({
                        remarkId: targetRemark.id,
                        officerResponse: trimmed,
                        officerName: currentUser?.fullName || officerDisplayName,
                        officerId: currentUser?.id
                    });
                    toast.success('Reply sent.');
                }
            } else if (canSendAsSeniorOfficer) {
                const existingRemark = authorityRemarks.find(r => isRemarkOwner(r)) || authorityRemarks[0];
                if (existingRemark) {
                    await dbService.followUpCommandantRemark({
                        remark: {
                            ...existingRemark,
                            thread: getCleanThread(existingRemark)
                        },
                        followUpText: trimmed,
                        commandantName: currentUser?.fullName || currentOfficerDesignation.toUpperCase(),
                        commandantId: currentUser?.id,
                        issuerRoleTitle: currentOfficerDesignation,
                        paradeType: targetParadeType,
                        paradeDate: targetParadeDate,
                        submissionId: targetSubId
                    });
                    toast.success('Directive sent.');
                } else {
                    await dbService.createCommandantRemark({
                        submissionId: targetSubId,
                        commandantId: currentUser?.id || null,
                        commandantName: currentUser?.fullName || currentOfficerDesignation.toUpperCase(),
                        issuerRoleTitle: currentOfficerDesignation,
                        courseOfficerId: submission?.officerId || null,
                        courseOfficerName: officerDisplayName,
                        courseNumber: courseNum || undefined,
                        paradeType: targetParadeType,
                        paradeDate: targetParadeDate,
                        remarkText: trimmed
                    });
                    toast.success(`Directive sent to ${officerDisplayName}.`);
                }
            }

            setInputText('');
            await refreshRemarks();
        } catch (err: any) {
            console.error('Failed to send message:', err);
            toast.error(err?.message || 'Failed to send message.');
        } finally {
            setIsSending(false);
        }
    };

    // Guardrail 2: Multi-Remark Resolution in Chat Header
    const handleResolve = async () => {
        const remarksToResolve = authorityRemarks.filter(r => r.status !== 'resolved' && isRemarkOwner(r));
        if (remarksToResolve.length === 0) return;

        setIsResolving(true);
        try {
            for (const r of remarksToResolve) {
                await dbService.resolveCommandantRemark({
                    remarkId: r.id,
                    commandantName: currentUser?.fullName || currentOfficerDesignation.toUpperCase(),
                    commandantId: currentUser?.id,
                    issuerRoleTitle: currentOfficerDesignation
                });
            }
            await refreshRemarks();
            toast.success('Conversation marked as Resolved.');
        } catch {
            toast.error('Failed to resolve conversation.');
        } finally {
            setIsResolving(false);
        }
    };

    const handleDrawerTouchStart = (e: React.TouchEvent) => {
        if (window.innerWidth >= 768 || e.touches.length !== 1) return;

        const target = e.target as HTMLElement | null;
        if (!target) return;

        // Ignore if touch started in quick prompts or explicit no-drawer-swipe elements
        if (target.closest('[data-no-drawer-swipe="true"]')) {
            isDraggingDrawer.current = false;
            return;
        }

        // Ignore interactive inputs, selects, textareas
        if (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable ||
            target.closest('input, textarea, select, [contenteditable="true"]')
        ) {
            isDraggingDrawer.current = false;
            return;
        }

        drawerTouchStartX.current = e.touches[0].clientX;
        drawerTouchStartY.current = e.touches[0].clientY;
        drawerTouchStartTime.current = Date.now();
        isDraggingDrawer.current = false;
        isDrawerLockedVertical.current = false;
    };

    const handleDrawerTouchMove = (e: React.TouchEvent) => {
        if (window.innerWidth >= 768 || e.touches.length !== 1 || isDrawerLockedVertical.current) return;

        const touch = e.touches[0];
        const dx = touch.clientX - drawerTouchStartX.current;
        const dy = touch.clientY - drawerTouchStartY.current;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // Lock to vertical scroll if vertical intent detected early
        if (!isDraggingDrawer.current && absDy > 10 && absDy >= absDx) {
            isDrawerLockedVertical.current = true;
            return;
        }

        // Left-to-right swipe check: dx > 0 and dx > absDy * 1.4
        if (!isDraggingDrawer.current && dx > 8 && dx > absDy * 1.4) {
            isDraggingDrawer.current = true;
        }

        if (isDraggingDrawer.current && drawerPanelRef.current) {
            const dragX = Math.max(0, dx);
            // Zero-latency 1:1 finger tracking (disable CSS transition during active touch move)
            drawerPanelRef.current.style.transition = 'none';
            drawerPanelRef.current.style.transform = `translateX(${dragX}px)`;

            // Proportional backdrop opacity fade (1 - dx / drawerWidth)
            const drawerWidth = drawerPanelRef.current.offsetWidth || window.innerWidth;
            const backdropOpacity = Math.max(0, 1 - dragX / drawerWidth);
            if (backdropRef.current) {
                backdropRef.current.style.transition = 'none';
                backdropRef.current.style.opacity = String(backdropOpacity);
            }
        }
    };

    const handleDrawerTouchEnd = (e: React.TouchEvent) => {
        if (!isDraggingDrawer.current || !drawerPanelRef.current) {
            isDraggingDrawer.current = false;
            return;
        }
        isDraggingDrawer.current = false;

        const touch = e.changedTouches[0];
        const dx = touch.clientX - drawerTouchStartX.current;
        const dt = Math.max(1, Date.now() - drawerTouchStartTime.current);
        const velocityX = Math.max(0, dx) / dt;

        // Re-enable a crisp 220ms cubic-bezier(0.22, 1, 0.36, 1) spring transition
        drawerPanelRef.current.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)';
        if (backdropRef.current) {
            backdropRef.current.style.transition = 'opacity 220ms cubic-bezier(0.22, 1, 0.36, 1)';
        }

        // Dismiss criteria: dx > window.innerWidth * 0.32 OR velocityX > 0.55 px/ms
        const shouldDismiss = dx > window.innerWidth * 0.32 || velocityX > 0.55;

        if (shouldDismiss) {
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try { navigator.vibrate(10); } catch { /* ignore */ }
            }
            drawerPanelRef.current.style.transform = 'translateX(100%)';
            if (backdropRef.current) {
                backdropRef.current.style.opacity = '0';
            }
            setTimeout(() => {
                onClose();
            }, 220);
        } else {
            // Spring smoothly back to translateX(0px)
            drawerPanelRef.current.style.transform = 'translateX(0px)';
            if (backdropRef.current) {
                backdropRef.current.style.opacity = '1';
            }
        }
    };

    const visibleMessages =
        expandedFullHistory || unifiedChatMessages.length <= 6
            ? unifiedChatMessages
            : unifiedChatMessages.slice(-6);
    const hiddenMessageCount = Math.max(0, unifiedChatMessages.length - visibleMessages.length);

    // Context attendance stats for the roll inspector
    const displayRecord =
        records.find(r => String(r.id) === String(activeTaggingParade?.submissionId || submission?.id)) ||
        submission;

    if (!submission && !courseNum) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[120] overflow-hidden" data-drawer-open="true">
                    {/* Backdrop */}
                    <div
                        ref={backdropRef}
                        onClick={onClose}
                        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-200"
                    />

                    {/* Full-Screen Mobile Sheet / Right Slide-Over on Tablet & Desktop (with 1:1 swipe-to-dismiss) */}
                    <div className="fixed inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:max-w-lg w-full flex">
                        <motion.div
                            ref={drawerPanelRef}
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                            onTouchStart={handleDrawerTouchStart}
                            onTouchMove={handleDrawerTouchMove}
                            onTouchEnd={handleDrawerTouchEnd}
                            onTouchCancel={handleDrawerTouchEnd}
                            className="w-full bg-white shadow-2xl sm:border-l border-slate-200 flex flex-col h-full overflow-hidden touch-pan-y"
                        >
                            {/* ── 1. Sticky Chat Header (WhatsApp / Instagram DM Style) ── */}
                            <div className="bg-slate-900 text-white px-3.5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-5 sm:pb-3.5 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
                                <div className="flex items-center gap-3 min-w-0">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="p-2 -ml-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors shrink-0"
                                        aria-label="Back"
                                    >
                                        <ArrowLeft size={20} />
                                    </button>

                                    {/* Clean RC Monogram Avatar */}
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center font-mono text-[11px] font-bold tracking-tight shrink-0 border ${
                                            isMisconduct
                                                ? 'bg-rose-600/90 border-rose-400/40 text-white'
                                                : 'bg-blue-800 border-blue-500/30 text-white'
                                        }`}
                                    >
                                        {rcShortCode}
                                    </div>

                                    <div className="min-w-0">
                                        <h3 className="text-sm sm:text-[15px] font-bold text-white truncate leading-tight">
                                            {officerDisplayName}
                                        </h3>
                                        <p className="text-xs text-slate-400 truncate mt-0.5">
                                            {rcLabel} • {selectedAuthority} Channel
                                        </p>
                                    </div>
                                </div>

                                {/* Right Header Actions: Roll Toggle & Primary Resolve Button */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setIsRollExpanded(prev => !prev)}
                                        className={`px-2.5 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1 transition-all border ${
                                            isRollFlashing
                                                ? 'bg-blue-600 text-white border-blue-400 ring-2 ring-blue-300 ring-offset-1 animate-pulse shadow-md'
                                                : isRollExpanded
                                                ? 'bg-white text-slate-900 border-white'
                                                : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                                        }`}
                                    >
                                        <FileText size={12} />
                                        <span>Parade State</span>
                                    </button>

                                    {isCommandant && ownsActiveThread && !isResolved && (
                                        <button
                                            type="button"
                                            disabled={isResolving}
                                            onClick={handleResolve}
                                            className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold flex items-center gap-1 shadow-xs transition-all"
                                        >
                                            {isResolving ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                                <CheckCheck size={13} />
                                            )}
                                            <span>Resolve</span>
                                        </button>
                                    )}

                                    {isResolved && (
                                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                                            <CheckCheck size={12} />
                                            <span>Resolved</span>
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* ── 2. Pinned Context Banner & Multi-Authority Switcher (Only if >= 2 authorities) ── */}
                            <div className={`transition-all duration-300 shrink-0 ${
                                isRollFlashing
                                    ? 'bg-blue-50/95 ring-2 ring-blue-500 shadow-md border-b-2 border-blue-500'
                                    : 'bg-slate-50 border-b border-slate-200'
                            }`}>
                                <button
                                    type="button"
                                    onClick={() => setIsRollExpanded(prev => !prev)}
                                    className="w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-100/80 transition-colors"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${isRollFlashing ? 'bg-blue-600 animate-ping' : 'bg-blue-600'}`} />

                                        {/* Dynamic Active Parade Label */}
                                        <span className="text-xs font-bold text-slate-900 truncate">
                                            {activeTaggingParade ? (
                                                <span className="text-blue-900 font-black">
                                                    Viewing: {activeTaggingParade.label}
                                                </span>
                                            ) : isMisconduct && latestMisconduct ? (
                                                <>
                                                    <span className="text-rose-700 font-bold">Misconduct: </span>
                                                    <span>{latestMisconduct.cadetName || 'Flagged Cadet'}</span>
                                                    {latestMisconduct.squad ? ` (${latestMisconduct.squad})` : ''}
                                                    {latestMisconduct.absences ? ` • ${latestMisconduct.absences}x Absent` : ''}
                                                </>
                                            ) : displayRecord && displayRecord.grandTotal > 0 ? (
                                                <>
                                                    {formatParadeName(displayRecord.paradeType)} • {formatShortDate(displayRecord.date)}: Present {displayRecord.presentCount}/{displayRecord.grandTotal}
                                                </>
                                            ) : (
                                                <>Parade State • Tap to Inspect</>
                                            )}
                                        </span>

                                        {isRollFlashing && (
                                            <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-[9px] font-black uppercase tracking-wider shrink-0 animate-pulse shadow-xs">
                                                Live Parade State
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 shrink-0">
                                        <span>{isRollExpanded ? 'Hide' : 'Details'}</span>
                                        {isRollExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </div>
                                </button>

                                {/* Multi-Authority Switcher (Only rendered if >= 2 distinct authorities, never duplicate tabs) */}
                                {distinctAuthorities.length > 1 && (
                                    <div className="px-4 pb-2 flex items-center gap-1.5 overflow-x-auto">
                                        {distinctAuthorities.map(authTitle => {
                                            const isSelected = selectedAuthority.toLowerCase() === authTitle.toLowerCase();
                                            const countForAuth = courseRemarks.filter(
                                                r => getNormalizedRoleTitle(r).toLowerCase() === authTitle.toLowerCase()
                                            ).length;
                                            return (
                                                <button
                                                    key={authTitle}
                                                    type="button"
                                                    onClick={() => setSelectedAuthority(authTitle)}
                                                    className={`px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap border transition-all flex items-center gap-1 ${
                                                        isSelected
                                                            ? 'bg-slate-900 text-white border-slate-900'
                                                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                                    }`}
                                                >
                                                    <Shield size={10} />
                                                    <span>{authTitle} ({countForAuth})</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Collapsible Parade Roll & Clickable Cadet Citations */}
                                {isRollExpanded && (
                                    <div className="px-4 pb-3 pt-1 border-t border-slate-200/70 space-y-2 bg-white">
                                        <div className="flex items-center justify-between gap-2 pt-1">
                                            <div className="flex items-center gap-1.5 text-xs font-black text-slate-900">
                                                <Calendar size={13} className="text-blue-600 shrink-0" />
                                                <span>
                                                    {activeTaggingParade?.label || `${formatParadeName(displayRecord?.paradeType)} • ${formatShortDate(displayRecord?.date)}`}
                                                </span>
                                            </div>
                                            <span className="text-[10px] font-semibold text-slate-400">
                                                {isLoadingCadets ? 'Loading parade state...' : `${cadets.length} cadets on file`}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-4 gap-1.5 text-center font-mono pt-0.5">
                                            <div className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200/60">
                                                <p className="text-[9px] font-bold uppercase text-emerald-700">Present</p>
                                                <p className="text-xs font-black text-emerald-950">{displayRecord?.presentCount ?? 0}</p>
                                            </div>
                                            <div className="p-1.5 rounded-lg bg-rose-50 border border-rose-200/60">
                                                <p className="text-[9px] font-bold uppercase text-rose-700">Absent</p>
                                                <p className="text-xs font-black text-rose-950">{displayRecord?.absentCount ?? 0}</p>
                                            </div>
                                            <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-200/60">
                                                <p className="text-[9px] font-bold uppercase text-amber-700">Sick</p>
                                                <p className="text-xs font-black text-amber-950">{displayRecord?.sickCount ?? 0}</p>
                                            </div>
                                            <div className="p-1.5 rounded-lg bg-indigo-50 border border-indigo-200/60">
                                                <p className="text-[9px] font-bold uppercase text-indigo-700">Detention</p>
                                                <p className="text-xs font-black text-indigo-950">{displayRecord?.detentionCount ?? 0}</p>
                                            </div>
                                        </div>

                                        {isLoadingCadets ? (
                                            <div className="py-2 flex items-center justify-center gap-2 text-xs text-slate-400">
                                                <Loader2 size={13} className="animate-spin text-blue-600" />
                                                <span>Loading parade state exceptions...</span>
                                            </div>
                                        ) : nonPresentCadets.length > 0 ? (
                                            <div>
                                                <p className="text-[10px] font-semibold text-slate-400 mb-1.5">
                                                    Non-present cadets {canComposeMessage ? '(tap to cite in message)' : ''}:
                                                </p>
                                                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                                    {nonPresentCadets.map((c, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => handleInsertCadetReference(c)}
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-50 hover:bg-blue-50 text-slate-800 border border-slate-200 transition-colors"
                                                        >
                                                            <span className="font-semibold">{c.name}</span>
                                                            <span className="text-slate-400 text-[10px]">{c.squad}</span>
                                                            <span
                                                                className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold uppercase ${getStatusBadgeStyles(
                                                                    c.status
                                                                )}`}
                                                            >
                                                                {getStatusFullLabel(c.status)}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-[11px] text-slate-400 text-center py-1">
                                                No non-present cadet exceptions recorded for this parade state.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ── 3. Scrollable Directional Chat Canvas ── */}
                            <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-3.5 py-4 sm:px-5 space-y-3 bg-[#f8fafc] relative">
                                {/* Floating Notification Indicator when Roll is updated at top */}
                                <AnimatePresence>
                                    {isRollFlashing && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -20, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -15, scale: 0.95 }}
                                            className="sticky top-1 z-30 flex justify-center pointer-events-none"
                                        >
                                            <div className="px-4 py-1.5 rounded-full bg-blue-900/95 text-white shadow-xl border border-blue-400/40 text-xs font-bold flex items-center gap-2 backdrop-blur-md animate-bounce">
                                                <span>↑ Parade state updated above for {activeTaggingParade?.label}</span>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {unifiedChatMessages.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                                        <div className="w-12 h-12 rounded-full bg-slate-200/70 text-slate-500 flex items-center justify-center">
                                            <MessageSquarePlus size={22} />
                                        </div>
                                        <p className="text-sm font-semibold text-slate-700">
                                            Start a Conversation with {officerDisplayName}
                                        </p>
                                        <p className="text-xs text-slate-400 max-w-xs">
                                            Select a quick prompt below or tap any non-present cadet above to cite them in your directive.
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Load Earlier Messages Button */}
                                        {hiddenMessageCount > 0 && (
                                            <div className="flex justify-center">
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedFullHistory(true)}
                                                    className="px-3.5 py-1 rounded-full bg-white border border-slate-200 text-[11px] font-semibold text-blue-700 shadow-2xs hover:bg-blue-50 transition-colors"
                                                >
                                                    Load {hiddenMessageCount} earlier{' '}
                                                    {hiddenMessageCount === 1 ? 'message' : 'messages'}
                                                </button>
                                            </div>
                                        )}

                                        {/* Directional Message Bubbles with Quoted Parade Context Cards */}
                                        {visibleMessages.map((msg, idx) => {
                                            const prevMsg = idx > 0 ? visibleMessages[idx - 1] : null;
                                            const isNewSession =
                                                !prevMsg ||
                                                prevMsg.paradeDate !== msg.paradeDate ||
                                                String(prevMsg.paradeType).toLowerCase() !== String(msg.paradeType).toLowerCase();

                                            const sessionTitle = `${formatParadeName(msg.paradeType)} • ${formatShortDate(msg.paradeDate)}`;

                                            const timeFormatted = new Date(msg.timestamp).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            });

                                            const isCurrentlyInspecting =
                                                Boolean(activeTaggingParade) &&
                                                (activeTaggingParade?.submissionId === msg.submissionId ||
                                                    (activeTaggingParade?.date === msg.paradeDate &&
                                                        String(activeTaggingParade?.paradeType).toLowerCase() === String(msg.paradeType).toLowerCase()));

                                            return (
                                                <React.Fragment key={msg.id}>
                                                    {/* Parade Session Divider Pill */}
                                                    {isNewSession && (
                                                        <div className="flex items-center justify-center my-3">
                                                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-200/80 border border-slate-300/60 text-slate-700 text-[11px] font-semibold shadow-2xs">
                                                                <span>{sessionTitle}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        handleSelectParadeContext(
                                                                            msg.submissionId,
                                                                            msg.paradeType,
                                                                            msg.paradeDate
                                                                        )
                                                                    }
                                                                    className={`font-bold transition-all ml-1 ${
                                                                        isCurrentlyInspecting
                                                                            ? 'px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px] shadow-xs'
                                                                            : 'text-blue-700 hover:text-blue-900 hover:underline'
                                                                    }`}
                                                                >
                                                                    {isCurrentlyInspecting ? '✓ Inspecting at top' : 'Inspect State ↑'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {msg.isOwnMessage ? (
                                                        <div className="flex flex-col items-end">
                                                            <div className="max-w-[85%] sm:max-w-[78%] bg-slate-900 text-white rounded-2xl rounded-br-xs px-4 py-2.5 shadow-2xs">
                                                                {/* Quoted Parade Context Strip */}
                                                                <div
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    onClick={() =>
                                                                        handleSelectParadeContext(
                                                                            msg.submissionId,
                                                                            msg.paradeType,
                                                                            msg.paradeDate
                                                                        )
                                                                    }
                                                                    className="mb-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium flex items-center justify-between gap-1 cursor-pointer bg-white/10 hover:bg-white/15 text-slate-200 border-l-2 border-amber-400 transition-colors"
                                                                    title="Click to inspect this parade state at top and tag in reply"
                                                                >
                                                                    <span className="truncate font-semibold uppercase">
                                                                        {msg.isMisconduct
                                                                            ? '🚨 Misconduct Directive'
                                                                            : `${formatParadeName(msg.paradeType)} • ${formatShortDate(msg.paradeDate)}`}
                                                                    </span>
                                                                    <span className="text-[9px] shrink-0 flex items-center gap-1">
                                                                        {isCurrentlyInspecting ? (
                                                                            <span className="font-bold text-amber-300 bg-white/10 px-1.5 py-0.5 rounded">
                                                                                ✓ Active State
                                                                            </span>
                                                                        ) : (
                                                                            <>
                                                                                <FileText size={10} />
                                                                                <span className="font-bold">State ↑</span>
                                                                            </>
                                                                        )}
                                                                    </span>
                                                                </div>

                                                                <p className="text-[13px] sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
                                                                    {msg.message}
                                                                </p>
                                                                <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400">
                                                                    <span>{timeFormatted}</span>
                                                                    <CheckCheck
                                                                        size={13}
                                                                        className={
                                                                            isResolved || hasOfficerResponse
                                                                                ? 'text-blue-400'
                                                                                : 'text-slate-400'
                                                                        }
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-start">
                                                            <div className="max-w-[85%] sm:max-w-[78%] bg-white text-slate-900 border border-slate-200/80 rounded-2xl rounded-bl-xs px-4 py-2.5 shadow-2xs">
                                                                {/* Quoted Parade Context Strip */}
                                                                <div
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    onClick={() =>
                                                                        handleSelectParadeContext(
                                                                            msg.submissionId,
                                                                            msg.paradeType,
                                                                            msg.paradeDate
                                                                        )
                                                                    }
                                                                    className="mb-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium flex items-center justify-between gap-1 cursor-pointer bg-slate-100 hover:bg-slate-200/80 text-slate-700 border-l-2 border-blue-600 transition-colors"
                                                                    title="Click to inspect this parade state at top and tag in reply"
                                                                >
                                                                    <span className="truncate font-semibold uppercase">
                                                                        {msg.isMisconduct
                                                                            ? '🚨 Misconduct Directive'
                                                                            : `${formatParadeName(msg.paradeType)} • ${formatShortDate(msg.paradeDate)}`}
                                                                    </span>
                                                                    <span className="text-[9px] shrink-0 flex items-center gap-1">
                                                                        {isCurrentlyInspecting ? (
                                                                            <span className="font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                                                                ✓ Active State
                                                                            </span>
                                                                        ) : (
                                                                            <>
                                                                                <FileText size={10} />
                                                                                <span className="font-bold">State ↑</span>
                                                                            </>
                                                                        )}
                                                                    </span>
                                                                </div>

                                                                <p
                                                                    className={`text-[11px] font-bold mb-0.5 ${
                                                                        msg.senderRole === 'commandant'
                                                                            ? 'text-amber-700'
                                                                            : 'text-blue-700'
                                                                    }`}
                                                                >
                                                                    {msg.senderTitle ? `${msg.senderTitle} • ` : ''}
                                                                    {msg.senderName}
                                                                </p>
                                                                <p className="text-[13px] sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
                                                                    {msg.message}
                                                                </p>
                                                                <div className="flex items-center justify-end mt-1 text-[10px] text-slate-400">
                                                                    <span>{timeFormatted}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}

                                        {/* Awaiting Reply Status Indicator */}
                                        {!hasOfficerResponse && !isResolved && (
                                            <div className="flex justify-center pt-1">
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 text-[11px] font-medium">
                                                    <Clock size={12} />
                                                    <span>Awaiting {officerDisplayName}'s reply</span>
                                                </span>
                                            </div>
                                        )}

                                        <div ref={chatEndRef} />
                                    </>
                                )}
                            </div>

                            {/* ── 4. Sticky Bottom Input Bar with Guardrail 1 Active Parade Tagging Pill ── */}
                            {canComposeMessage ? (
                                <form
                                    onSubmit={handleSendMessage}
                                    className="sticky bottom-0 bg-white border-t border-slate-200 p-2.5 sm:p-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] space-y-2 shrink-0"
                                >
                                    {/* Guardrail 1: Interactive Target Parade Context Pill & Switcher */}
                                    <div className="relative">
                                        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100/90 border border-slate-200/80 rounded-xl text-xs text-slate-700">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <Calendar size={12} className="text-blue-600 shrink-0" />
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tagging:</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsParadeSelectorOpen(prev => !prev)}
                                                    className="inline-flex items-center gap-1 font-semibold text-blue-900 hover:text-blue-700 truncate"
                                                >
                                                    <span>{activeTaggingParade?.label || `General RC ${courseNum} Directive`}</span>
                                                    <ChevronDown size={12} className={`transition-transform shrink-0 ${isParadeSelectorOpen ? 'rotate-180' : ''}`} />
                                                </button>
                                            </div>
                                            {activeTaggingParade && (
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveTaggingParade(null)}
                                                    className="p-1 text-slate-400 hover:text-slate-600 rounded-md shrink-0"
                                                    title="Clear specific parade tag (send as general directive)"
                                                >
                                                    <X size={12} />
                                                </button>
                                            )}
                                        </div>

                                        {/* Dropdown Popover for Switching Parade Context */}
                                        {isParadeSelectorOpen && (
                                            <div className="absolute bottom-full left-0 right-0 mb-1 z-30 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 space-y-1 max-h-48 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
                                                    Select Parade Context to Tag
                                                </p>
                                                {availableParadesForCourse.map(p => (
                                                    <button
                                                        key={`${p.date}::${p.paradeType}`}
                                                        type="button"
                                                        onClick={() => {
                                                            handleSelectParadeContext(p.submissionId, p.paradeType, p.date);
                                                            setIsParadeSelectorOpen(false);
                                                        }}
                                                        className={`w-full px-3 py-2 text-left rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                                                            activeTaggingParade?.date === p.date && activeTaggingParade?.paradeType === p.paradeType
                                                                ? 'bg-blue-900 text-white'
                                                                : 'hover:bg-slate-100 text-slate-700'
                                                        }`}
                                                    >
                                                        <span>{p.label}</span>
                                                        <FileText size={12} className="opacity-70" />
                                                    </button>
                                                ))}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setActiveTaggingParade(null);
                                                        setIsParadeSelectorOpen(false);
                                                    }}
                                                    className="w-full px-3 py-2 text-left rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-100"
                                                >
                                                    None (General RC {courseNum} Directive)
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Horizontally Scrollable Quick-Prompt Chips */}
                                    <div
                                        data-no-drawer-swipe="true"
                                        data-no-page-swipe="true"
                                        className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar touch-pan-x"
                                    >
                                        {quickPrompts.map((prompt, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => setInputText(prompt)}
                                                className="px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-[11px] font-medium whitespace-nowrap transition-colors shrink-0"
                                            >
                                                {prompt}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Rounded-Full Input + Circular Send Button */}
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={inputText}
                                            onChange={e => setInputText(e.target.value)}
                                            placeholder={
                                                canSendAsCourseOfficer
                                                    ? 'Write justification reply...'
                                                    : `Message ${rcLabel} Course Officer...`
                                            }
                                            className="flex-1 bg-slate-100 focus:bg-white border border-slate-200 focus:border-slate-900 rounded-full px-4 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all min-h-[42px]"
                                        />
                                        <button
                                            type="submit"
                                            disabled={isSending || !inputText.trim()}
                                            className="w-10 h-10 rounded-full bg-blue-900 hover:bg-blue-800 disabled:opacity-40 text-white flex items-center justify-center shrink-0 shadow-xs active:scale-95 transition-all"
                                            aria-label="Send message"
                                        >
                                            {isSending ? (
                                                <Loader2 size={16} className="animate-spin" />
                                            ) : (
                                                <Send size={16} />
                                            )}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-2 text-xs text-slate-500 shrink-0">
                                    <div className="flex items-center gap-1.5">
                                        <Eye size={14} className="text-slate-400" />
                                        <span>
                                            {isAdmin
                                                ? 'View-only audit mode'
                                                : isCourseOfficer && hasOfficerResponse
                                                ? 'Reply submitted • Awaiting Senior Officer review'
                                                : isResolved
                                                ? 'This inquiry has been resolved'
                                                : `Conversation managed by ${selectedAuthority}`}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </div>
                </div>
            )}
        </AnimatePresence>
    );
};
