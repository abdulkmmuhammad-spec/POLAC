import React, { useState, useMemo, useEffect } from 'react';
import {
    MessageSquarePlus,
    Shield,
    CheckCheck,
    Clock,
    AlertOctagon,
    Search,
    User,
    Send,
    Loader2,
    Eye,
    ExternalLink,
    CheckCircle2,
    SlidersHorizontal,
    X,
    Stethoscope,
    FileText
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useParade } from '../../../context/ParadeContext';
import { dbService, supabase } from '../../../services/dbService';
import {
    CommandantRemark,
    ParadeRecordMetadata,
    UserRole,
    SickbayVerification,
    CommandReport
} from '../../../types';
import { formatRC, calculateCurrentLevel } from '../../../utils/rcHelpers';
import { parseMisconductRemark } from '../../../utils/notificationUtils';
import { isDFS, isExecutiveCommand, isDeputyCommandant } from '../../../utils/commandHierarchy';
import {
    getLatestExecutiveActivity,
    getUnreadExecutiveCount,
    markExecutiveChatRead,
    getLatestExecutiveItemMs
} from '../../../utils/executiveChatState';
import { ParadeRemarkDrawer, ParadeRemarkTarget } from './ParadeRemarkDrawer';
import { SickbayChatDrawer } from '../Medical/SickbayChatDrawer';
import { WeeklyCommandReportSheet } from './WeeklyCommandReportSheet';
import { ExecutiveChatDrawer } from './ExecutiveChatDrawer';
import { toast } from 'react-hot-toast';

const NEW_DIRECTIVE_PROMPTS = [
    'Inquiry: Reason for low turnout / failure to fall out?',
    'Medical verification required for absentees.',
    "Commandant's Commendation for excellent turnout."
];

type StatusFilter = 'ALL' | 'ADDRESSED' | 'PENDING' | 'RESOLVED';
type HubFilter = 'ALL' | 'COMMAND' | 'COURSES' | 'MEDICAL';
type CategoryFilter = 'ALL' | 'MISCONDUCT';

const INITIAL_VISIBLE_THREADS = 20;

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

interface UnifiedOfficerConversation {
    key: string;
    courseNumber: number;
    courseOfficerName: string;
    courseOfficerId?: string | null;
    authorityTitle: string;
    remarks: CommandantRemark[];
    latestRemark: CommandantRemark;
    latestActivityAt: string;
    addressedCount: number; // Guardrail 2: strictly count of remarks where status !== 'resolved' && (status === 'addressed' || Boolean(officerResponse))
    pendingCount: number;
    resolvedCount: number;
    totalCount: number;
    hasMisconduct: boolean;
    latestPreviewText: string;
    latestParadeContext: string;
    isOwner: boolean;
}

