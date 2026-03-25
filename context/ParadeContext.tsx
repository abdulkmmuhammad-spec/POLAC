import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { ParadeRecord, Notification, DashboardStats, UserRole, ParadeType, AuditEvent } from '../types';
import { dbService, supabase } from '../services/dbService';
import { useAuth } from './AuthContext';
import { calculateCurrentLevel } from '../utils/rcHelpers';
import { toast } from 'react-hot-toast';

interface CourseSummaryEntry {
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
}

interface ParadeContextType {
    records: ParadeRecord[];
    notifications: Notification[];
    isDataLoading: boolean;
    refreshData: (officerNameFilter?: string) => Promise<void>;
    stats: DashboardStats;
    /** Grouped summary per RC course with computed year levels. */
    courseSummary: CourseSummaryEntry[];
    /** The current highest active RC from app_settings. */
    activeRC: number;
    /** Refresh just the activeRC from the database. */
    refreshActiveRC: () => Promise<void>;
    /** Load more records for pagination. */
    loadMoreRecords: () => Promise<void>;
    /** Whether there are more records to load. */
    hasMoreRecords: boolean;
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
    const [records, setRecords] = useState<ParadeRecord[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isDataLoading, setIsDataLoading] = useState(false);
    const [activeRC, setActiveRC] = useState<number>(12); // sensible default
    const [submissionSettings, setSubmissionSettings] = useState({
        musterStartHour: 6,
        musterEndHour: 12,
        tattooStartHour: 17
    });
    const [hasMoreRecords, setHasMoreRecords] = useState(true);
    const [selectedParadeType, setSelectedParadeType] = useState<ParadeType>(ParadeType.MUSTER);
    const [totalRecordsCount, setTotalRecordsCount] = useState<number>(0);

    // Persistent Filter State for Commandant Section
    const [auditStatusFilter, setAuditStatusFilter] = useState<string>('all');
    const [auditCourseFilter, setAuditCourseFilter] = useState<string>('all');
    const [auditSearchTerm, setAuditSearchTerm] = useState<string>('');

    const PAGE_SIZE = 20;

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

    const refreshData = async (officerNameFilter?: string) => {
        setIsDataLoading(true);
        try {
            const [recordsRes, notifsRes, rcRes, settingsRes, count] = await Promise.all([
                dbService.getRecords(0, PAGE_SIZE - 1),
                dbService.getNotifications(officerNameFilter),
                dbService.getActiveRC(),
                dbService.getSubmissionSettings(),
                dbService.getTotalRecordsCount()
            ]);

            const fetchedRecords = recordsRes.data;
            const fetchedNotifs = notifsRes.data;

            setRecords(fetchedRecords);
            setNotifications(fetchedNotifs);
            setActiveRC(rcRes.data);
            setSubmissionSettings(settingsRes.data);
            setTotalRecordsCount(count);
            setHasMoreRecords(fetchedRecords.length === PAGE_SIZE && fetchedRecords.length < count);

            // AUTO-DETECT LATEST PARADE TYPE FOR TODAY
            const today = new Date().toISOString().split('T')[0];
            const todayRecords = fetchedRecords.filter(r => r.date === today);
            if (todayRecords.length > 0) {
                const latest = [...todayRecords].sort((a, b) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )[0];
                setSelectedParadeType(latest.paradeType);
            }
        } catch (error) {
            console.error('Error refreshing data:', error);
            toast.error('Failed to sync master parade data. Please check your connection.');
        } finally {
            setIsDataLoading(false);
        }
    };

