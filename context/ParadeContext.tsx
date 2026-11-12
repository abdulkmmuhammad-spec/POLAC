import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { ParadeRecordMetadata, Notification, DashboardStats, UserRole, ParadeType, AuditEvent, CommandantRemark } from '../types';
import { dbService, supabase } from '../services/dbService';
import { useAuth } from './AuthContext';
import { calculateCurrentLevel } from '../utils/rcHelpers';
import { toast } from 'react-hot-toast';
import { audioService } from '../services/audioService';
import { inferSeverity } from '../utils/notificationUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

export interface CourseSummaryEntry {
    courseNumber: number;
    currentLevel: number;
    total: number;
    present: number;
    absent: number;
    sick: number;
    detention: number;
    pass: number;
    suspension: number;
    yet_to_report: number;
    latestSubmission?: ParadeRecordMetadata;
}

interface ParadeContextType {
    records: ParadeRecordMetadata[];
    notifications: Notification[];
    remarks: CommandantRemark[];
    refreshRemarks: () => Promise<void>;
    isDataLoading: boolean;
    refreshData: (officerNameFilter?: string) => Promise<void>;
    stats: DashboardStats;
    /** Grouped summary per RC course with computed year levels. */
    courseSummary: CourseSummaryEntry[];
    /** Grouped summary for yesterday. */
    yesterdaySummary: CourseSummaryEntry[];
    /** The active date string being used for today's summary */
    activeDate: string;
    /** The current highest active RC from app_settings. */
    activeRC: number;
    /** Refresh just the activeRC from the database. */
    refreshActiveRC: () => Promise<void>;
    /** Load more records for pagination. */
    loadMoreRecords: () => Promise<void>;
    /** Whether there are more records to load. */
    hasMoreRecords: boolean;
    /** Whether the records query failed. */
    isError: boolean;
    /** The actual error object from the records query. */
    error: Error | null;
    /** Manual refetch handler for the records query. */
    refetchRecords: () => void;
    /** Helper: compute current year level for a given course number. */
    getLevelForCourse: (courseNumber: number) => number;
    /** Dynamic submission window settings. */
    submissionSettings: {
        musterStartHour: number;
        musterEndHour: number;
        tattooStartHour: number;
    };
    /** Total number of parade records in the database. */
    totalRecordsCount: number;
    /** Current page based on records loaded. */
    currentPage: number;
    /** Total number of pages available. */
    totalPages: number;
    /** Update a specific submission setting. */
    updateSubmissionSetting: (key: 'muster_start_hour' | 'muster_end_hour' | 'tattoo_start_hour', value: number) => Promise<void>;
    /** The currently selected parade type for dashboard filtering. */
    selectedParadeType: ParadeType;
    /** Update the selected parade type. */
    setSelectedParadeType: (type: ParadeType) => void;
    /** Mark a single notification as read. */
    markNotificationRead: (id: string) => Promise<void>;
    /** Mark all notifications as read. */
    markAllAsRead: () => Promise<void>;
    /** Persistent filter states for Audit & Analytics */
    auditStatusFilter: string;
    setAuditStatusFilter: (status: string) => void;
    auditCourseFilter: string;
    setAuditCourseFilter: (course: string) => void;
    auditSearchTerm: string;
    setAuditSearchTerm: (term: string) => void;
    /** Get audit logs with filters (for Commandant dashboard). */
    getAuditLogs: (filters: {
        officerName?: string;
        actionType?: string;
        startDate?: string;
        endDate?: string;
    }) => Promise<AuditEvent[]>;
}

const ParadeContext = createContext<ParadeContextType | undefined>(undefined);