export const RemarksCenter: React.FC = () => {
    const { currentUser } = useAuth();
    const {
        remarks,
        records,
        courseSummary,
        yesterdaySummary,
        activeRC,
        activeDate,
        selectedParadeType,
        refreshRemarks
    } = useParade();

    const isCommandant = currentUser?.role === UserRole.COMMANDANT;
    const isAdmin = currentUser?.role === UserRole.ADMIN;
    const isDFSOfficer = isDFS(currentUser);
    const isExecutiveCmd = isExecutiveCommand(currentUser);
    const isDeputyCmd = isDeputyCommandant(currentUser);
    const currentOfficerDesignation = (currentUser?.designation || 'Commandant').trim();

    // Orthogonal Filters
    const [hubFilter, setHubFilter] = useState<HubFilter>('ALL');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [selectedChannel, setSelectedChannel] = useState<string>('ALL');
    const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
    const [courseFilter, setCourseFilter] = useState<string>('ALL');
    const [paradeTypeFilter, setParadeTypeFilter] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [isFilterTrayOpen, setIsFilterTrayOpen] = useState<boolean>(false);

    // Pagination State
    const [visibleThreadLimit, setVisibleThreadLimit] = useState<number>(INITIAL_VISIBLE_THREADS);

    // Medical Officer Sickbay Alerts (Grouped 1 WhatsApp DM chat per Medical Officer)
    const [sickbayAlerts, setSickbayAlerts] = useState<SickbayVerification[]>([]);
    const [activeMedicalChannelKey, setActiveMedicalChannelKey] = useState<string | null>(null);

    // Weekly Command Reports & Executive Briefs (DFS <-> Commandant / Deputy Commandant)
    const [commandReports, setCommandReports] = useState<CommandReport[]>([]);
    const [isWeeklyReportSheetOpen, setIsWeeklyReportSheetOpen] = useState(false);
    const [weeklyReportDefaultRecipient, setWeeklyReportDefaultRecipient] = useState<
        'commandant' | 'deputy_commandant' | 'both'
    >('both');
    const [activeExecutivePartner, setActiveExecutivePartner] = useState<{
        role: 'commandant' | 'deputy_commandant' | 'dfs';
        title: string;
        monogram: string;
    } | null>(null);

    useEffect(() => {
        const loadMedicalAlerts = async () => {
            try {
                const all = await dbService.fetchSickbayVerifications();
                const targeted = all.filter(v => {
                    if (v.status !== 'not_admitted' && !v.clinicalNote) return false;
                    // Show if targeted to commandant, dfs, or unspecified (leadership visibility)
                    return !v.targetedRecipientRole || v.targetedRecipientRole === 'commandant' || v.targetedRecipientRole === 'dfs';
                });
                setSickbayAlerts(targeted);
            } catch {
                // silent
            }
        };
        loadMedicalAlerts();
        window.addEventListener('sickbay-verifications-updated', loadMedicalAlerts);
        return () => window.removeEventListener('sickbay-verifications-updated', loadMedicalAlerts);
    }, []);

    useEffect(() => {
        const loadCommandReports = async () => {
            try {
                const reports = await dbService.fetchCommandReports();
                setCommandReports(reports);
            } catch {
                // silent
            }
        };
        loadCommandReports();
        window.addEventListener('command-reports-updated', loadCommandReports);

        const channel = supabase
            .channel('remarks-center-command-reports')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'command_reports' },
                loadCommandReports
            )
            .subscribe();

        return () => {
            window.removeEventListener('command-reports-updated', loadCommandReports);
            supabase.removeChannel(channel);
        };
    }, []);

    // Dedicated Chat Screen Target
    const [drawerTarget, setDrawerTarget] = useState<ParadeRemarkTarget | ParadeRecordMetadata | null>(null);
    const [activeRemarkId, setActiveRemarkId] = useState<string | null>(null);
    const [selectedDrawerCourse, setSelectedDrawerCourse] = useState<number | null>(null);
    const [selectedDrawerAuthority, setSelectedDrawerAuthority] = useState<string | null>(null);

    // New Directive Modal / Bottom Sheet State
    const [isNewDirectiveOpen, setIsNewDirectiveOpen] = useState(false);
    const [newDirectiveCourse, setNewDirectiveCourse] = useState<number>(activeRC || 12);
    const [newDirectiveText, setNewDirectiveText] = useState('');
    const [isSubmittingNewDirective, setIsSubmittingNewDirective] = useState(false);

    const getNormalizedRoleTitle = (remark: CommandantRemark): string => {
        const raw = (remark.issuerRoleTitle || '').trim();
        const nameUpper = (remark.commandantName || '').trim().toUpperCase();
        // If legacy Commandant remarks had commandantName = 'DIRECTOR FIELD STUDIES', keep them as 'Commandant'
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

    // Deduplicates any inflated thread history in memory & caps to unique chronological exchanges
    const getCleanThread = (remark: CommandantRemark): NonNullable<CommandantRemark['thread']> => {
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
        if (cleanHistory.length > 0) {
            for (const item of cleanHistory) {
                const parsedItem = parseMisconductRemark(item.message);
                if (parsedItem.isMisconduct) {
                    return {
                        ...parsedItem,
                        cleanText: direct.cleanText
                    };
                }
            }
        }
        return direct;
    };

    // Distinct authority channels (Commandant + any other registered Senior Officer who has issued remarks)
    const authorityChannels = useMemo(() => {
        const base = ['Commandant'];
        if (
            isCommandant &&
            currentOfficerDesignation &&
            !base.some(c => c.toLowerCase() === currentOfficerDesignation.toLowerCase())
        ) {
            base.push(currentOfficerDesignation);
        }
        remarks.forEach(r => {
            const title = getNormalizedRoleTitle(r);
            if (!base.some(c => c.toLowerCase() === title.toLowerCase())) {
                base.push(title);
            }
        });
        return base;
    }, [remarks, isCommandant, currentOfficerDesignation]);

    // Available Regular Courses
    const availableCourses = useMemo(() => {
        const set = new Set<number>();
        for (let rc = Math.max(1, activeRC - 4); rc <= activeRC; rc++) {
            set.add(rc);
        }
        courseSummary.forEach(c => {
            if (c.courseNumber > 0) set.add(Number(c.courseNumber));
        });
        remarks.forEach(r => {
            if (r.courseNumber && Number(r.courseNumber) > 0) {
                set.add(Number(r.courseNumber));
            }
        });
        return Array.from(set).sort((a, b) => b - a);
    }, [remarks, courseSummary, activeRC]);

    // Group all remarks into Unified Contact Conversations (WhatsApp / Instagram DM Architecture)
    const conversations = useMemo<UnifiedOfficerConversation[]>(() => {
        const map = new Map<string, UnifiedOfficerConversation>();

        for (const r of remarks) {
            const cNum = Number(r.courseNumber) || 0;
            const authTitle = getNormalizedRoleTitle(r);
            const groupKey = `${cNum}::${authTitle.toLowerCase()}`;

            const isRes = r.status === 'resolved';
            const hasResp = Boolean(r.officerResponse && r.officerResponse.trim());
            // Guardrail 2: strictly count actionable replies waiting on Senior Officer review
            const isAddressed = !isRes && (r.status === 'addressed' || hasResp);
            const isPending = !isRes && !hasResp && r.status === 'pending';
            const isMsc = getRemarkMisconductMeta(r).isMisconduct;
            const owner = isRemarkOwner(r);

            // Compute the most recent timestamp for this remark
            const rActivity = r.respondedAt || r.updatedAt || r.createdAt;

            let conv = map.get(groupKey);
            if (!conv) {
                const officerName = r.courseOfficerName || (cNum ? `${formatRC(cNum)} Course Officer` : 'Course Officer');
                conv = {
                    key: groupKey,
                    courseNumber: cNum,
                    courseOfficerName: officerName,
                    courseOfficerId: r.courseOfficerId,
                    authorityTitle: authTitle,
                    remarks: [r],
                    latestRemark: r,
                    latestActivityAt: rActivity,
                    addressedCount: isAddressed ? 1 : 0,
                    pendingCount: isPending ? 1 : 0,
                    resolvedCount: isRes ? 1 : 0,
                    totalCount: 1,
                    hasMisconduct: isMsc,
                    latestPreviewText: '',
                    latestParadeContext: '',
                    isOwner: owner
                };
                map.set(groupKey, conv);
            } else {
                conv.remarks.push(r);
                conv.totalCount++;
                if (isAddressed) conv.addressedCount++;
                if (isPending) conv.pendingCount++;
                if (isRes) conv.resolvedCount++;
                if (isMsc) conv.hasMisconduct = true;
                if (owner) conv.isOwner = true;
                if (r.courseOfficerName) conv.courseOfficerName = r.courseOfficerName;
                if (r.courseOfficerId) conv.courseOfficerId = r.courseOfficerId;

                if (new Date(rActivity).getTime() > new Date(conv.latestActivityAt).getTime()) {
                    conv.latestActivityAt = rActivity;
                    conv.latestRemark = r;
                }
            }
        }

        // For each unified conversation, construct the single-line latest preview & parade context
        for (const conv of map.values()) {
            const latestR = conv.latestRemark;
            const hasOfficerReply = Boolean(latestR.officerResponse && latestR.officerResponse.trim());
            const ownsLatest = isRemarkOwner(latestR);
            const parsedMeta = parseMisconductRemark(latestR.remarkText);

            conv.latestPreviewText = hasOfficerReply
                ? String(latestR.officerResponse).trim()
                : `${ownsLatest ? 'You: ' : `${conv.authorityTitle}: `}${parsedMeta.cleanText}`;

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
    }, [remarks, currentUser]);

    // Status & Category Counts (Computed across unified conversations)
    const metrics = useMemo(() => {
        let addressed = 0;
        let pending = 0;
        let resolved = 0;
        let misconduct = 0;
        let myDirectives = 0;

        for (const c of conversations) {
            if (c.addressedCount > 0) {
                addressed++;
            } else if (c.pendingCount > 0) {
                pending++;
            } else if (c.resolvedCount > 0) {
                resolved++;
            }
            if (c.hasMisconduct) misconduct++;
            if (c.isOwner) myDirectives++;
        }

        return {
            total: conversations.length,
            addressed,
            pending,
            resolved,
            misconduct,
            myDirectives
        };
    }, [conversations]);

    // Filtered & Priority-Sorted Unified Conversations (WhatsApp/Instagram model)
    const filteredConversations = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();

        return conversations
            .filter(c => {
                if (selectedChannel === 'MY_DIRECTIVES') {
                    if (!c.isOwner) return false;
                } else if (selectedChannel !== 'ALL') {
                    if (c.authorityTitle.toLowerCase() !== selectedChannel.toLowerCase()) return false;
                }

                if (categoryFilter === 'MISCONDUCT' && !c.hasMisconduct) {
                    return false;
                }

                if (statusFilter === 'ADDRESSED') {
                    if (c.addressedCount === 0) return false;
                } else if (statusFilter === 'PENDING') {
                    if (c.pendingCount === 0 || c.addressedCount > 0) return false;
                } else if (statusFilter === 'RESOLVED') {
                    if (c.addressedCount > 0 || c.pendingCount > 0) return false;
                }

                if (courseFilter !== 'ALL') {
                    if (Number(c.courseNumber) !== Number(courseFilter)) return false;
                }

                if (paradeTypeFilter !== 'ALL') {
                    const matchesParade = c.remarks.some(
                        r => String(r.paradeType || '').toUpperCase() === paradeTypeFilter.toUpperCase()
                    );
                    if (!matchesParade) return false;
                }

                if (q) {
                    const allRemarkText = c.remarks
                        .map(r => {
                            const cleanH = getCleanThread(r)
                                .map(t => `${t.senderName} ${t.message}`)
                                .join(' ');
                            const meta = getRemarkMisconductMeta(r);
                            return `${r.remarkText} ${r.officerResponse || ''} ${meta.cadetName || ''} ${meta.squad || ''} ${cleanH}`;
                        })
                        .join(' ');

                    const haystack = [
                        c.courseOfficerName,
                        c.courseNumber ? `rc ${c.courseNumber} rc${c.courseNumber}` : '',
                        c.authorityTitle,
                        allRemarkText
                    ]
                        .join(' ')
                        .toLowerCase();

                    if (!haystack.includes(q)) return false;
                }

                return true;
            })
            .sort((a, b) => {
                // Tier 1: Active conversations (addressed or pending) float above fully resolved
                const aActive = (a.addressedCount > 0 || a.pendingCount > 0) ? 0 : 1;
                const bActive = (b.addressedCount > 0 || b.pendingCount > 0) ? 0 : 1;
                if (aActive !== bActive) return aActive - bActive;

                // Tier 2: Addressed (Replied) conversations float to top
                const aAddressed = a.addressedCount > 0 ? 0 : 1;
                const bAddressed = b.addressedCount > 0 ? 0 : 1;
                if (aAddressed !== bAddressed) return aAddressed - bAddressed;

                // Tier 3: Chronological recency (latestActivityAt DESC) — new activity bumps to top
                return new Date(b.latestActivityAt).getTime() - new Date(a.latestActivityAt).getTime();
            });
    }, [
        conversations,
        selectedChannel,
        categoryFilter,
        statusFilter,
        courseFilter,
        paradeTypeFilter,
        searchQuery
    ]);

    const visibleConversations = useMemo(
        () => filteredConversations.slice(0, visibleThreadLimit),
        [filteredConversations, visibleThreadLimit]
    );

    const activeSecondaryFilterCount = useMemo(() => {
        let count = 0;
        if (selectedChannel !== 'ALL') count++;
        if (categoryFilter !== 'ALL') count++;
        if (courseFilter !== 'ALL') count++;
        if (paradeTypeFilter !== 'ALL') count++;
        return count;
    }, [selectedChannel, categoryFilter, courseFilter, paradeTypeFilter]);

    const hasActiveFilters =
        activeSecondaryFilterCount > 0 || statusFilter !== 'ALL' || searchQuery.trim().length > 0;

    const resetFilters = () => {
        setSelectedChannel('ALL');
        setCategoryFilter('ALL');
        setStatusFilter('ALL');
        setCourseFilter('ALL');
        setParadeTypeFilter('ALL');
        setSearchQuery('');
        setVisibleThreadLimit(INITIAL_VISIBLE_THREADS);
    };

    const handleOpenConversation = async (conv: UnifiedOfficerConversation) => {
        setActiveRemarkId(conv.latestRemark.id);
        setSelectedDrawerCourse(conv.courseNumber);
        setSelectedDrawerAuthority(conv.authorityTitle);

        const cNum = conv.courseNumber;
        const matchedRecord = records.find(
            rec =>
                (cNum > 0 && Number(rec.courseNumber) === Number(cNum)) ||
                String(rec.id) === String(conv.latestRemark.submissionId)
        );

        if (matchedRecord) {
            setDrawerTarget(matchedRecord);
            return;
        }

        const summaryMatch =
            courseSummary.find(c => Number(c.courseNumber) === Number(cNum))?.latestSubmission ||
            yesterdaySummary.find(c => Number(c.courseNumber) === Number(cNum))?.latestSubmission;

        if (summaryMatch) {
            setDrawerTarget(summaryMatch);
            return;
        }

        const fallbackSummary =
            courseSummary.find(c => Number(c.courseNumber) === Number(cNum)) ||
            yesterdaySummary.find(c => Number(c.courseNumber) === Number(cNum));

        // Open chat screen immediately using local fallback metadata so tap response is instant
        setDrawerTarget({
            id: conv.latestRemark.submissionId,
            officerId: conv.courseOfficerId || undefined,
            officerName: conv.courseOfficerName,
            courseName: cNum ? formatRC(cNum) : 'Course',
            courseNumber: cNum || undefined,
            yearGroup: cNum ? calculateCurrentLevel(cNum, activeRC) : 1,
            date: conv.latestRemark.paradeDate || new Date(conv.latestRemark.createdAt).toISOString().split('T')[0],
            paradeType: String(conv.latestRemark.paradeType || 'MUSTER').toUpperCase(),
            presentCount: fallbackSummary?.present ?? 0,
            absentCount: fallbackSummary?.absent ?? 0,
            sickCount: fallbackSummary?.sick ?? 0,
            detentionCount: fallbackSummary?.detention ?? 0,
            passCount: fallbackSummary?.pass ?? 0,
            suspensionCount: fallbackSummary?.suspension ?? 0,
            yetToReportCount: fallbackSummary?.yet_to_report ?? 0,
            grandTotal: fallbackSummary?.total ?? 0
        });

        // Enrich parade roll counts in background if submission exists in DB
        try {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                String(conv.latestRemark.submissionId)
            );

            let dbRow: any = null;
            if (isUuid) {
                const { data } = await supabase
                    .from('parade_records')
                    .select('*')
                    .eq('id', String(conv.latestRemark.submissionId))
                    .maybeSingle();
                dbRow = data;
            }

            if (!dbRow && cNum > 0) {
                let fallbackQuery = supabase
                    .from('parade_records')
                    .select('*')
                    .eq('course_number', cNum)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (conv.latestRemark.paradeDate) {
                    fallbackQuery = fallbackQuery.eq('date', conv.latestRemark.paradeDate);
                }
                const { data: rows } = await fallbackQuery;
                if (rows && rows.length > 0) {
                    dbRow = rows[0];
                }
            }

            if (dbRow) {
                setDrawerTarget({
                    id: dbRow.id,
                    officerId: dbRow.officer_id,
                    officerName: dbRow.officer_name || conv.courseOfficerName,
                    courseName: dbRow.course_name || (cNum ? formatRC(cNum) : 'Course'),
                    courseNumber: dbRow.course_number || cNum || undefined,
                    yearGroup: dbRow.year_group || (cNum ? calculateCurrentLevel(cNum, activeRC) : 1),
                    date: dbRow.date || conv.latestRemark.paradeDate || activeDate,
                    paradeType: dbRow.parade_type || conv.latestRemark.paradeType || 'MUSTER',
                    presentCount: dbRow.present_count ?? 0,
                    absentCount: dbRow.absent_count ?? 0,
                    sickCount: dbRow.sick_count ?? 0,
                    detentionCount: dbRow.detention_count ?? 0,
                    passCount: dbRow.pass_count ?? 0,
                    suspensionCount: dbRow.suspension_count ?? 0,
                    yetToReportCount: dbRow.yet_to_report_count ?? 0,
                    grandTotal: dbRow.grand_total ?? 0
                });
            }
        } catch (err) {
            console.warn('Fallback parade record lookup warning:', err);
        }
    };

    const handleDispatchNewDirective = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newDirectiveText.trim()) {
            toast.error('Please enter a directive message.');
            return;
        }

        setIsSubmittingNewDirective(true);
        try {
            const latestForCourse =
                courseSummary.find(c => Number(c.courseNumber) === Number(newDirectiveCourse))?.latestSubmission ||
                yesterdaySummary.find(c => Number(c.courseNumber) === Number(newDirectiveCourse))?.latestSubmission ||
                records.find(r => Number(r.courseNumber) === Number(newDirectiveCourse));

            const submissionId =
                latestForCourse?.id || `rc-${newDirectiveCourse}-${activeDate || new Date().toISOString().split('T')[0]}`;
            const officerName =
                latestForCourse?.officerName || `${formatRC(newDirectiveCourse)} Course Officer`;
            const paradeType = String(latestForCourse?.paradeType || selectedParadeType || 'muster');
            const paradeDate = latestForCourse?.date || activeDate || new Date().toISOString().split('T')[0];

            await dbService.createCommandantRemark({
                submissionId,
                commandantId: currentUser?.id || null,
                commandantName: currentUser?.fullName || currentOfficerDesignation.toUpperCase(),
                issuerRoleTitle: currentOfficerDesignation,
                courseOfficerId: latestForCourse?.officerId || null,
                courseOfficerName: officerName,
                courseNumber: newDirectiveCourse,
                paradeType,
                paradeDate,
                remarkText: newDirectiveText.trim()
            });

            setNewDirectiveText('');
            setIsNewDirectiveOpen(false);
            await refreshRemarks();
            toast.success(`Directive dispatched to ${formatRC(newDirectiveCourse)} (${officerName}).`);
        } catch (err: any) {
            console.error('Failed to issue directive:', err);
            toast.error(err?.message || 'Failed to dispatch directive.');
        } finally {
            setIsSubmittingNewDirective(false);
        }
    };

    const handleOpenDrawerForNewDirectiveCourse = () => {
        const cEntry =
            courseSummary.find(c => Number(c.courseNumber) === Number(newDirectiveCourse)) ||
            yesterdaySummary.find(c => Number(c.courseNumber) === Number(newDirectiveCourse));
        const recordMatch = records.find(r => Number(r.courseNumber) === Number(newDirectiveCourse));

        setIsNewDirectiveOpen(false);
        setActiveRemarkId(null);

        if (cEntry?.latestSubmission) {
            setDrawerTarget(cEntry.latestSubmission);
            return;
        }
        if (recordMatch) {
            setDrawerTarget(recordMatch);
            return;
        }

        setDrawerTarget({
            id: `rc-${newDirectiveCourse}-${activeDate || new Date().toISOString().split('T')[0]}`,
            officerName: `${formatRC(newDirectiveCourse)} Course Officer`,
            courseNumber: newDirectiveCourse,
            yearGroup: calculateCurrentLevel(newDirectiveCourse, activeRC),
            date: activeDate || new Date().toISOString().split('T')[0],
            paradeType: String(selectedParadeType || 'MUSTER'),
            presentCount: cEntry?.present ?? 0,
            absentCount: cEntry?.absent ?? 0,
            sickCount: cEntry?.sick ?? 0,
            detentionCount: cEntry?.detention ?? 0,
            passCount: cEntry?.pass ?? 0,
            suspensionCount: cEntry?.suspension ?? 0,
            yetToReportCount: cEntry?.yet_to_report ?? 0,
            grandTotal: cEntry?.total ?? 0
        });
    };

    // Executive Command (Commandant & Deputy Commandant):
    // Clean 1:1 Executive Briefs inbox strictly with Director Field Studies (DFS).
    if (isExecutiveCmd) {
        const myRecipientFilter = isDeputyCmd ? 'deputy_commandant' : 'commandant';
        const myBriefs = commandReports.filter(
            r => r.recipientRole === 'both' || r.recipientRole === myRecipientFilter
        );
        const latestActivity = getLatestExecutiveActivity(myBriefs, currentUser);
        const unreadCount = getUnreadExecutiveCount(myBriefs, currentUser, 'dfs');

        const openDfsChat = () => {
            markExecutiveChatRead(currentUser?.id, 'dfs', getLatestExecutiveItemMs(myBriefs));
            setActiveExecutivePartner({
                role: 'dfs',
                title: 'Director Field Studies',
                monogram: 'DFS'
            });
        };

        return (
            <div className="space-y-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:pb-8 animate-in fade-in duration-200">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                            Executive Briefs
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Direct channel with Director Field Studies
                        </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-900 border border-blue-200 text-xs font-semibold shrink-0">
                        <Shield size={13} />
                        <span>Chain of Command</span>
                    </span>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden divide-y divide-slate-100">
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={openDfsChat}
                        onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openDfsChat();
                            }
                        }}
                        className="px-4 py-4 flex items-center gap-3.5 hover:bg-slate-50/80 active:bg-slate-50 cursor-pointer transition-colors min-h-[72px]"
                    >
                        <div
                            className={`w-[46px] h-[46px] rounded-full flex items-center justify-center shrink-0 font-mono text-xs font-bold tracking-tight ${
                                unreadCount > 0
                                    ? 'bg-blue-50 text-blue-900 ring-2 ring-blue-600 ring-offset-2'
                                    : 'bg-slate-100 text-slate-700'
                            }`}
                        >
                            DFS
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold text-slate-900 truncate">
                                    Director Field Studies
                                </span>
                                <span
                                    className={`text-[11px] shrink-0 ${
                                        unreadCount > 0
                                            ? 'font-bold text-blue-600'
                                            : 'font-medium text-slate-400'
                                    }`}
                                >
                                    {latestActivity.latestTimestamp
                                        ? formatRelativeTimestamp(latestActivity.latestTimestamp)
                                        : 'Standing'}
                                </span>
                            </div>
                            <p
                                className={`text-xs truncate mt-0.5 ${
                                    unreadCount > 0
                                        ? 'font-semibold text-slate-900'
                                        : 'text-slate-500'
                                }`}
                            >
                                {latestActivity.previewText ||
                                    'No weekly command reports received yet.'}
                            </p>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                            {unreadCount > 0 ? (
                                <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold inline-flex items-center justify-center shadow-xs">
                                    {unreadCount}
                                </span>
                            ) : myBriefs.length > 0 ? (
                                <CheckCheck size={16} className="text-emerald-600" />
                            ) : null}
                        </div>
                    </div>
                </div>

                <ExecutiveChatDrawer
                    isOpen={Boolean(activeExecutivePartner)}
                    partnerTitle={activeExecutivePartner?.title || 'Director Field Studies'}
                    partnerMonogram={activeExecutivePartner?.monogram || 'DFS'}
                    reports={myBriefs}
                    onClose={() => setActiveExecutivePartner(null)}
                    onUpdated={updated => {
                        setCommandReports(prev =>
                            prev.map(r => (r.id === updated.id ? updated : r))
                        );
                    }}
                />
            </div>
        );
    }

    return (
        <div className="space-y-3 pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:pb-8 animate-in fade-in duration-200">
            {/* ── 1. Streamlined WhatsApp / Instagram DM Top Toolbar ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-3 sm:p-4 space-y-3">
                {isDFSOfficer && (
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="text-base font-bold text-slate-900 tracking-tight truncate">
                                    Command Hub
                                </h2>
                                <p className="text-[11px] text-slate-500 truncate">
                                    Executive briefs, courses & sickbay
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setWeeklyReportDefaultRecipient('both');
                                    setIsWeeklyReportSheetOpen(true);
                                }}
                                className="min-h-[44px] px-4 py-2 rounded-full bg-blue-900 hover:bg-blue-800 active:scale-[0.98] text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 shadow-2xs transition-all"
                            >
                                <FileText size={14} />
                                <span className="whitespace-nowrap">Weekly Report</span>
                            </button>
                        </div>

                        <div
                            data-no-page-swipe="true"
                            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x py-0.5"
                        >
                            {(
                                [
                                    { key: 'ALL', label: 'All' },
                                    { key: 'COMMAND', label: 'Command' },
                                    { key: 'COURSES', label: 'Courses' },
                                    { key: 'MEDICAL', label: 'Medical' }
                                ] as Array<{ key: HubFilter; label: string }>
                            ).map(pill => (
                                <button
                                    key={pill.key}
                                    type="button"
                                    onClick={() => setHubFilter(pill.key)}
                                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                                        hubFilter === pill.key
                                            ? 'bg-blue-900 text-white shadow-2xs'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                                    }`}
                                >
                                    {pill.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {/* Search Input with Embedded Right-Edge Filters Toggle */}
                <div className="relative flex items-center">
                    <Search
                        size={16}
                        className="absolute left-3.5 text-slate-400 pointer-events-none"
                    />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search course, officer, cadet, or directive..."
                        className="w-full pl-10 pr-28 py-2.5 bg-slate-100/80 focus:bg-white border border-transparent focus:border-slate-300 rounded-full text-base sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all"
                    />

                    <div className="absolute right-1.5 flex items-center gap-1">
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full"
                                aria-label="Clear search"
                            >
                                <X size={14} />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setIsFilterTrayOpen(prev => !prev)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${
                                isFilterTrayOpen || activeSecondaryFilterCount > 0
                                    ? 'bg-slate-900 text-white shadow-2xs'
                                    : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200/80'
                            }`}
                        >
                            <SlidersHorizontal size={13} />
                            <span>
                                {activeSecondaryFilterCount > 0
                                    ? `Filters (${activeSecondaryFilterCount})`
                                    : 'Filters'}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Sleek Rounded-Full Status Filter Pill Chips */}
                <div
                    data-no-page-swipe="true"
                    className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar touch-pan-x"
                >
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setStatusFilter('ALL')}
                            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap inline-flex items-center gap-1.5 ${
                                statusFilter === 'ALL'
                                    ? 'bg-slate-900 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                            }`}
                        >
                            <span>All</span>
                            <span
                                className={`text-[11px] ${
                                    statusFilter === 'ALL' ? 'text-slate-300' : 'text-slate-400'
                                }`}
                            >
                                {metrics.total}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setStatusFilter(statusFilter === 'ADDRESSED' ? 'ALL' : 'ADDRESSED')}
                            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap inline-flex items-center gap-1.5 ${
                                statusFilter === 'ADDRESSED'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                            }`}
                        >
                            {metrics.addressed > 0 && statusFilter !== 'ADDRESSED' && (
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                            )}
                            <span>Replied</span>
                            <span
                                className={`text-[11px] ${
                                    statusFilter === 'ADDRESSED' ? 'text-blue-100' : 'text-slate-400'
                                }`}
                            >
                                {metrics.addressed}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setStatusFilter(statusFilter === 'PENDING' ? 'ALL' : 'PENDING')}
                            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap inline-flex items-center gap-1.5 ${
                                statusFilter === 'PENDING'
                                    ? 'bg-amber-500 text-slate-950'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                            }`}
                        >
                            <span>Pending</span>
                            <span
                                className={`text-[11px] ${
                                    statusFilter === 'PENDING' ? 'text-slate-900/75' : 'text-slate-400'
                                }`}
                            >
                                {metrics.pending}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setStatusFilter(statusFilter === 'RESOLVED' ? 'ALL' : 'RESOLVED')}
                            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap inline-flex items-center gap-1.5 ${
                                statusFilter === 'RESOLVED'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                            }`}
                        >
                            <span>Resolved</span>
                            <span
                                className={`text-[11px] ${
                                    statusFilter === 'RESOLVED' ? 'text-emerald-100' : 'text-slate-400'
                                }`}
                            >
                                {metrics.resolved}
                            </span>
                        </button>
                    </div>

                    {isAdmin && (
                        <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px] font-medium shrink-0">
                            <Eye size={12} />
                            <span>View-only audit mode</span>
                        </span>
                    )}
                </div>

                {/* Active Secondary Filter Chips when Tray is Closed */}
                {activeSecondaryFilterCount > 0 && !isFilterTrayOpen && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100">
                        {selectedChannel !== 'ALL' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-medium">
                                <span>
                                    {selectedChannel === 'MY_DIRECTIVES' ? 'My Directives' : selectedChannel}
                                </span>
                                <button type="button" onClick={() => setSelectedChannel('ALL')}>
                                    <X size={12} />
                                </button>
                            </span>
                        )}
                        {categoryFilter === 'MISCONDUCT' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-[11px] font-medium">
                                <span>Misconduct Only</span>
                                <button type="button" onClick={() => setCategoryFilter('ALL')}>
                                    <X size={12} />
                                </button>
                            </span>
                        )}
                        {courseFilter !== 'ALL' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-medium">
                                <span>{formatRC(Number(courseFilter))}</span>
                                <button type="button" onClick={() => setCourseFilter('ALL')}>
                                    <X size={12} />
                                </button>
                            </span>
                        )}
                        {paradeTypeFilter !== 'ALL' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-medium">
                                <span>{paradeTypeFilter}</span>
                                <button type="button" onClick={() => setParadeTypeFilter('ALL')}>
                                    <X size={12} />
                                </button>
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="text-xs font-semibold text-rose-600 hover:underline ml-1"
                        >
                            Clear all
                        </button>
                    </div>
                )}

                {/* Collapsible Secondary Filter Tray */}
                {isFilterTrayOpen && (
                    <div className="pt-3 border-t border-slate-100 space-y-3 animate-in fade-in duration-150">
                        <div className="space-y-1.5">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Authority Channel
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => setSelectedChannel('ALL')}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                                        selectedChannel === 'ALL'
                                            ? 'bg-slate-900 text-white border-slate-900'
                                            : 'bg-white text-slate-600 border-slate-200'
                                    }`}
                                >
                                    All Authorities ({remarks.length})
                                </button>

                                {isCommandant && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedChannel('MY_DIRECTIVES')}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all inline-flex items-center gap-1 ${
                                            selectedChannel === 'MY_DIRECTIVES'
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-white text-slate-700 border-slate-200'
                                        }`}
                                    >
                                        <User size={12} />
                                        <span>My Directives ({metrics.myDirectives})</span>
                                    </button>
                                )}

                                {authorityChannels.map(channel => {
                                    const count = remarks.filter(
                                        r => getNormalizedRoleTitle(r).toLowerCase() === channel.toLowerCase()
                                    ).length;
                                    const isActive = selectedChannel.toLowerCase() === channel.toLowerCase();
                                    return (
                                        <button
                                            key={channel}
                                            type="button"
                                            onClick={() => setSelectedChannel(channel)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all inline-flex items-center gap-1 ${
                                                isActive
                                                    ? 'bg-slate-900 text-white border-slate-900'
                                                    : 'bg-white text-slate-600 border-slate-200'
                                            }`}
                                        >
                                            <Shield size={11} />
                                            <span>
                                                {channel} ({count})
                                            </span>
                                        </button>
                                    );
                                })}

                                <button
                                    type="button"
                                    onClick={() =>
                                        setCategoryFilter(categoryFilter === 'MISCONDUCT' ? 'ALL' : 'MISCONDUCT')
                                    }
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all inline-flex items-center gap-1 ${
                                        categoryFilter === 'MISCONDUCT'
                                            ? 'bg-rose-600 text-white border-rose-600'
                                            : 'bg-white text-rose-700 border-rose-200'
                                    }`}
                                >
                                    <AlertOctagon size={11} />
                                    <span>Misconduct ({metrics.misconduct})</span>
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                    Regular Course
                                </label>
                                <select
                                    value={courseFilter}
                                    onChange={e => setCourseFilter(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-slate-400"
                                >
                                    <option value="ALL">All Regular Courses</option>
                                    {availableCourses.map(cNum => (
                                        <option key={cNum} value={String(cNum)}>
                                            {formatRC(cNum)} (Year {calculateCurrentLevel(cNum, activeRC)})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                    Parade Formation
                                </label>
                                <select
                                    value={paradeTypeFilter}
                                    onChange={e => setParadeTypeFilter(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-slate-400"
                                >
                                    <option value="ALL">All Parade Types</option>
                                    <option value="MUSTER">Muster Parade</option>
                                    <option value="SPECIAL">Special Parade</option>
                                    <option value="TATTOO">Tattoo Parade</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── 2. Clean WhatsApp / Instagram DM Conversation List ── */}
            {filteredConversations.length === 0 &&
            sickbayAlerts.length === 0 &&
            !(isDFSOfficer && (hubFilter === 'ALL' || hubFilter === 'COMMAND')) ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2.5">
                    <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                        <CheckCircle2 size={22} />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800">No conversations found</h3>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto">
                        {conversations.length === 0
                            ? 'No directives have been issued yet. Use the compose button to message a Course Officer.'
                            : 'No conversations match your current search or filter selection.'}
                    </p>
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold"
                        >
                            Reset filters
                        </button>
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                    <div className="divide-y divide-slate-100 bg-white">
                        {/* Pinned Executive Command Channels for DFS */}
                        {isDFSOfficer &&
                            (hubFilter === 'ALL' || hubFilter === 'COMMAND') &&
                            (
                                [
                                    {
                                        role: 'commandant' as const,
                                        title: 'Commandant',
                                        monogram: 'CMD'
                                    },
                                    {
                                        role: 'deputy_commandant' as const,
                                        title: 'Deputy Commandant',
                                        monogram: 'DCMD'
                                    }
                                ] as const
                            )
                                .filter(
                                    exec =>
                                        !searchQuery.trim() ||
                                        exec.title
                                            .toLowerCase()
                                            .includes(searchQuery.trim().toLowerCase())
                                )
                                .map(exec => {
                                    const execReports = commandReports.filter(
                                        r =>
                                            r.recipientRole === 'both' ||
                                            r.recipientRole === exec.role
                                    );
                                    const execActivity = getLatestExecutiveActivity(
                                        execReports,
                                        currentUser
                                    );
                                    const execUnread = getUnreadExecutiveCount(
                                        execReports,
                                        currentUser,
                                        exec.role
                                    );

                                    const openExecChat = () => {
                                        markExecutiveChatRead(
                                            currentUser?.id,
                                            exec.role,
                                            getLatestExecutiveItemMs(execReports)
                                        );
                                        setActiveExecutivePartner({
                                            role: exec.role,
                                            title: exec.title,
                                            monogram: exec.monogram
                                        });
                                    };

                                    return (
                                        <div
                                            key={`exec-${exec.role}`}
                                            role="button"
                                            tabIndex={0}
                                            onClick={openExecChat}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    openExecChat();
                                                }
                                            }}
                                            className="px-4 py-3.5 flex items-center gap-3 hover:bg-blue-50/40 active:bg-blue-50/60 cursor-pointer transition-colors bg-slate-50/40"
                                        >
                                            <div
                                                className={`w-[46px] h-[46px] rounded-full flex items-center justify-center shrink-0 font-mono text-xs font-bold tracking-tight bg-blue-900 text-white ring-2 ring-offset-2 ${
                                                    execUnread > 0 ? 'ring-blue-600' : 'ring-blue-200'
                                                }`}
                                            >
                                                {exec.monogram}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span className="text-sm font-bold text-slate-900 truncate">
                                                            {exec.title}
                                                        </span>
                                                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200 text-[10px] font-semibold shrink-0">
                                                            Command
                                                        </span>
                                                    </div>
                                                    <span
                                                        className={`text-[11px] shrink-0 ${
                                                            execUnread > 0
                                                                ? 'font-bold text-blue-600'
                                                                : 'font-medium text-slate-400'
                                                        }`}
                                                    >
                                                        {execActivity.latestTimestamp
                                                            ? formatRelativeTimestamp(
                                                                  execActivity.latestTimestamp
                                                              )
                                                            : 'Direct'}
                                                    </span>
                                                </div>
                                                <p
                                                    className={`text-xs truncate mt-0.5 ${
                                                        execUnread > 0
                                                            ? 'font-semibold text-slate-900'
                                                            : 'text-slate-500'
                                                    }`}
                                                >
                                                    {execActivity.previewText ||
                                                        'Tap to view or send Weekly Command Report'}
                                                </p>
                                            </div>

                                            <div className="shrink-0 flex items-center gap-1.5">
                                                {execUnread > 0 ? (
                                                    <span className="min-w-[20px] h-[20px] px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold inline-flex items-center justify-center">
                                                        {execUnread}
                                                    </span>
                                                ) : execReports.length > 0 ? (
                                                    <CheckCheck
                                                        size={14}
                                                        className="text-emerald-600"
                                                    />
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })}

                        {(hubFilter === 'ALL' || hubFilter === 'MEDICAL') &&
                            (() => {
                            // Group all Sickbay alerts into ONE unified DM channel per Medical Officer
                            const q = searchQuery.trim().toLowerCase();
                            const grouped = new Map<string, SickbayVerification[]>();
                            for (const alert of sickbayAlerts) {
                                const key = String(alert.medicalOfficerId || alert.medicalOfficerName || 'Medical Officer');
                                const list = grouped.get(key) || [];
                                list.push(alert);
                                grouped.set(key, list);
                            }

                            return Array.from(grouped.entries())
                                .filter(([, alerts]) => {
                                    if (q) {
                                        const matchesAny = alerts.some(
                                            a =>
                                                a.cadetName.toLowerCase().includes(q) ||
                                                (a.medicalOfficerName || '').toLowerCase().includes(q) ||
                                                (a.clinicalNote || '').toLowerCase().includes(q) ||
                                                `rc ${a.courseNumber}`.includes(q)
                                        );
                                        if (!matchesAny) return false;
                                    }
                                    const hasOpen = alerts.some(a => (a.threadStatus || 'open') === 'open');
                                    const hasReplied = alerts.some(a => a.threadStatus === 'replied');
                                    const allResolved = alerts.every(a => a.threadStatus === 'resolved');
                                    if (statusFilter === 'RESOLVED') return allResolved;
                                    if (statusFilter === 'ADDRESSED') return !hasOpen && hasReplied;
                                    if (statusFilter === 'PENDING') return hasOpen;
                                    return true;
                                })
                                .map(([channelKey, alerts]) => {
                                    // Find latest message across all cadets in this Medical Officer's chat
                                    let latestAlert = alerts[0];
                                    let latestTime = 0;
                                    let latestText = latestAlert.clinicalNote || 'Cadet flagged Not Admitted at Sickbay';
                                    let latestSenderRole = 'medical_officer';

                                    for (const a of alerts) {
                                        const msgs = a.messages || [];
                                        const lastM = msgs.length > 0 ? msgs[msgs.length - 1] : null;
                                        const ts = new Date(lastM?.createdAt || a.verifiedAt || a.createdAt || 0).getTime();
                                        if (ts >= latestTime) {
                                            latestTime = ts;
                                            latestAlert = a;
                                            latestText = lastM?.text || a.clinicalNote || 'Cadet flagged Not Admitted at Sickbay';
                                            latestSenderRole = lastM?.senderRole || 'medical_officer';
                                        }
                                    }

                                    const openCount = alerts.filter(a => a.threadStatus !== 'resolved').length;
                                    const hasOpen = alerts.some(a => (a.threadStatus || 'open') === 'open');
                                    const hasReplied = alerts.some(a => a.threadStatus === 'replied');
                                    const isResolved = openCount === 0;

                                    const avatarRing = isResolved
                                        ? 'bg-slate-100 text-slate-600'
                                        : hasOpen
                                        ? 'bg-rose-50 text-rose-700 ring-2 ring-rose-500 ring-offset-2'
                                        : 'bg-blue-50 text-blue-900 ring-2 ring-blue-600 ring-offset-2';

                                    const moName = latestAlert.medicalOfficerName || 'Medical Officer';

                                    return (
                                        <div
                                            key={`med-channel-${channelKey}`}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setActiveMedicalChannelKey(channelKey)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    setActiveMedicalChannelKey(channelKey);
                                                }
                                            }}
                                            className="px-4 py-3.5 flex items-center gap-3 hover:bg-slate-50/80 active:bg-slate-50 cursor-pointer transition-colors"
                                        >
                                            <div className={`w-[46px] h-[46px] rounded-full flex items-center justify-center shrink-0 font-mono text-xs font-black tracking-tight ${avatarRing}`}>
                                                MED
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className={`truncate text-sm ${hasOpen ? 'font-bold text-slate-950' : 'font-semibold text-slate-800'}`}>
                                                        {moName}
                                                    </span>
                                                    <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-bold shrink-0">
                                                        Medical
                                                    </span>
                                                    {alerts.length > 1 && (
                                                        <span className="text-[11px] text-slate-400 font-medium shrink-0">
                                                            ({alerts.length} cadets)
                                                        </span>
                                                    )}
                                                </div>
                                                <p className={`text-xs truncate mt-0.5 ${hasOpen ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
                                                    <span className="font-semibold text-slate-700">
                                                        {latestAlert.cadetName} ({formatRC(latestAlert.courseNumber)}):
                                                    </span>{' '}
                                                    {latestSenderRole !== 'medical_officer' ? 'You: ' : ''}
                                                    {latestText}
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end justify-center gap-1 shrink-0 pl-1">
                                                <span className="text-[11px] font-medium text-slate-400">
                                                    {latestTime ? formatRelativeTimestamp(new Date(latestTime).toISOString()) : ''}
                                                </span>
                                                {!isResolved ? (
                                                    <span
                                                        className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${
                                                            hasOpen ? 'bg-rose-500' : 'bg-blue-600'
                                                        }`}
                                                    >
                                                        {openCount}
                                                    </span>
                                                ) : (
                                                    <CheckCheck size={14} className="text-emerald-600" />
                                                )}
                                            </div>
                                        </div>
                                    );
                                });
                        })()}
                        {(hubFilter === 'ALL' || hubFilter === 'COURSES') &&
                            visibleConversations.map(conv => {
                            const isResolved = conv.addressedCount === 0 && conv.pendingCount === 0;
                            const isAddressed = conv.addressedCount > 0;
                            const isPending = !isAddressed && conv.pendingCount > 0;
                            const isExecutiveCmd = conv.authorityTitle.toLowerCase() === 'commandant';
                            const cNum = conv.courseNumber;

                            const relativeTime = formatRelativeTimestamp(conv.latestActivityAt);

                            // Instagram-style status ring on 46px avatar
                            const avatarRingClass = isResolved
                                ? 'bg-slate-100 text-slate-600'
                                : isAddressed
                                ? 'bg-blue-50 text-blue-900 ring-2 ring-blue-600 ring-offset-2'
                                : 'bg-amber-50 text-amber-900 ring-2 ring-amber-400 ring-offset-2';

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
                                        className={`w-[46px] h-[46px] rounded-full flex items-center justify-center shrink-0 font-mono text-xs font-bold tracking-tight ${avatarRingClass}`}
                                    >
                                        {cNum > 0 ? `RC ${cNum}` : 'HQ'}
                                    </div>

                                    {/* 2. Center (2-line stack, flex-1 min-w-0) */}
                                    <div className="flex-1 min-w-0">
                                        {/* Line 1: Course Officer name + subtle inline authority label + subtle red ! if misconduct */}
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span
                                                className={`truncate text-sm ${
                                                    isAddressed
                                                        ? 'font-bold text-slate-900'
                                                        : 'font-medium text-slate-700'
                                                }`}
                                            >
                                                {conv.courseOfficerName}
                                            </span>
                                            <span
                                                className={`text-xs shrink-0 ${
                                                    isExecutiveCmd
                                                        ? 'text-amber-600 font-medium'
                                                        : 'text-indigo-600 font-medium'
                                                }`}
                                            >
                                                • {conv.authorityTitle}
                                            </span>
                                            {conv.latestParadeContext && (
                                                <span className="text-[11px] text-slate-400 shrink-0 font-normal">
                                                    [{conv.latestParadeContext}]
                                                </span>
                                            )}
                                            {conv.hasMisconduct && (
                                                <span
                                                    className="text-rose-600 font-black text-xs shrink-0"
                                                    title="Flagged Misconduct / Absence"
                                                >
                                                    !
                                                </span>
                                            )}
                                        </div>

                                        {/* Line 2: Single-line truncated preview of latest message */}
                                        <p
                                            className={`truncate text-sm mt-0.5 ${
                                                isAddressed
                                                    ? 'text-slate-800 font-medium'
                                                    : 'text-slate-500 font-normal'
                                            }`}
                                        >
                                            {conv.latestPreviewText}
                                        </p>
                                    </div>

                                    {/* 3. Right (flex flex-col items-end gap-1.5 shrink-0) */}
                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                        <span
                                            className={`text-[11px] whitespace-nowrap ${
                                                isAddressed
                                                    ? 'text-blue-600 font-semibold'
                                                    : 'text-slate-400 font-normal'
                                            }`}
                                        >
                                            {relativeTime}
                                        </span>

                                        {isAddressed ? (
                                            /* Guardrail 2: strictly displays actionable unread reply count, clears on resolve */
                                            <span
                                                className="min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shadow-xs"
                                                aria-label={`${conv.addressedCount} unread replies`}
                                            >
                                                {conv.addressedCount}
                                            </span>
                                        ) : isPending ? (
                                            <Clock
                                                size={14}
                                                className="text-amber-500"
                                                aria-label="Pending reply"
                                            />
                                        ) : (
                                            <CheckCheck
                                                size={15}
                                                className="text-emerald-600"
                                                aria-label="Resolved"
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Load More Pagination */}
                    {filteredConversations.length > visibleThreadLimit && (
                        <div className="p-3 bg-slate-50/60 border-t border-slate-100 flex justify-center">
                            <button
                                type="button"
                                onClick={() => setVisibleThreadLimit(prev => prev + INITIAL_VISIBLE_THREADS)}
                                className="px-5 py-2 rounded-full bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold transition-all"
                            >
                                Show more ({filteredConversations.length - visibleThreadLimit} remaining)
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── 3. WhatsApp-Style Floating Action Button (DFS Only) ── */}
            {isDFSOfficer && (
                <button
                    type="button"
                    onClick={() => setIsNewDirectiveOpen(true)}
                    aria-label="Issue New Directive"
                    className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 md:bottom-8 md:right-8 z-30 w-14 h-14 rounded-full bg-blue-900 hover:bg-blue-800 active:scale-95 text-white shadow-lg flex items-center justify-center transition-all"
                >
                    <MessageSquarePlus size={22} />
                </button>
            )}

            {/* ── 4. New Directive Sheet / Modal (DFS Only) ── */}
            {isDFSOfficer && isNewDirectiveOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div
                        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
                        onClick={() => setIsNewDirectiveOpen(false)}
                    />
                    <form
                        onSubmit={handleDispatchNewDirective}
                        className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
                    >
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900">New Directive</h3>
                                <p className="text-xs text-slate-500">
                                    Dispatch as {currentOfficerDesignation}
                                </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={handleOpenDrawerForNewDirectiveCourse}
                                    className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1"
                                >
                                    <ExternalLink size={12} />
                                    <span>Cite Cadets</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsNewDirectiveOpen(false)}
                                    className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Recipient Course
                            </label>
                            <select
                                value={newDirectiveCourse}
                                onChange={e => setNewDirectiveCourse(Number(e.target.value))}
                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
                            >
                                {availableCourses.map(cNum => (
                                    <option key={cNum} value={cNum}>
                                        {formatRC(cNum)} (Year {calculateCurrentLevel(cNum, activeRC)})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                                <Shield size={12} className="text-blue-700 shrink-0" />
                                {NEW_DIRECTIVE_PROMPTS.map((qp, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => setNewDirectiveText(qp)}
                                        className="px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium whitespace-nowrap"
                                    >
                                        {qp}
                                    </button>
                                ))}
                            </div>

                            <textarea
                                rows={3}
                                value={newDirectiveText}
                                onChange={e => setNewDirectiveText(e.target.value)}
                                placeholder={`Message ${formatRC(newDirectiveCourse)} Course Officer...`}
                                className="w-full px-3.5 py-2.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-slate-400 rounded-2xl text-sm text-slate-900 outline-none resize-none"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmittingNewDirective || !newDirectiveText.trim()}
                            className="w-full py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all"
                        >
                            {isSubmittingNewDirective ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Send size={15} />
                            )}
                            <span>Send Directive</span>
                        </button>
                    </form>
                </div>
            )}

            {/* ── 5. Dedicated Full-Screen / Slide-Over Chat Screen ── */}
            <ParadeRemarkDrawer
                submission={drawerTarget}
                isOpen={Boolean(drawerTarget)}
                onClose={() => {
                    setDrawerTarget(null);
                    setActiveRemarkId(null);
                    setSelectedDrawerCourse(null);
                    setSelectedDrawerAuthority(null);
                }}
                focusLog={true}
                activeRemarkId={activeRemarkId}
                targetCourseNumber={selectedDrawerCourse}
                targetAuthorityTitle={selectedDrawerAuthority}
            />

            {/* ── 6. Medical Officer Sickbay WhatsApp Chat Drawer (Unified per MO) ── */}
            <SickbayChatDrawer
                verifications={
                    activeMedicalChannelKey
                        ? sickbayAlerts.filter(
                              a =>
                                  String(a.medicalOfficerId || a.medicalOfficerName || 'Medical Officer') ===
                                  activeMedicalChannelKey
                          )
                        : null
                }
                onClose={() => setActiveMedicalChannelKey(null)}
                onUpdated={(updated) => {
                    setSickbayAlerts(prev => prev.map(item => item.id === updated.id ? updated : item));
                }}
            />

            {/* ── 7. Executive Chat Drawer & Weekly Command Report Sheet ── */}
            <ExecutiveChatDrawer
                isOpen={Boolean(activeExecutivePartner)}
                partnerTitle={activeExecutivePartner?.title || 'Executive Command'}
                partnerMonogram={activeExecutivePartner?.monogram || 'CMD'}
                reports={
                    activeExecutivePartner && activeExecutivePartner.role !== 'dfs'
                        ? commandReports.filter(
                              r =>
                                  r.recipientRole === 'both' ||
                                  r.recipientRole === activeExecutivePartner.role
                          )
                        : commandReports
                }
                onClose={() => setActiveExecutivePartner(null)}
                onUpdated={updated => {
                    setCommandReports(prev => prev.map(r => (r.id === updated.id ? updated : r)));
                }}
                onComposeReport={
                    isDFSOfficer
                        ? () => {
                              const role =
                                  activeExecutivePartner?.role === 'commandant' ||
                                  activeExecutivePartner?.role === 'deputy_commandant'
                                      ? activeExecutivePartner.role
                                      : 'both';
                              setActiveExecutivePartner(null);
                              setWeeklyReportDefaultRecipient(role);
                              setIsWeeklyReportSheetOpen(true);
                          }
                        : undefined
                }
            />

            <WeeklyCommandReportSheet
                isOpen={isWeeklyReportSheetOpen}
                defaultRecipient={weeklyReportDefaultRecipient}
                onClose={() => setIsWeeklyReportSheetOpen(false)}
                onSent={async () => {
                    try {
                        const refreshed = await dbService.fetchCommandReports();
                        setCommandReports(refreshed);
                    } catch {
                        // silent
                    }
                }}
            />
        </div>
    );
};
