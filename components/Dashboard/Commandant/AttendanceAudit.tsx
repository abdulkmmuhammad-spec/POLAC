import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    Download,
    FileText,
    Calendar,
    RotateCcw,
    Search,
    ChevronDown,
    CheckCircle2,
    UserX,
    HeartPulse,
    ShieldAlert,
    MessageSquare,
    X,
    Eye,
    Clock,
    UserCheck,
    Check,
    ChevronRight,
    ArrowUpRight
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useParade } from '../../../context/ParadeContext';
import { useAuth } from '../../../context/AuthContext';
import { CadetStatus, UserRole, SickbayVerification } from '../../../types';
import { reportService } from '../../../services/reportService';
import { dbService, supabase } from '../../../services/dbService';
import { formatRC, calculateCurrentLevel } from '../../../utils/rcHelpers';
import { ParadeRemarkDrawer, ParadeRemarkTarget } from './ParadeRemarkDrawer';
import * as XLSX from 'xlsx';

type DatePreset = 'today' | 'this_week' | 'last_7_days' | 'this_month' | 'custom';

export const AttendanceAudit: React.FC = () => {
    const location = useLocation();
    const { currentUser } = useAuth();
    const isAdmin = currentUser?.role === UserRole.ADMIN;
    const {
        records,
        remarks,
        refreshData,
        activeRC,
        loadMoreRecords,
        hasMoreRecords,
        isDataLoading,
        auditStatusFilter,
        setAuditStatusFilter,
        auditCourseFilter,
        setAuditCourseFilter,
        auditSearchTerm,
        setAuditSearchTerm
    } = useParade();

    // Date Presets & Custom Range
    const [datePreset, setDatePreset] = useState<DatePreset>('this_week');
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });

    // Export dropdown state
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const exportMenuRef = useRef<HTMLDivElement>(null);

    // RPC & Session State
    const [historicalData, setHistoricalData] = useState<any[]>([]);
    const [sickbayVerifications, setSickbayVerifications] = useState<SickbayVerification[]>([]);
    const [isHistoricalLoading, setIsHistoricalLoading] = useState(false);
    const [activeRemarkTarget, setActiveRemarkTarget] = useState<ParadeRemarkTarget | null>(null);
    const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});

    // Cohorts from RPC
    const [availableCourses, setAvailableCourses] = useState<number[]>([]);

    // PDF Preview Modal State
    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
    const [initialPreviewMode, setInitialPreviewMode] = useState(false);

    // Compute standard date presets
    const computePresetDates = (preset: DatePreset): { start: string; end: string } => {
        const now = new Date();
        const toISODate = (d: Date) => d.toISOString().split('T')[0];

        if (preset === 'today') {
            const todayStr = toISODate(now);
            return { start: todayStr, end: todayStr };
        }

        if (preset === 'this_week') {
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
            const monday = new Date(now.getFullYear(), now.getMonth(), diff);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            return { start: toISODate(monday), end: toISODate(sunday) };
        }

        if (preset === 'last_7_days') {
            const end = new Date(now);
            const start = new Date(now);
            start.setDate(now.getDate() - 6);
            return { start: toISODate(start), end: toISODate(end) };
        }

        if (preset === 'this_month') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            return { start: toISODate(start), end: toISODate(end) };
        }

        return dateRange;
    };

    // Initialize preset on mount
    useEffect(() => {
        if (datePreset !== 'custom') {
            const calculated = computePresetDates(datePreset);
            setDateRange(calculated);
        }
    }, [datePreset]);

    // Close export dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
                setIsExportMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch active cohorts for course filter
    useEffect(() => {
        const fetchActiveCourses = async () => {
            try {
                const { data, error } = await supabase.rpc('get_active_cohorts');
                if (error) throw error;
                if (data) {
                    setAvailableCourses(data.map((row: any) => row.course_number));
                }
            } catch (err) {
                console.error('Failed to fetch active courses', err);
            }
        };
        fetchActiveCourses();
    }, []);

    // Consume navigation state from deep-links
    useEffect(() => {
        const state = location.state as {
            courseNumber?: number;
            searchTerm?: string;
            paradeType?: string;
            previewMode?: boolean;
        } | null;
        if (state) {
            if (state.courseNumber) {
                setAuditCourseFilter(state.courseNumber.toString());
            }
            if (state.searchTerm) {
                setAuditSearchTerm(state.searchTerm);
            }
            if (state.previewMode) {
                setInitialPreviewMode(true);
            }
            window.history.replaceState({}, document.title);
        }
    }, [location.state, setAuditCourseFilter, setAuditSearchTerm]);

    // Handle initial PDF preview once data loads
    useEffect(() => {
        const generatePreview = async () => {
            if (initialPreviewMode && !isHistoricalLoading && historicalData.length > 0) {
                setInitialPreviewMode(false);
                const url = await reportService.generateAuditReport({
                    filteredRecords: historicalData,
                    title: 'OFFICIAL AUDIT REPORT',
                    officerName: currentUser?.fullName || 'COMMANDANT',
                    previewOnly: true
                });
                setPreviewPdfUrl(url as string);
            }
        };
        generatePreview();
    }, [initialPreviewMode, isHistoricalLoading, historicalData, currentUser?.fullName]);

    // Debounced query execution
    useEffect(() => {
        const timer = setTimeout(() => {
            handleHistoricalSearch();
        }, 250);

        return () => clearTimeout(timer);
    }, [dateRange.start, dateRange.end, auditStatusFilter, auditCourseFilter, auditSearchTerm]);

    const handleHistoricalSearch = async () => {
        setIsHistoricalLoading(true);
        try {
            const parsedCourse = auditCourseFilter !== 'all' ? parseInt(auditCourseFilter) : undefined;
            const [{ data }, verifications] = await Promise.all([
                dbService.fetchHistoricalTrace({
                    startDate: dateRange.start || undefined,
                    endDate: dateRange.end || undefined,
                    courseNumber: parsedCourse,
                    status: auditStatusFilter,
                    searchTerm: auditSearchTerm.trim() || undefined
                }),
                dbService.fetchSickbayVerifications({
                    startDate: dateRange.start || undefined,
                    endDate: dateRange.end || undefined,
                    courseNumber: parsedCourse
                })
            ]);
            setHistoricalData(data || []);
            setSickbayVerifications(verifications || []);
        } catch (err) {
            console.error('Historical search failed', err);
        } finally {
            setIsHistoricalLoading(false);
        }
    };

    const sickbayMap = useMemo(() => {
        const map = new Map<string, SickbayVerification>();
        for (const v of sickbayVerifications) {
            const nameKey = (v.cadetName || '').trim().toLowerCase();
            if (v.paradeRecordId) {
                map.set(`${v.paradeRecordId}::${nameKey}`, v);
            }
            if (v.paradeDate && v.courseNumber) {
                map.set(`${v.paradeDate}::${v.courseNumber}::${nameKey}`, v);
            }
        }
        return map;
    }, [sickbayVerifications]);

    // Toggle session cadet expansion
    const toggleSessionExpand = (sessionId: string) => {
        setExpandedSessions(prev => ({ ...prev, [sessionId]: !prev[sessionId] }));
    };

    // Reset all filters
    const handleReset = () => {
        setDatePreset('this_week');
        setAuditStatusFilter('all');
        setAuditCourseFilter('all');
        setAuditSearchTerm('');
    };

    // Export Excel
    const handleExportExcel = () => {
        setIsExportMenuOpen(false);
        const rows = historicalData.map(item => ({
            'Date': item.r?.date,
            'Cadet Name': item.name,
            'Squad': item.squad,
            'Status': (item.status || '').toUpperCase(),
            'Course': item.r?.courseNumber ? formatRC(item.r.courseNumber) : 'Legacy',
            'Year Level': item.r?.courseNumber ? `Level ${calculateCurrentLevel(item.r.courseNumber, activeRC)}` : item.r?.yearGroup,
            'Parade Event': item.r?.paradeType ? String(item.r.paradeType).toUpperCase() : 'MUSTER',
            'Reporting Officer': item.r?.officerName || 'Course Officer'
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'AttendanceAudit');
        XLSX.writeFile(wb, `POLAC_Attendance_Audit_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // Export Official PDF
    const handleExportPdf = async () => {
        setIsExportMenuOpen(false);
        await reportService.generateAuditReport({
            filteredRecords: historicalData,
            title: 'POLICE ACADEMY ATTENDANCE & EXCEPTION AUDIT',
            officerName: currentUser?.fullName || 'COMMANDANT'
        });
    };

    // Open PDF Preview Modal
    const handlePreviewPdf = async () => {
        setIsExportMenuOpen(false);
        const url = await reportService.generateAuditReport({
            filteredRecords: historicalData,
            title: 'POLICE ACADEMY ATTENDANCE & EXCEPTION AUDIT',
            officerName: currentUser?.fullName || 'COMMANDANT',
            previewOnly: true
        });
        setPreviewPdfUrl(url as string);
    };

    // Open Remarks Drawer
    const handleOpenRemarkDrawer = (session: {
        id?: string | number;
        courseNumber?: number;
        yearGroup?: number;
        date: string;
        paradeType: string;
        officerName: string;
        presentCount?: number;
        absentCount?: number;
        sickCount?: number;
        detentionCount?: number;
        grandTotal?: number;
    }) => {
        const matched = records.find(r => String(r.id) === String(session.id));
        if (matched) {
            setActiveRemarkTarget(matched);
            return;
        }

        setActiveRemarkTarget({
            id: session.id || `${session.courseNumber}-${session.date}-${session.paradeType}`,
            officerName: session.officerName || `${formatRC(session.courseNumber || 0)} Course Officer`,
            courseNumber: session.courseNumber,
            yearGroup: session.yearGroup || calculateCurrentLevel(session.courseNumber || 0, activeRC),
            date: session.date || new Date().toISOString().split('T')[0],
            paradeType: session.paradeType || 'muster',
            presentCount: session.presentCount ?? 0,
            absentCount: session.absentCount ?? 0,
            sickCount: session.sickCount ?? 0,
            detentionCount: session.detentionCount ?? 0,
            grandTotal: session.grandTotal ?? 0
        });
    };

    // ─── Chronological Ledger Synthesis ─────────────────────────────────────────
    // Build unified session list combining:
    // 1. Exception sessions from historicalData
    // 2. 100% Turnout Zero-Exception sessions from context records (when in range and course filter)
    const { chronologicalFeed, kpiStats } = useMemo(() => {
        // Map sessions with exceptions from historicalData
        const exceptionSessionsMap: Record<string, {
            id: string | number;
            date: string;
            courseNumber: number;
            yearGroup?: number;
            paradeType: string;
            officerName: string;
            presentCount: number;
            absentCount: number;
            sickCount: number;
            detentionCount: number;
            grandTotal: number;
            items: any[];
            isZeroException: boolean;
        }> = {};

        historicalData.forEach(item => {
            const rec = item.r || {};
            const courseNum = rec.courseNumber || 0;
            const dateStr = rec.date || '';
            const type = rec.paradeType || 'muster';
            const sessionId = rec.id ? String(rec.id) : `${courseNum}-${dateStr}-${type}`;

            if (!exceptionSessionsMap[sessionId]) {
                exceptionSessionsMap[sessionId] = {
                    id: rec.id || sessionId,
                    date: dateStr,
                    courseNumber: courseNum,
                    yearGroup: rec.yearGroup || calculateCurrentLevel(courseNum, activeRC),
                    paradeType: type,
                    officerName: rec.officerName || 'Course Officer',
                    presentCount: rec.presentCount ?? 0,
                    absentCount: rec.absentCount ?? 0,
                    sickCount: rec.sickCount ?? 0,
                    detentionCount: rec.detentionCount ?? 0,
                    grandTotal: rec.grandTotal ?? 0,
                    items: [],
                    isZeroException: false
                };
            }

            exceptionSessionsMap[sessionId].items.push(item);
        });

        // If status filter is 'all' and no cadet search term, include zero-exception sessions from context records
        if (auditStatusFilter === 'all' && !auditSearchTerm.trim()) {
            records.forEach(rec => {
                const dateStr = rec.date || '';
                const courseNum = rec.courseNumber || 0;
                const type = rec.paradeType || 'muster';
                const sessionId = String(rec.id);

                // Date range check
                if (dateRange.start && dateStr < dateRange.start) return;
                if (dateRange.end && dateStr > dateRange.end) return;

                // Course filter check
                if (auditCourseFilter !== 'all' && String(courseNum) !== auditCourseFilter) return;

                // Zero exception check
                const isZero = (rec.absentCount === 0 && rec.sickCount === 0 && rec.detentionCount === 0) ||
                               (rec.presentCount === rec.grandTotal && rec.grandTotal > 0);

                if (isZero && !exceptionSessionsMap[sessionId]) {
                    exceptionSessionsMap[sessionId] = {
                        id: rec.id,
                        date: dateStr,
                        courseNumber: courseNum,
                        yearGroup: rec.yearGroup || calculateCurrentLevel(courseNum, activeRC),
                        paradeType: type,
                        officerName: rec.officerName || 'Course Officer',
                        presentCount: rec.presentCount,
                        absentCount: 0,
                        sickCount: 0,
                        detentionCount: 0,
                        grandTotal: rec.grandTotal,
                        items: [],
                        isZeroException: true
                    };
                }
            });
        }

        const allSessions = Object.values(exceptionSessionsMap);

        // Compute KPIs
        let totalAbsent = 0;
        let totalSick = 0;
        let totalDetention = 0;

        allSessions.forEach(s => {
            totalAbsent += s.absentCount || 0;
            totalSick += s.sickCount || 0;
            totalDetention += s.detentionCount || 0;
        });

        // Group sessions chronologically by date
        const groupedByDate: Record<string, typeof allSessions> = {};
        allSessions.forEach(session => {
            const dateKey = session.date || 'Undated';
            if (!groupedByDate[dateKey]) {
                groupedByDate[dateKey] = [];
            }
            groupedByDate[dateKey].push(session);
        });

        // Sort dates descending (newest first)
        const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
            return new Date(b).getTime() - new Date(a).getTime();
        });

        const feed = sortedDates.map(dateKey => ({
            date: dateKey,
            sessions: groupedByDate[dateKey].sort((a, b) => b.courseNumber - a.courseNumber)
        }));

        return {
            chronologicalFeed: feed,
            kpiStats: {
                totalSessions: allSessions.length,
                totalAbsent,
                totalSick,
                totalDetention
            }
        };
    }, [historicalData, records, auditStatusFilter, auditSearchTerm, auditCourseFilter, dateRange.start, dateRange.end, activeRC]);

    // Format date headers: "Today • Mon, Nov 16", "Yesterday • Sun, Nov 15", or "Sat, Nov 14, 2026"
    const formatDateHeader = (dateStr: string): string => {
        if (!dateStr || dateStr === 'Undated') return 'Undated Sessions';
        const [year, month, day] = dateStr.split('-').map(Number);
        if (!year || !month || !day) return dateStr;

        const dateObj = new Date(year, month - 1, day);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        const target = new Date(dateObj);
        target.setHours(0, 0, 0, 0);

        const options: Intl.DateTimeFormatOptions = {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            year: dateObj.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        };
        const formatted = dateObj.toLocaleDateString('en-US', options);

        if (target.getTime() === today.getTime()) {
            return `Today • ${formatted}`;
        }
        if (target.getTime() === yesterday.getTime()) {
            return `Yesterday • ${formatted}`;
        }
        return formatted;
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Header & Title */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        Attendance & Exception Audit
                        {isHistoricalLoading && (
                            <span className="inline-block w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        )}
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                        Authoritative ledger of parade muster records, discrepancies, and cadet turnout.
                    </p>
                </div>

                {/* Quick actions: Reset & Export */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                        onClick={handleReset}
                        className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
                        title="Reset all search parameters"
                    >
                        <RotateCcw size={13} />
                        <span>Reset Filters</span>
                    </button>

                    {/* Unified Export Dropdown */}
                    <div className="relative" ref={exportMenuRef}>
                        <button
                            onClick={() => setIsExportMenuOpen(prev => !prev)}
                            className="px-3.5 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 rounded-lg shadow-sm transition-all flex items-center gap-1.5 active:scale-[0.98]"
                        >
                            <Download size={14} />
                            <span>Export</span>
                            <ChevronDown size={13} className={`transition-transform duration-200 ${isExportMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isExportMenuOpen && (
                            <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-40 animate-in fade-in slide-in-from-top-1">
                                <button
                                    onClick={handleExportExcel}
                                    className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                                >
                                    <Download size={14} className="text-emerald-600" />
                                    <span>Download Excel (.xlsx)</span>
                                </button>
                                <button
                                    onClick={handleExportPdf}
                                    className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                                >
                                    <FileText size={14} className="text-blue-700" />
                                    <span>Download Official PDF</span>
                                </button>
                                <div className="my-1 border-t border-slate-100" />
                                <button
                                    onClick={handlePreviewPdf}
                                    className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                                >
                                    <Eye size={14} className="text-slate-500" />
                                    <span>Preview PDF Ledger</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Reactive Toolbar (Stripe/Linear-Style Flat Bar) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3.5">
                {/* Search Bar */}
                <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        value={auditSearchTerm}
                        onChange={(e) => setAuditSearchTerm(e.target.value)}
                        placeholder="Search cadet, squad, course, or officer..."
                        className="w-full pl-10 pr-9 py-2.5 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition-all"
                    />
                    {auditSearchTerm && (
                        <button
                            onClick={() => setAuditSearchTerm('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Filter Controls Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    {/* Date Presets */}
                    <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
                        {(
                            [
                                { id: 'today', label: 'Today' },
                                { id: 'this_week', label: 'This Week' },
                                { id: 'last_7_days', label: 'Last 7 Days' },
                                { id: 'this_month', label: 'This Month' },
                                { id: 'custom', label: 'Custom' }
                            ] as { id: DatePreset; label: string }[]
                        ).map(preset => (
                            <button
                                key={preset.id}
                                onClick={() => setDatePreset(preset.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    datePreset === preset.id
                                        ? 'bg-white text-blue-900 shadow-sm font-bold border border-slate-200/60'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    {/* Course / Cohort Selector */}
                    <div className="flex items-center gap-2">
                        <select
                            value={auditCourseFilter}
                            onChange={(e) => setAuditCourseFilter(e.target.value)}
                            className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition-all appearance-none cursor-pointer pr-8 bg-[radial-gradient(#64748b_1px,transparent_1px)]"
                            style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 0.65rem center',
                                backgroundSize: '1rem'
                            }}
                        >
                            <option value="all">All Regular Courses</option>
                            {availableCourses.map(cn => (
                                <option key={cn} value={cn}>
                                    {formatRC(cn)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Inline Custom Date Range (when Custom preset is selected) */}
                {datePreset === 'custom' && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 animate-in fade-in slide-in-from-top-1">
                        <span className="text-xs font-semibold text-slate-500">Date Range:</span>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                        />
                        <span className="text-xs text-slate-400 font-bold">to</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                        />
                    </div>
                )}
            </div>

            {/* Interactive 4-Card KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Parades Audited */}
                <button
                    type="button"
                    onClick={() => setAuditStatusFilter('all')}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                        auditStatusFilter === 'all'
                            ? 'bg-blue-900/5 border-blue-900 shadow-sm ring-2 ring-blue-900/20'
                            : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Parades Audited</span>
                        <Calendar size={16} className={auditStatusFilter === 'all' ? 'text-blue-900' : 'text-slate-400'} />
                    </div>
                    <p className="text-2xl font-black text-slate-900 mt-2">{kpiStats.totalSessions}</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Total sessions in range</p>
                </button>

                {/* 2. Absent */}
                <button
                    type="button"
                    onClick={() => setAuditStatusFilter(auditStatusFilter === CadetStatus.ABSENT ? 'all' : CadetStatus.ABSENT)}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                        auditStatusFilter === CadetStatus.ABSENT
                            ? 'bg-rose-50 border-rose-500 shadow-sm ring-2 ring-rose-500/20'
                            : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Absent</span>
                        <UserX size={16} className={auditStatusFilter === CadetStatus.ABSENT ? 'text-rose-600' : 'text-slate-400'} />
                    </div>
                    <div className="flex items-baseline gap-2 mt-2">
                        <p className="text-2xl font-black text-rose-600">{kpiStats.totalAbsent}</p>
                        {kpiStats.totalAbsent > 0 && (
                            <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded">Action</span>
                        )}
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Unauthorized / AWOL</p>
                </button>

                {/* 3. Medical / Sick */}
                <button
                    type="button"
                    onClick={() => setAuditStatusFilter(auditStatusFilter === CadetStatus.SICK ? 'all' : CadetStatus.SICK)}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                        auditStatusFilter === CadetStatus.SICK
                            ? 'bg-amber-50 border-amber-500 shadow-sm ring-2 ring-amber-500/20'
                            : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Medical / Sick</span>
                        <HeartPulse size={16} className={auditStatusFilter === CadetStatus.SICK ? 'text-amber-600' : 'text-slate-400'} />
                    </div>
                    <p className="text-2xl font-black text-amber-600 mt-2">{kpiStats.totalSick}</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Hospitalized / Sickbay</p>
                </button>

                {/* 4. Detention */}
                <button
                    type="button"
                    onClick={() => setAuditStatusFilter(auditStatusFilter === CadetStatus.DETENTION ? 'all' : CadetStatus.DETENTION)}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                        auditStatusFilter === CadetStatus.DETENTION
                            ? 'bg-indigo-50 border-indigo-500 shadow-sm ring-2 ring-indigo-500/20'
                            : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Detention</span>
                        <ShieldAlert size={16} className={auditStatusFilter === CadetStatus.DETENTION ? 'text-indigo-600' : 'text-slate-400'} />
                    </div>
                    <p className="text-2xl font-black text-indigo-600 mt-2">{kpiStats.totalDetention}</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Orderly Room / Guard</p>
                </button>
            </div>

            {/* Flattened Chronological Ledger */}
            <div className="space-y-6">
                {chronologicalFeed.map(dateGroup => (
                    <div key={dateGroup.date} className="space-y-3">
                        {/* Date Header Separator */}
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <Calendar size={15} className="text-slate-400" />
                                <h2 className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight">
                                    {formatDateHeader(dateGroup.date)}
                                </h2>
                            </div>
                            <span className="text-xs font-medium text-slate-400">
                                {dateGroup.sessions.length} {dateGroup.sessions.length === 1 ? 'parade' : 'parades'}
                            </span>
                        </div>

                        {/* Sessions List */}
                        <div className="space-y-2.5">
                            {dateGroup.sessions.map(session => {
                                const sessionId = String(session.id);
                                const isExpanded = expandedSessions[sessionId] === true;
                                const sessionRemarks = remarks.filter(rm => String(rm.submissionId) === sessionId);
                                const level = calculateCurrentLevel(session.courseNumber, activeRC);
                                const total = session.grandTotal || (session.presentCount + session.absentCount + session.sickCount + session.detentionCount);
                                const turnoutPct = total > 0 ? ((session.presentCount / total) * 100).toFixed(1) : '100.0';

                                // A. Zero-Exception Sessions (100% Present Turnout)
                                if (session.isZeroException) {
                                    return (
                                        <div
                                            key={sessionId}
                                            className="group flex items-center justify-between gap-3 px-4 py-3 bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-200/80 rounded-xl transition-all"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-md shrink-0">
                                                        {formatRC(session.courseNumber)}
                                                    </span>
                                                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wide truncate">
                                                        {String(session.paradeType || 'MUSTER').toUpperCase()}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2.5 shrink-0">
                                                <span className="text-xs font-bold text-emerald-700 hidden sm:inline">
                                                    {session.presentCount}/{session.grandTotal || session.presentCount} Present (100%)
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenRemarkDrawer(session)}
                                                    className="px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:text-emerald-900 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-all flex items-center gap-1"
                                                >
                                                    <MessageSquare size={12} />
                                                    <span>{isAdmin ? 'View' : 'Remark'}</span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                }

                                // B. Exception-First Parade Session Card
                                const visibleCadets = isExpanded ? session.items : session.items.slice(0, 6);
                                const hasMoreCadets = session.items.length > 6;

                                return (
                                    <div
                                        key={sessionId}
                                        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-slate-300"
                                    >
                                        {/* Session Card Header */}
                                        <div className="px-3.5 py-3 sm:px-5 sm:py-3.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-2 sm:gap-4">
                                            {/* Course & Parade Information */}
                                            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                                                <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-blue-900 text-white rounded-lg text-[11px] sm:text-xs font-black tracking-wide shrink-0">
                                                    {formatRC(session.courseNumber)}
                                                </span>
                                                <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide truncate">
                                                    {String(session.paradeType || 'MUSTER').toUpperCase()}
                                                </h3>
                                            </div>

                                            {/* Turnout Progress Meter & Deep-Link Action */}
                                            <div className="flex items-center justify-end gap-2 sm:gap-4 shrink-0">
                                                {/* Turnout Stats & Progress Bar - Visible on desktop (lg:), hidden on mobile/tablet */}
                                                <div className="hidden lg:block text-right">
                                                    <div className="flex items-baseline justify-end gap-1.5">
                                                        <span className="text-xs font-bold text-slate-800">
                                                            {session.presentCount}/{total} Present
                                                        </span>
                                                        <span className="text-xs font-extrabold text-blue-900">
                                                            ({turnoutPct}%)
                                                        </span>
                                                    </div>

                                                    {/* Two-Tone Turnout Progress Bar */}
                                                    <div className="w-36 h-2 bg-slate-200 rounded-full overflow-hidden flex mt-1">
                                                        <div
                                                            className="bg-emerald-500 h-full transition-all"
                                                            style={{ width: `${Math.min(100, Math.max(0, (session.presentCount / (total || 1)) * 100))}%` }}
                                                        />
                                                        <div
                                                            className="bg-rose-500 h-full transition-all"
                                                            style={{ width: `${Math.min(100, Math.max(0, (session.absentCount / (total || 1)) * 100))}%` }}
                                                        />
                                                        <div
                                                            className="bg-amber-500 h-full transition-all"
                                                            style={{ width: `${Math.min(100, Math.max(0, (session.sickCount / (total || 1)) * 100))}%` }}
                                                        />
                                                        <div
                                                            className="bg-indigo-500 h-full transition-all"
                                                            style={{ width: `${Math.min(100, Math.max(0, (session.detentionCount / (total || 1)) * 100))}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Deep-link to Remarks & Directives */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenRemarkDrawer(session)}
                                                    className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-sm active:scale-95"
                                                >
                                                    <MessageSquare size={13} className="shrink-0" />
                                                    <span className="hidden md:inline">{isAdmin ? 'View Directives' : 'Remarks & Directives'}</span>
                                                    <span className="md:hidden">{isAdmin ? 'Directives' : 'Remarks'}</span>
                                                    {sessionRemarks.length > 0 && (
                                                        <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-black shrink-0">
                                                            {sessionRemarks.length}
                                                        </span>
                                                    )}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Exception Items List */}
                                        <div className="p-4 sm:p-5">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                                {visibleCadets.map((cadet, cIdx) => {
                                                    const statusLower = (cadet.status || '').toLowerCase();
                                                    const isAbsent = statusLower === 'absent';
                                                    const isSick = statusLower === 'sick';
                                                    const isDetention = statusLower === 'detention';

                                                    const badgeStyle = isAbsent
                                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                        : isSick
                                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                        : 'bg-indigo-50 text-indigo-700 border-indigo-200';

                                                    const cadetNameKey = (cadet.name || '').trim().toLowerCase();
                                                    const verification = isSick
                                                        ? sickbayMap.get(`${session.id}::${cadetNameKey}`) ||
                                                          sickbayMap.get(`${session.date}::${session.courseNumber}::${cadetNameKey}`)
                                                        : undefined;

                                                    return (
                                                        <div
                                                            key={cIdx}
                                                            className="flex flex-col gap-1.5 px-3 py-2.5 bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-xl transition-all"
                                                        >
                                                            <div className="flex items-center justify-between gap-3">
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-xs font-bold text-slate-800 truncate">
                                                                        {cadet.name}
                                                                    </p>
                                                                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mt-0.5">
                                                                        {cadet.squad && <span>Squad {cadet.squad}</span>}
                                                                        {cadet.reason && (
                                                                            <>
                                                                                <span className="text-slate-300">•</span>
                                                                                <span className="truncate italic text-slate-600">{cadet.reason}</span>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-md border shrink-0 ${badgeStyle}`}>
                                                                    {cadet.status}
                                                                </span>
                                                            </div>

                                                            {isSick && (
                                                                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200/60">
                                                                    {!verification || verification.status === 'pending_verification' ? (
                                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                                            <Clock size={10} />
                                                                            Pending Sickbay Check
                                                                        </span>
                                                                    ) : verification.status === 'admitted' ? (
                                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                            <CheckCircle2 size={10} />
                                                                            Admitted
                                                                        </span>
                                                                    ) : (
                                                                        <>
                                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                                                                <ShieldAlert size={10} />
                                                                                Not Admitted
                                                                            </span>
                                                                            {verification.clinicalNote && (
                                                                                <span className="text-[10px] text-rose-700 italic truncate max-w-full">
                                                                                    "{verification.clinicalNote}"
                                                                                </span>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Expand / Collapse Cadets Toggle */}
                                            {hasMoreCadets && (
                                                <button
                                                    onClick={() => toggleSessionExpand(sessionId)}
                                                    className="mt-3.5 w-full py-2 bg-slate-50 hover:bg-slate-100 text-blue-900 rounded-xl text-xs font-bold border border-slate-200 transition-all flex items-center justify-center gap-1 active:scale-[0.99]"
                                                >
                                                    {isExpanded
                                                        ? 'Collapse cadet exception list'
                                                        : `Show all ${session.items.length} cadet exceptions (+${session.items.length - 6} more)`}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {/* Empty State */}
                {chronologicalFeed.length === 0 && !isHistoricalLoading && (
                    <div className="p-16 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                        <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                            <Search size={22} />
                        </div>
                        <h3 className="text-sm font-bold text-slate-800">No parade sessions or exceptions found</h3>
                        <p className="text-xs text-slate-500 font-medium mt-1 max-w-sm mx-auto">
                            No parade records match your current date range, status, or search query. Try broadening your parameters.
                        </p>
                        <button
                            onClick={handleReset}
                            className="mt-4 px-4 py-2 text-xs font-bold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                            Reset All Filters
                        </button>
                    </div>
                )}
            </div>

            {/* Load More Pagination */}
            {hasMoreRecords && (
                <div className="flex justify-center pt-2">
                    <button
                        onClick={loadMoreRecords}
                        disabled={isDataLoading}
                        className="px-6 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        {isDataLoading ? (
                            <>
                                <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                                <span>Loading records...</span>
                            </>
                        ) : (
                            'Load Extended History'
                        )}
                    </button>
                </div>
            )}

            {/* PDF Preview Modal */}
            {previewPdfUrl && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
                        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
                            <div>
                                <h2 className="text-base font-bold">Audit Ledger Preview</h2>
                                <p className="text-[11px] text-slate-400">Authoritative Administrative View</p>
                            </div>
                            <button
                                onClick={() => setPreviewPdfUrl(null)}
                                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="flex-1 flex flex-col min-h-0 bg-slate-100">
                            <iframe src={previewPdfUrl} className="w-full flex-1 min-h-[60vh] border-0" title="PDF Preview" />
                            <div className="p-4 bg-white border-t border-slate-200 flex justify-end gap-2.5 shrink-0">
                                <button
                                    onClick={() => setPreviewPdfUrl(null)}
                                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={handleExportPdf}
                                    className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-900 text-white hover:bg-blue-800 flex items-center gap-1.5 shadow-sm"
                                >
                                    <Download size={14} /> Download PDF
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Interactive Parade Remark Drawer */}
            <ParadeRemarkDrawer
                submission={activeRemarkTarget}
                isOpen={Boolean(activeRemarkTarget)}
                onClose={() => setActiveRemarkTarget(null)}
            />
        </div>
    );
};