export const ParadeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { currentUser } = useAuth();
    const queryClient = useQueryClient();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [remarks, setRemarks] = useState<CommandantRemark[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [activeRC, setActiveRC] = useState<number>(12); // sensible default
    const [submissionSettings, setSubmissionSettings] = useState({
        musterStartHour: 6,
        musterEndHour: 12,
        tattooStartHour: 17
    });
    const [selectedParadeType, setSelectedParadeType] = useState<ParadeType>(ParadeType.MUSTER);
    const [totalRecordsCount, setTotalRecordsCount] = useState<number>(0);
    const [todayRecords, setTodayRecords] = useState<ParadeRecordMetadata[]>([]);

    // Persistent Filter State for Commandant Section
    const [auditStatusFilter, setAuditStatusFilter] = useState<string>('all');
    const [auditCourseFilter, setAuditCourseFilter] = useState<string>('all');
    const [auditSearchTerm, setAuditSearchTerm] = useState<string>('');

    const PAGE_SIZE = 20;

    // ── TanStack Query Infinite Query ────────────────────────────────────────
    // Migrated from manual array accumulation. Prevents memory bloat by allowing
    // pagination pages to be cached, stale-checked, and garbage collected.
    const {
        data: queryData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        refetch: refetchRecords,
        isLoading: isRecordsLoading,
        isError,
        error
    } = useInfiniteQuery({
        queryKey: ['paradeRecords', currentUser?.courseNumber],
        queryFn: ({ pageParam }) => dbService.getRecords({
            viewerId: currentUser?.id,
            role: currentUser?.role,
            courseNumber: currentUser?.courseNumber,
            cursor: pageParam as string | undefined,
            limit: PAGE_SIZE
        }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        staleTime: 1000 * 30, // 30 seconds staleTime for high reactivity
        gcTime: 1000 * 60 * 10,   // 10 minutes (formerly cacheTime)
        enabled: !!currentUser
    });

    // Flatten pages to reconstruct records array in memory reactively.
    const records = useMemo(() => {
        return queryData ? queryData.pages.flatMap(page => page.data) : [];
    }, [queryData]);

    const isDataLoading = isRecordsLoading || isFetchingNextPage || isRefreshing;
    const hasMoreRecords = !!hasNextPage;

    const totalPages = useMemo(() => Math.ceil(totalRecordsCount / PAGE_SIZE), [totalRecordsCount, PAGE_SIZE]);
    const currentPage = useMemo(() => Math.ceil(records.length / PAGE_SIZE), [records.length, PAGE_SIZE]);

    const refreshActiveRC = useCallback(async () => {
        const [rcRes, settingsRes] = await Promise.all([
            dbService.getActiveRC(),
            dbService.getSubmissionSettings()
        ]);
        setActiveRC(rcRes.data);
        setSubmissionSettings(settingsRes.data);
    }, []);

    const updateSubmissionSetting = async (key: 'muster_start_hour' | 'muster_end_hour' | 'tattoo_start_hour', value: number) => {
        try {
            await dbService.updateSubmissionSetting(key, value);
            // Update local state appropriately
            setSubmissionSettings(prev => {
                const newSettings = { ...prev };
                if (key === 'muster_start_hour') newSettings.musterStartHour = value;
                if (key === 'muster_end_hour') newSettings.musterEndHour = value;
                if (key === 'tattoo_start_hour') newSettings.tattooStartHour = value;
                return newSettings;
            });
            toast.success('System setting updated');
        } catch (error) {
            console.error('Error updating setting:', error);
            toast.error('Failed to update system setting');
        }
    };

    /**
     * Fetches ALL of today's parade records (all types) without pagination limits.
     * This is the authoritative data source for the Tactical Summary and stats.
     * It must not be confused with the paginated `records` array which is for the audit ledger.
     */
    const fetchTodayRecords = useCallback(async () => {
        if (!currentUser) return;
        try {
            const now = new Date();
            // A 7-day rolling window ensures we have enough data for today and yesterday summaries, preventing pagination truncation bugs
            const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

            const selectFields = `id, officer_id, officer_name, course_name, year_group, course_number,
               date, parade_type, present_count, absent_count, sick_count, detention_count,
               pass_count, suspension_count, yet_to_report_count, grand_total, created_at`;

            let queryBuilder;

            // Commandant: go through the RPC to respect RLS policies.
            // Direct table access may be blocked for the commandant role.
            if (currentUser.role === UserRole.COMMANDANT) {
                queryBuilder = supabase
                    .rpc('get_commandant_parade_overview', { p_viewer_id: String(currentUser.id) })
                    .select(selectFields)
                    .gte('created_at', windowStart)
                    .order('created_at', { ascending: false })
                    .limit(200);
            } else {
                queryBuilder = supabase
                    .from('parade_records')
                    .select(selectFields)
                    .gte('created_at', windowStart)
                    .eq('course_number', currentUser.courseNumber)
                    .order('created_at', { ascending: false })
                    .limit(50);
            }

            // Append dummy query param to break aggressive Safari mobile caching
            queryBuilder = queryBuilder.neq('id', '00000000-0000-0000-0000-000000000000');

            const { data, error } = await queryBuilder;
            if (error) throw error;

            const formatted: ParadeRecordMetadata[] = (data || []).map((r: any) => ({
                id: r.id,
                date: r.date,
                paradeType: r.parade_type,
                yearGroup: r.year_group,
                courseNumber: r.course_number,
                presentCount: r.present_count,
                absentCount: r.absent_count,
                sickCount: r.sick_count,
                detentionCount: r.detention_count,
                passCount: r.pass_count,
                suspensionCount: r.suspension_count,
                yetToReportCount: r.yet_to_report_count,
                grandTotal: r.grand_total,
                officerName: r.officer_name,
                officerId: r.officer_id,
                courseName: r.course_name,
                createdAt: r.created_at
            }));

            // Rely entirely on the 24-hour timestamp window to define "today's recent submissions"
            // bypassing the client's local date interpretation entirely.
            setTodayRecords(formatted);
        } catch (err) {
            console.error('Error fetching today\'s records:', err);
        }
    }, [currentUser]);

    const refreshRemarks = useCallback(async () => {
        try {
            const data = await dbService.getCommandantRemarks(
                currentUser?.role === UserRole.COMMANDANT
                    ? undefined
                    : {
                        courseOfficerId: currentUser?.id,
                        courseNumber: currentUser?.courseNumber
                    }
            );
            setRemarks(data);
        } catch (err) {
            console.warn('Error fetching commandant remarks:', err);
        }
    }, [currentUser]);

    const refreshData = useCallback(async (officerNameFilter?: string) => {
        setIsRefreshing(true);
        try {
            try {
                const effectiveOfficer =
                    officerNameFilter ??
                    (currentUser?.role === UserRole.COMMANDANT ? undefined : currentUser?.fullName);
                const effectiveCourse =
                    currentUser?.role === UserRole.COMMANDANT ? undefined : currentUser?.courseNumber;

                const [notifsRes, rcRes, settingsRes, count] = await Promise.all([
                    dbService.getNotifications(effectiveOfficer, effectiveCourse),
                    dbService.getActiveRC(),
                    dbService.getSubmissionSettings(),
                    dbService.getTotalRecordsCount()
                ]);

                setNotifications(notifsRes.data);
                setActiveRC(rcRes.data);
                setSubmissionSettings(settingsRes.data);
                setTotalRecordsCount(count);
            } catch (err) {
                console.error('refreshData Promise.all error:', err);
                toast.error('Network error while refreshing core metrics.');
            }

            await queryClient.invalidateQueries({ queryKey: ['paradeRecords'] });
            await refetchRecords();
            await fetchTodayRecords();
            await refreshRemarks();
        } catch (error) {
            console.error('Error refreshing data:', error);
            toast.error('Failed to sync master parade data. Please check your connection.');
        } finally {
            setIsRefreshing(false);
        }
    }, [queryClient, refetchRecords, fetchTodayRecords, refreshRemarks]);

    const loadMoreRecords = async () => {
        if (!hasMoreRecords || isDataLoading) return;
        try {
            await fetchNextPage();
            const count = await dbService.getTotalRecordsCount();
            setTotalRecordsCount(count);
        } catch (error) {
            console.error('Error loading more records:', error);
            toast.error('Failed to load older records.');
        }
    };

    const markNotificationRead = async (id: string) => {
        try {
            await dbService.markNotificationRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        } catch (err) {
            console.error('Error marking notification read:', err);
            toast.error('Failed to mark notification as read');
        }
    };

    const markAllAsRead = async () => {
        try {
            await dbService.markAllNotificationsRead();
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        } catch (err) {
            console.error('Error marking all notifications read:', err);
            toast.error('Failed to mark all notifications as read');
        }
    };

    const getAuditLogs = async (filters: {
        officerName?: string;
        actionType?: string;
        startDate?: string;
        endDate?: string;
    }): Promise<AuditEvent[]> => {
        const result = await dbService.getAuditLogs(filters);
        return result.data;
    };


    // Bug fix: do NOT call fetchTodayRecords in the empty-dep effect.
    // currentUser is not yet available at mount (auth is async),
    // so the guard 'if (!currentUser) return' would bail immediately.
    useEffect(() => {
        refreshData();
    }, []);

    // Trigger fetchTodayRecords and refreshRemarks as soon as currentUser is available (after auth resolves).
    // This is the correct place to fire the today-scoped query.
    useEffect(() => {
        if (currentUser) {
            fetchTodayRecords();
            refreshRemarks();
        }
    }, [currentUser, fetchTodayRecords, refreshRemarks]);

    useEffect(() => {
        const handleRemarksSync = (e: Event) => {
            const detail = (e as CustomEvent)?.detail;
            if (detail && (detail.action === 'resolved' || detail.action === 'followed_up')) {
                const targetCourse = detail.courseNumber;
                setNotifications(prev => {
                    const resolvedIds: string[] = [];
                    const updated = prev.map(n => {
                        const isRemarkNotif =
                            n.type === 'commandant_remark' ||
                            n.type === 'remark_response' ||
                            n.type === 'remark_resolved' ||
                            (n.title || '').toLowerCase().includes("commandant's parade remark") ||
                            (n.title || '').toLowerCase().includes('officer justification') ||
                            (n.title || '').toLowerCase().includes('parade inquiry');
                        const matchesCourse =
                            !targetCourse ||
                            Number(n.courseNumber) === Number(targetCourse) ||
                            (n.title || '').includes(`RC ${targetCourse}`);

                        if (isRemarkNotif && matchesCourse) {
                            resolvedIds.push(String(n.id));
                            return { ...n, read: true };
                        }
                        return n;
                    });

                    if (resolvedIds.length > 0 && typeof window !== 'undefined') {
                        try {
                            const raw = localStorage.getItem('polac_resolved_notification_ids');
                            const existing: string[] = raw ? JSON.parse(raw) : [];
                            const merged = Array.from(new Set([...resolvedIds, ...existing])).slice(0, 500);
                            localStorage.setItem('polac_resolved_notification_ids', JSON.stringify(merged));
                        } catch {}
                    }

                    return updated;
                });
            }
            refreshRemarks();
        };
        window.addEventListener('commandant-remarks-updated', handleRemarksSync);
        return () => window.removeEventListener('commandant-remarks-updated', handleRemarksSync);
    }, [refreshRemarks]);

    // ── Auto-Select Latest Submitted Parade Type ──
    // Ensures the Commandant Tactical Summary always defaults to the last submitted parade state (e.g. TATTOO, MUSTER, SPECIAL)
    useEffect(() => {
        if (records.length > 0) {
            const latestRecord = records[0];
            if (latestRecord && latestRecord.paradeType) {
                setSelectedParadeType(latestRecord.paradeType);
            }
        }
    }, [records]);

    // ── Resilient Background Auto-Sync Interval for Commandant & Course Officer Dashboards ──
    useEffect(() => {
        if (!currentUser) return;

        const intervalId = setInterval(() => {
            if (!document.hidden) {
                refreshData();
            }
        }, 20000);

        return () => clearInterval(intervalId);
    }, [currentUser, refreshData]);

    // ── Realtime Notifications (Supabase WebSockets) ──
    useEffect(() => {
        if (!currentUser) return;

        const fetchInitial = async () => {
            try {
                const officerNameFilter = currentUser.role === UserRole.COMMANDANT ? undefined : currentUser.fullName;
                const courseFilter = currentUser.role === UserRole.COMMANDANT ? undefined : currentUser.courseNumber;
                const notifsRes = await dbService.getNotifications(officerNameFilter, courseFilter);
                setNotifications(notifsRes.data);
            } catch (err) {
                console.error('Initial notification fetch error:', err);
            }
        };
        fetchInitial();

        const channel = supabase
            .channel('public:notifications_and_records')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications' },
                (payload) => {
                    const raw = payload.new as any;
                    const newNotif: Notification = {
                        id: raw.id,
                        type: raw.type,
                        title: raw.title,
                        content: raw.content,
                        timestamp: raw.timestamp,
                        read: raw.read,
                        officerName: raw.officer_name,
                        yearGroup: raw.year_group,
                        courseNumber: raw.course_number,
                        archivedAt: raw.archived_at
                    };

                    const matchesCourseOfficer =
                        (newNotif.officerName &&
                            currentUser.fullName &&
                            newNotif.officerName.toLowerCase() === currentUser.fullName.toLowerCase()) ||
                        (currentUser.courseNumber &&
                            newNotif.courseNumber &&
                            Number(newNotif.courseNumber) === Number(currentUser.courseNumber));

                    if (currentUser.role === UserRole.COMMANDANT || matchesCourseOfficer) {
                        const isCommandantSelfOutbound =
                            currentUser.role === UserRole.COMMANDANT &&
                            (newNotif.type === 'commandant_remark' || newNotif.type === 'remark_resolved');

                        if (isCommandantSelfOutbound) {
                            newNotif.read = true;
                            try {
                                const rawIds = localStorage.getItem('polac_resolved_notification_ids');
                                const existingIds: string[] = rawIds ? JSON.parse(rawIds) : [];
                                if (!existingIds.includes(String(newNotif.id))) {
                                    existingIds.unshift(String(newNotif.id));
                                    localStorage.setItem('polac_resolved_notification_ids', JSON.stringify(existingIds.slice(0, 500)));
                                }
                            } catch {}
                            setNotifications((prev) => [newNotif, ...prev]);
                            return;
                        }

                        setNotifications((prev) => [newNotif, ...prev]);

                        // Automatically trigger data/remarks refresh when a new parade state or remark arrives
                        if (newNotif.type === 'parade_submission' || newNotif.type === 'parade_update') {
                            refreshData();
                        }
                        if (
                            newNotif.type === 'commandant_remark' ||
                            newNotif.type === 'remark_response' ||
                            newNotif.type === 'remark_resolved'
                        ) {
                            refreshRemarks();
                        }

                        const severity = inferSeverity(newNotif);
                        
                        if (severity === 'critical') {
                            audioService.play('alert');
                        } else {
                            audioService.play('intel');
                        }

                        // Trigger native phone/OS push notification banner for Course Officers when permission is granted
                        if (
                            typeof window !== 'undefined' &&
                            'Notification' in window &&
                            window.Notification.permission === 'granted' &&
                            localStorage.getItem('polac_local_push_enabled') !== 'false'
                        ) {
                            const targetUrl =
                                newNotif.type === 'commandant_remark' || newNotif.type === 'remark_resolved'
                                    ? '/officer/history'
                                    : '/';
                            const requireUserInteraction =
                                severity === 'critical' ||
                                newNotif.type === 'commandant_remark' ||
                                newNotif.type === 'remark_resolved';
                            if ('serviceWorker' in navigator) {
                                navigator.serviceWorker.ready
                                    .then((reg) => {
                                        reg.showNotification(newNotif.title, {
                                            body: newNotif.content,
                                            icon: '/logo.png',
                                            badge: '/logo.png',
                                            tag: `polac-notif-${newNotif.id}`,
                                            renotify: true,
                                            vibrate: [200, 100, 200, 100, 200],
                                            requireInteraction: requireUserInteraction,
                                            data: {
                                                url: targetUrl,
                                                courseNumber: newNotif.courseNumber
                                            }
                                        } as any);
                                    })
                                    .catch(() => {
                                        try {
                                            new window.Notification(newNotif.title, {
                                                body: newNotif.content,
                                                icon: '/logo.png',
                                                tag: `polac-notif-${newNotif.id}`
                                            });
                                        } catch {}
                                    });
                            } else {
                                try {
                                    new window.Notification(newNotif.title, {
                                        body: newNotif.content,
                                        icon: '/logo.png',
                                        tag: `polac-notif-${newNotif.id}`
                                    });
                                } catch {}
                            }
                        }

                        toast.custom((t) => (
                            <motion.div
                                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className={`w-[92vw] max-w-md flex items-center gap-3.5 px-4 sm:px-6 py-4 rounded-2xl border shadow-2xl backdrop-blur-xl cursor-pointer ${
                                    newNotif.type === 'remark_resolved'
                                    ? 'bg-emerald-900/95 border-emerald-500/60 text-white'
                                    : severity === 'critical' 
                                    ? 'bg-rose-900/95 border-rose-500/60 text-white' 
                                    : 'bg-blue-900/95 border-blue-500/60 text-white'
                                }`}
                                onClick={() => {
                                    toast.dismiss(t.id);
                                    if (
                                        currentUser.role !== UserRole.COMMANDANT &&
                                        (newNotif.type === 'commandant_remark' || newNotif.type === 'remark_resolved')
                                    ) {
                                        window.dispatchEvent(
                                            new CustomEvent('open-officer-remark-reply', {
                                                detail: {
                                                    courseNumber: newNotif.courseNumber,
                                                    notification: newNotif
                                                }
                                            })
                                        );
                                    }
                                }}
                            >
                                <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center bg-white/10 border border-white/20 ${severity === 'critical' ? 'animate-pulse' : ''}`}>
                                    <Bell size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-0.5">
                                        {newNotif.type === 'commandant_remark'
                                            ? 'Commandant Remark • Tap to Reply'
                                            : newNotif.type === 'remark_resolved'
                                            ? 'Parade Inquiry Resolved • Tap to View'
                                            : severity === 'critical'
                                            ? 'Priority Alert'
                                            : 'Inbound Intel'}
                                    </p>
                                    <p className="text-xs sm:text-sm font-black leading-tight truncate">
                                        {newNotif.title}
                                    </p>
                                    <p className="text-[11px] opacity-85 line-clamp-1 mt-0.5">
                                        {newNotif.content}
                                    </p>
                                </div>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toast.dismiss(t.id);
                                    }}
                                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors shrink-0"
                                >
                                    <X size={16} />
                                </button>
                            </motion.div>
                        ), { duration: 8000, position: 'top-center' });
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'notifications' },
                (payload) => {
                    const raw = payload.new as any;
                    if (raw.archived_at) {
                        setNotifications((prev) => prev.filter(n => n.id !== raw.id));
                    } else {
                        const updatedNotif: Notification = {
                            id: raw.id,
                            type: raw.type,
                            title: raw.title,
                            content: raw.content,
                            timestamp: raw.timestamp,
                            read: raw.read,
                            officerName: raw.officer_name,
                            yearGroup: raw.year_group,
                            courseNumber: raw.course_number,
                            archivedAt: raw.archived_at
                        };

                        setNotifications((prev) => prev.map(n => 
                            n.id === updatedNotif.id ? updatedNotif : n
                        ));
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'parade_records' },
                () => {
                    refreshData();
                    fetchTodayRecords();
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'parade_records' },
                () => {
                    refreshData();
                    fetchTodayRecords();
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'commandant_remarks' },
                () => {
                    refreshRemarks();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser, refreshData, refreshRemarks]);

    /** Helper exposed via context to compute year level for a given course number */
    const getLevelForCourse = useCallback(
        (courseNumber: number) => calculateCurrentLevel(courseNumber, activeRC),
        [activeRC]
    );

    const activeDate = useMemo(() => {
        // Always use the current local date.
        // This ensures the dashboard accurately reflects the current day,
        // showing an empty state if no submissions have been made today.
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const localDate = new Date(now.getTime() - offset);
        return localDate.toISOString().split('T')[0];
    }, []);

    const stats = useMemo<DashboardStats>(() => {
        // Use todayRecords — the complete, non-paginated snapshot of recent activity.
        const todayByType = todayRecords.filter(r => r.date === activeDate && r.paradeType === selectedParadeType);

        const activeStrength = currentUser?.role === UserRole.COMMANDANT
            ? todayByType.reduce((sum, r) => sum + r.grandTotal, 0)
            : (currentUser?.totalCadets || 0);

        const presentCount = todayByType.reduce((sum, r) => sum + r.presentCount, 0);

        const percentage = activeStrength > 0
            ? Math.round((presentCount / activeStrength) * 100)
            : 0;

        // Calculate current week boundaries (Monday - Sunday) using local time strings
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        
        const monday = new Date(now.getFullYear(), now.getMonth(), diff);
        const mondayStr = [
            monday.getFullYear(),
            String(monday.getMonth() + 1).padStart(2, '0'),
            String(monday.getDate()).padStart(2, '0')
        ].join('-');

        const sunday = new Date(now.getFullYear(), now.getMonth(), diff + 6);
        const sundayStr = [
            sunday.getFullYear(),
            String(sunday.getMonth() + 1).padStart(2, '0'),
            String(sunday.getDate()).padStart(2, '0')
        ].join('-');

        return {
            totalCadets: Math.round(activeStrength),
            presentToday: percentage,
            absentThisWeek: records.filter(r => {
                // String comparison works perfectly for YYYY-MM-DD
                return r.date >= mondayStr && r.date <= sundayStr;
            }).reduce((sum, r) => sum + r.absentCount, 0),
            sickCadets: todayByType.reduce((sum, r) => sum + r.sickCount, 0)
        };
    }, [todayRecords, records, currentUser, selectedParadeType]);

    /**
     * Course-based summary (new). Groups today's records by courseNumber and
     * calculates the current year level dynamically using activeRC.
     */
    const courseSummary = useMemo<CourseSummaryEntry[]>(() => {
        // FILTER BY SELECTED PARADE TYPE AND ACTIVE DATE
        const filtered = todayRecords.filter(r => r.date === activeDate && r.paradeType === selectedParadeType);

        // Collect all unique course numbers from records
        const courseNumbers = Array.from(
            new Set(
                filtered
                    .map(r => r.courseNumber ?? null)
                    .filter((cn): cn is number => cn !== null)
            )
        ).sort((a: any, b: any) => (b as number) - (a as number)); // highest RC first (newest cadets)

        return courseNumbers.map(cn => {
            const courseRecords = filtered.filter(r => r.courseNumber === cn);
            return {
                courseNumber: cn,
                currentLevel: calculateCurrentLevel(cn as number, activeRC),
                total: courseRecords.reduce((s, r) => s + r.grandTotal, 0),
                present: courseRecords.reduce((s, r) => s + r.presentCount, 0),
                absent: courseRecords.reduce((s, r) => s + r.absentCount, 0),
                sick: courseRecords.reduce((s, r) => s + r.sickCount, 0),
                detention: courseRecords.reduce((s, r) => s + r.detentionCount, 0),
                pass: courseRecords.reduce((s, r) => s + (r.passCount || 0), 0),
                suspension: courseRecords.reduce((s, r) => s + (r.suspensionCount || 0), 0),
                yet_to_report: courseRecords.reduce((s, r) => s + (r.yetToReportCount || 0), 0),
                latestSubmission: courseRecords[0],
            };
        });
    }, [todayRecords, activeRC, selectedParadeType]);

    const yesterdaySummary = useMemo<CourseSummaryEntry[]>(() => {
        const active = new Date(activeDate);
        active.setDate(active.getDate() - 1);
        const previousStr = active.toISOString().split('T')[0];

        // FILTER BY SELECTED PARADE TYPE AND PREVIOUS DATE
        const filtered = todayRecords.filter(r => r.date === previousStr && r.paradeType === selectedParadeType);

        // Collect all unique course numbers from records
        const courseNumbers = Array.from(
            new Set(
                filtered
                    .map(r => r.courseNumber ?? null)
                    .filter((cn): cn is number => cn !== null)
            )
        ).sort((a: any, b: any) => (b as number) - (a as number));

        return courseNumbers.map(cn => {
            const courseRecords = filtered.filter(r => r.courseNumber === cn);
            return {
                courseNumber: cn,
                currentLevel: calculateCurrentLevel(cn as number, activeRC),
                total: courseRecords.reduce((s, r) => s + r.grandTotal, 0),
                present: courseRecords.reduce((s, r) => s + r.presentCount, 0),
                absent: courseRecords.reduce((s, r) => s + r.absentCount, 0),
                sick: courseRecords.reduce((s, r) => s + r.sickCount, 0),
                detention: courseRecords.reduce((s, r) => s + r.detentionCount, 0),
                pass: courseRecords.reduce((s, r) => s + (r.passCount || 0), 0),
                suspension: courseRecords.reduce((s, r) => s + (r.suspensionCount || 0), 0),
                yet_to_report: courseRecords.reduce((s, r) => s + (r.yetToReportCount || 0), 0),
                latestSubmission: courseRecords[0],
            };
        });
    }, [todayRecords, activeRC, selectedParadeType]);



    return (
        <ParadeContext.Provider value={{
            records,
            notifications,
            remarks,
            refreshRemarks,
            isDataLoading,
            refreshData,
            stats,
            courseSummary,
            yesterdaySummary,
            activeDate,
            activeRC,
            refreshActiveRC,
            submissionSettings,
            updateSubmissionSetting,
            loadMoreRecords,
            hasMoreRecords,
            isError,
            error,
            refetchRecords,
            getLevelForCourse,
            selectedParadeType,
            setSelectedParadeType,
            totalRecordsCount,
            currentPage,
            totalPages,
            markNotificationRead,
            markAllAsRead,
            getAuditLogs,
            auditStatusFilter,
            setAuditStatusFilter,
            auditCourseFilter,
            setAuditCourseFilter,
            auditSearchTerm,
            setAuditSearchTerm
        }}>
            {children}
        </ParadeContext.Provider>
    );
};

export const useParade = () => {
    const context = useContext(ParadeContext);
    if (context === undefined) {
        throw new Error('useParade must be used within a ParadeProvider');
    }
    return context;
};