    const loadMoreRecords = async () => {
        if (!hasMoreRecords || isDataLoading) return;

        setIsDataLoading(true);
        try {
            const from = records.length;
            const to = from + PAGE_SIZE - 1;

            const [moreRecordsRes, count] = await Promise.all([
                dbService.getRecords(from, to),
                dbService.getTotalRecordsCount()
            ]);

            const moreRecords = moreRecordsRes.data;

            setRecords(prev => [...prev, ...moreRecords]);
            setTotalRecordsCount(count);
            setHasMoreRecords(moreRecords.length === PAGE_SIZE && (records.length + moreRecords.length) < count);
        } catch (error) {
            console.error('Error loading more records:', error);
            toast.error('Failed to load older records.');
        } finally {
            setIsDataLoading(false);
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


    useEffect(() => {
        refreshData();
    }, []);

    // ── Realtime Notifications (Supabase WebSockets) ──
    useEffect(() => {
        if (!currentUser) return; // Do not subscribe when unauthenticated

        // Perform initial fetch
        const fetchInitial = async () => {
            try {
                const officerNameFilter = currentUser.role === UserRole.COMMANDANT ? undefined : currentUser.fullName;
                const notifsRes = await dbService.getNotifications(officerNameFilter);
                setNotifications(notifsRes.data);
            } catch (err) {
                console.error('Initial notification fetch error:', err);
            }
        };
        fetchInitial();

        // Subscribe to real-time inserts
        const channel = supabase
            .channel('public:notifications')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications' },
                (payload) => {
                    const newNotif = {
                        id: payload.new.id,
                        type: payload.new.type,
                        title: payload.new.title,
                        content: payload.new.content,
                        timestamp: payload.new.timestamp,
                        read: payload.new.read,
                        officerName: payload.new.officer_name,
                        yearGroup: payload.new.year_group,
                        courseNumber: payload.new.course_number
                    } as Notification;
                    
                    if (currentUser.role === UserRole.COMMANDANT || newNotif.officerName === currentUser.fullName) {
                        setNotifications((prev) => [newNotif, ...prev]);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser]);

    /** Helper exposed via context to compute year level for a given course number */
    const getLevelForCourse = useCallback(
        (courseNumber: number) => calculateCurrentLevel(courseNumber, activeRC),
        [activeRC]
    );

    const stats = useMemo<DashboardStats>(() => {
        const today = new Date().toISOString().split('T')[0];
        // Statistics should also respect the filter for "Present Today" and "Hospitalized"
        const todayRecords = records.filter(r => r.date === today && r.paradeType === selectedParadeType);

        const activeStrength = currentUser?.role === UserRole.COURSE_OFFICER
            ? (currentUser.totalCadets || 0)
            : todayRecords.reduce((sum, r) => sum + r.grandTotal, 0);

        const presentCount = todayRecords.reduce((sum, r) => sum + r.presentCount, 0);

        const percentage = activeStrength > 0
            ? Math.round((presentCount / activeStrength) * 100)
            : 0;

        return {
            totalCadets: Math.round(activeStrength),
            presentToday: percentage,
            absentThisWeek: records.filter(r => {
                const d = new Date(r.date);
                const now = new Date();
                const start = new Date(now.setDate(now.getDate() - 7));
                return d >= start;
            }).reduce((sum, r) => sum + r.absentCount, 0),
            sickCadets: todayRecords.reduce((sum, r) => sum + r.sickCount, 0)
        };
    }, [records, currentUser, selectedParadeType]);

    /**
     * Course-based summary (new). Groups today's records by courseNumber and
     * calculates the current year level dynamically using activeRC.
     */
    const courseSummary = useMemo<CourseSummaryEntry[]>(() => {
        const today = new Date().toISOString().split('T')[0];
        // FILTER BY SELECTED PARADE TYPE
        const todayRecords = records.filter(r => r.date === today && r.paradeType === selectedParadeType);

        // Collect all unique course numbers from records
        const courseNumbers = Array.from(
            new Set(
                todayRecords
                    .map(r => r.courseNumber ?? null)
                    .filter((cn): cn is number => cn !== null)
            )
        ).sort((a: any, b: any) => (b as number) - (a as number)); // highest RC first (newest cadets)

        return courseNumbers.map(cn => {
            const courseRecords = todayRecords.filter(r => r.courseNumber === cn);
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
            };
        });
    }, [records, activeRC, selectedParadeType]);



    return (
        <ParadeContext.Provider value={{
            records,
            notifications,
            isDataLoading,
            refreshData,
            stats,
            courseSummary,
            activeRC,
            refreshActiveRC,
            submissionSettings,
            updateSubmissionSetting,
            loadMoreRecords,
            hasMoreRecords,
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
