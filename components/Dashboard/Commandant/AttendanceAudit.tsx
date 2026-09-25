import React, { useState, useMemo, useEffect } from 'react';
import { Download, FileText, Calendar, RotateCcw, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useParade } from '../../../context/ParadeContext';
import { CadetStatus } from '../../../types';
import { reportService } from '../../../services/reportService';
import { dbService, supabase } from '../../../services/dbService';
import { formatRC, calculateCurrentLevel } from '../../../utils/rcHelpers';
import * as XLSX from 'xlsx';

export const AttendanceAudit: React.FC = () => {
    const location = useLocation();
    const {
        records,
        refreshData,
        activeRC,
        loadMoreRecords,
        hasMoreRecords,
        isDataLoading,
        currentPage,
        totalPages,
        auditStatusFilter,
        setAuditStatusFilter,
        auditCourseFilter,
        setAuditCourseFilter,
        auditSearchTerm,
        setAuditSearchTerm
    } = useParade();

    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [isDefaultView, setIsDefaultView] = useState(true);
    const [expandedRCs, setExpandedRCs] = useState<Record<number, boolean>>({});
    const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});
    
    // New RPC States
    const [historicalData, setHistoricalData] = useState<any[]>([]);
    const [isHistoricalLoading, setIsHistoricalLoading] = useState(false);

    // Toggle accordion for an RC
    const toggleRC = (rc: number) => {
        setExpandedRCs(prev => ({ ...prev, [rc]: !prev[rc] }));
    };

    // Toggle event cadet truncation
    const toggleEvent = (eventId: string) => {
        setExpandedEvents(prev => ({ ...prev, [eventId]: !prev[eventId] }));
    };

    // Get unique course numbers for the filter dropdown
    const [availableCourses, setAvailableCourses] = useState<number[]>([]);

    React.useEffect(() => {
        const fetchActiveCourses = async () => {
            try {
                // Highly performant RPC call that natively handles DISTINCT extraction 
                // and bypasses the 1,000-row pagination limit
                const { data, error } = await supabase.rpc('get_active_cohorts');
                
                if (error) {
                    throw error;
                }
                
                if (data) {
                    // The RPC already returns distinct integers ordered DESC, so we can map directly
                    setAvailableCourses(data.map((row: any) => row.course_number));
                }
            } catch (err) {
                console.error("Failed to fetch active courses", err);
            }
        };
        fetchActiveCourses();
    }, []);

    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
    const [initialPreviewMode, setInitialPreviewMode] = useState(false);

    // Consume incoming navigation state from Notification Intelligence Deep-Links
    useEffect(() => {
        const state = location.state as { courseNumber?: number; searchTerm?: string; paradeType?: string, previewMode?: boolean } | null;
        if (state) {
            if (state.courseNumber) {
                setAuditCourseFilter(state.courseNumber.toString());
                setExpandedRCs(prev => ({ ...prev, [state.courseNumber!]: true }));
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

    // Generate preview once data is loaded
    useEffect(() => {
        const generatePreview = async () => {
            if (initialPreviewMode && !isHistoricalLoading && historicalData.length > 0) {
                setInitialPreviewMode(false);
                const url = await reportService.generateAuditReport({
                    filteredRecords: historicalData,
                    title: "OFFICIAL AUDIT REPORT",
                    officerName: "COMMANDANT",
                    previewOnly: true
                });
                setPreviewPdfUrl(url as string);
            }
        };
        generatePreview();
    }, [initialPreviewMode, isHistoricalLoading, historicalData]);

    // Default to Current Week (Monday to Sunday)
    const currentWeekRange = useMemo(() => {
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday (0)

        const monday = new Date(now.setDate(diff));
        monday.setHours(0, 0, 0, 0);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        return { monday, sunday };
    }, []);

    const handleHistoricalSearch = async () => {
        setIsHistoricalLoading(true);
        try {
            let start, end;
            if (isDefaultView) {
                // Ensure dates are strings for the RPC
                start = currentWeekRange.monday.toISOString().split('T')[0];
                end = currentWeekRange.sunday.toISOString().split('T')[0];
            } else {
                start = dateRange.start || undefined;
                end = dateRange.end || undefined;
            }

            const { data } = await dbService.fetchHistoricalTrace({
                startDate: start,
                endDate: end,
                courseNumber: auditCourseFilter !== 'all' ? parseInt(auditCourseFilter) : undefined,
                status: auditStatusFilter,
                searchTerm: auditSearchTerm
            });
            setHistoricalData(data || []);
        } catch (err) {
            console.error("Historical search failed", err);
        } finally {
            setIsHistoricalLoading(false);
        }
    };

    // Auto-fetch data when view or filters change
    React.useEffect(() => {
        handleHistoricalSearch();
    }, [isDefaultView, auditStatusFilter, auditCourseFilter, auditSearchTerm, currentWeekRange, dateRange.start, dateRange.end]);

    const filteredRecords = useMemo(() => {
        return historicalData;
    }, [historicalData]);

    // Grouping logic for Accordion: Group by RC, then sub-group by Parade Event ID
    const groupedRecords = useMemo(() => {
        const groups: Record<number, Record<string, any[]>> = {};
        filteredRecords.forEach(item => {
            const rc = item.r?.courseNumber || 0;
            const eventId = item.r?.id || `${item.r?.date}-${item.r?.paradeType}`;
            if (!groups[rc]) groups[rc] = {};
            if (!groups[rc][eventId]) groups[rc][eventId] = [];
            groups[rc][eventId].push(item);
        });
        return groups;
    }, [filteredRecords]);

    const handleUpdateDetail = async (cadetDetailId: any, updates: any) => {
        try {
            await dbService.updateCadetDetail(cadetDetailId, updates);
            await dbService.addNotification({
                title: 'Status Override',
                content: `Attendance record updated via Audit deep-dive.`,
                type: 'system',
                officerName: 'COMMANDANT'
            } as any);
            await refreshData();
        } catch (error) {
            console.error("Failed to update detail:", error);
        }
    };

    const handleReset = () => {
        setIsDefaultView(true);
        setDateRange({ start: '', end: '' });
        setAuditStatusFilter('all');
        setAuditCourseFilter('all');
        setAuditSearchTerm('');
        setHistoricalData([]);
    };

    const handleExport = () => {
        const data = filteredRecords.map(item => ({
            'Date': item.r?.date,
            'Cadet Name': item.name,
            'Squad': item.squad,
            'Status': item.status,
            'Course': item.r?.courseNumber ? formatRC(item.r.courseNumber) : 'Legacy',
            'Year Level': item.r?.courseNumber ? calculateCurrentLevel(item.r.courseNumber, activeRC) : item.r?.yearGroup,
            'Officer': item.r?.officerName
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "AttendanceAudit");
        XLSX.writeFile(wb, `Attendance_Audit_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Tactical Control Panel */}
            <div className="bg-white/80 backdrop-blur-md p-4 md:p-6 rounded-lg shadow-sm border border-slate-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex bg-slate-100 p-1 rounded-md shrink-0 border border-slate-200">
                            <button
                                onClick={() => setIsDefaultView(true)}
                                className={`px-5 py-2.5 rounded text-sm font-black uppercase tracking-widest transition-all ${isDefaultView ? 'bg-white text-blue-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Current Week
                            </button>
                            <button
                                onClick={() => setIsDefaultView(false)}
                                className={`px-5 py-2.5 rounded text-sm font-black uppercase tracking-widest transition-all ${!isDefaultView ? 'bg-white text-blue-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Historical Trace
                            </button>
                        </div>

                        {!isDefaultView && (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 shrink-0">
                                <input
                                    type="date"
                                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-[10px] font-bold uppercase outline-none focus:ring-1 focus:ring-blue-900"
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                />
                                <span className="text-slate-400 font-black text-[10px]">TO</span>
                                <input
                                    type="date"
                                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-[10px] font-bold uppercase outline-none focus:ring-1 focus:ring-blue-900"
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                                />
                                <button
                                    onClick={handleHistoricalSearch}
                                    disabled={isHistoricalLoading}
                                    className="px-4 py-2 bg-blue-900 text-white rounded-md text-[10px] font-black uppercase tracking-widest hover:bg-blue-800 transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isHistoricalLoading ? 'SEARCHING...' : 'SEARCH DATABASE'}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExport}
                            className="flex items-center gap-3 px-5 py-2.5 bg-emerald-600 text-white rounded-md text-sm font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-sm"
                        >
                            <Download size={16} />
                            EXPORT XLS
                        </button>
                        <button
                            onClick={() => reportService.generateAuditReport({ filteredRecords, title: "OFFICIAL AUDIT REPORT", officerName: "COMMANDANT" })}
                            className="flex items-center gap-3 px-5 py-2.5 bg-blue-900 text-white rounded-md text-sm font-black uppercase tracking-widest hover:bg-blue-800 transition-all shadow-sm"
                        >
                            <FileText size={16} />
                            GENERATE PDF
                        </button>
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row items-center gap-4 pt-4 border-t border-slate-100">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            placeholder="COMMAND SEARCH: ENTER CADET NAME OR SQUAD PARAMETER..."
                            className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-blue-900 text-sm font-black uppercase tracking-wider focus:bg-white transition-all animate-in slide-in-from-left-4"
                            style={{ boxShadow: auditSearchTerm ? '0 0 0 1px rgba(30, 58, 138, 0.1), 0 0 15px rgba(30, 58, 138, 0.05)' : 'none' }}
                            value={auditSearchTerm}
                            onChange={(e) => setAuditSearchTerm(e.target.value)}
                        />
                        {auditSearchTerm && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-blue-900 animate-pulse shadow-[0_0_8px_rgba(30,58,138,0.5)]" />
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                        <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200">
                            {[
                                { id: 'all', label: 'ALL' },
                                { id: CadetStatus.ABSENT, label: 'ABSENTEES ONLY' },
                                { id: CadetStatus.SICK, label: 'MEDICAL/SICK' },
                                { id: CadetStatus.DETENTION, label: 'DETENTION' }
                            ].map(filter => (
                                <button
                                    key={filter.id}
                                    onClick={() => setAuditStatusFilter(filter.id)}
                                    className={`px-4 py-2 rounded text-[11.5px] font-black uppercase tracking-tight transition-all ${auditStatusFilter === filter.id ? 'bg-white text-blue-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>

                        <select
                            className="px-5 py-2.5 bg-slate-50 border border-slate-200 rounded-md text-sm font-black uppercase tracking-widest outline-none focus:ring-1 focus:ring-blue-900 appearance-none min-w-[180px]"
                            value={auditCourseFilter}
                            onChange={(e) => setAuditCourseFilter(e.target.value)}
                        >
                            <option value="all">RC: ALL MODULES</option>
                            {availableCourses.map(cn => (
                                <option key={cn} value={cn}>{formatRC(cn)}</option>
                            ))}
                        </select>

                        <button
                            onClick={handleReset}
                            className="p-2.5 text-slate-400 hover:text-blue-900 hover:bg-slate-50 rounded-md transition-all border border-slate-200"
                            title="Purge Parameters"
                        >
                            <RotateCcw size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Tactical Audit Table - High-Density Event-Based Layout */}
            <div className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto relative">
                    {/* Desktop Table Header - STICKY */}
                    <table className="w-full text-left hidden md:table border-collapse">
                        <thead className="bg-blue-900 text-white border-b border-blue-800 sticky top-0 z-20">
                            <tr>
                                <th className="px-8 py-5 text-sm font-black uppercase tracking-wider w-[240px]">Parade Event Details</th>
                                <th className="px-6 py-5 text-sm font-black uppercase tracking-wider text-center w-[120px]">Entries</th>
                                <th className="px-6 py-5 text-sm font-black uppercase tracking-wider">Identified Cadets (Compact Chips)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {Object.entries(groupedRecords)
                                .sort(([rcA], [rcB]) => parseInt(rcB) - parseInt(rcA)) // Sort RC descending
                                .map(([rcStr, eventsMap]) => {
                                    const rc = parseInt(rcStr);
                                    const isExpanded = expandedRCs[rc] !== false; // Default to expanded
                                    const totalEntriesInRC = Object.values(eventsMap).reduce((acc, curr) => acc + curr.length, 0);
                                    
                                    return (
                                        <React.Fragment key={rc}>
                                            {/* RC Group Header */}
                                            <tr
                                                className="bg-slate-50 border-y border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                                                onClick={() => toggleRC(rc)}
                                            >
                                                <td colSpan={3} className="px-8 py-4">
                                                    <div className="flex items-center gap-4">
                                                        {isExpanded ? <ChevronDown size={18} className="text-blue-900" /> : <ChevronUp size={18} className="text-slate-400" />}
                                                        <span className="text-sm font-black text-blue-900 uppercase tracking-widest">
                                                            {rc === 0 ? 'LEGACY ARCHIVE' : `${formatRC(rc)} • LEVEL ${calculateCurrentLevel(rc, activeRC)}`}
                                                        </span>
                                                        <span className="text-[11px] font-bold text-slate-400 uppercase ml-auto tracking-wider">
                                                            {totalEntriesInRC} TOTAL IDENTIFIED
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>

                                            {isExpanded && Object.entries(eventsMap)
                                                .sort(([, itemsA], [, itemsB]) => new Date(itemsB[0].r.date).getTime() - new Date(itemsA[0].r.date).getTime())
                                                .map(([eventId, items]) => {
                                                    const firstItem = items[0];
                                                    const isEventExpanded = expandedEvents[eventId] === true;
                                                    const visibleItems = isEventExpanded ? items : items.slice(0, 8);
                                                    return (
                                                        <tr key={eventId} className="even:bg-slate-50/50 hover:bg-blue-50/30 transition-colors group">
                                                            <td className="px-8 py-6">
                                                                <div className="flex items-center gap-3 text-slate-900 mb-1">
                                                                    <Calendar size={14} className="text-blue-900" />
                                                                    <span className="text-sm font-mono font-black">{new Date(firstItem.r.date).toLocaleDateString()}</span>
                                                                </div>
                                                                <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest italic">{firstItem.r.paradeType}</p>
                                                            </td>
                                                            <td className="px-6 py-6 text-center">
                                                                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-900 text-xs font-black border border-slate-200 shadow-sm">
                                                                    {items.length}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-6">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    {visibleItems.map((cadet, cIdx) => (
                                                                        <div 
                                                                            key={cIdx} 
                                                                            className="group/chip flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-md border border-slate-200 shadow-sm hover:border-blue-900/30 transition-all"
                                                                        >
                                                                            <div className={`w-2 h-2 rounded-full ${
                                                                                cadet.status?.toLowerCase() === 'absent' ? 'bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,0.3)]' :
                                                                                cadet.status?.toLowerCase() === 'sick' ? 'bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.3)]' :
                                                                                'bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,0.3)]'
                                                                            }`} />
                                                                            <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">
                                                                                {cadet.name.split(' ').slice(0, 2).join(' ')}
                                                                            </span>
                                                                            <span className="text-[9px] text-slate-400 font-mono font-bold border-l pl-2 ml-1">
                                                                                {cadet.squad}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                    {!isEventExpanded && items.length > 8 && (
                                                                        <button
                                                                            onClick={() => toggleEvent(eventId)}
                                                                            className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all shadow-sm active:scale-95"
                                                                        >
                                                                            +{items.length - 8} MORE CADETS
                                                                        </button>
                                                                    )}
                                                                    {isEventExpanded && items.length > 8 && (
                                                                        <button
                                                                            onClick={() => toggleEvent(eventId)}
                                                                            className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all shadow-sm active:scale-95"
                                                                        >
                                                                            COLLAPSE LIST
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </React.Fragment>
                                    );
                                })}
                        </tbody>
                    </table>

                    {/* Mobile View - Tactical Event Cards */}
                    <div className="md:hidden space-y-4 p-4 bg-slate-50/50">
                        {Object.entries(groupedRecords)
                            .sort(([rcA], [rcB]) => parseInt(rcB) - parseInt(rcA))
                            .flatMap(([rcStr, eventsMap]) => 
                            Object.entries(eventsMap)
                                .sort(([, itemsA], [, itemsB]) => new Date(itemsB[0].r.date).getTime() - new Date(itemsA[0].r.date).getTime())
                                .map(([eventId, items]) => {
                                const firstItem = items[0];
                                const rc = parseInt(rcStr);
                                const isEventExpanded = expandedEvents[eventId] === true;
                                const visibleMobileItems = isEventExpanded ? items : items.slice(0, 4);
                                return (
                                    <div key={eventId} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-black text-blue-900 uppercase tracking-widest mb-1">
                                                    {rc === 0 ? 'LEGACY' : formatRC(rc)}
                                                </p>
                                                <div className="flex items-center gap-2 text-slate-800">
                                                    <Calendar size={14} className="text-slate-400" />
                                                    <span className="text-xs font-mono font-black">{new Date(firstItem.r.date).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter italic mb-1">{firstItem.r.paradeType}</p>
                                                <span className="text-[10px] font-black text-slate-900 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
                                                    {items.length} CADETS
                                                </span>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-slate-50/30">
                                            <div className="flex flex-col gap-3">
                                                {visibleMobileItems.map((cadet, cIdx) => (
                                                    <div key={cIdx} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm transition-all hover:border-blue-200">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                                                cadet.status?.toLowerCase() === 'absent' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' :
                                                                cadet.status?.toLowerCase() === 'sick' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' :
                                                                'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.4)]'
                                                            }`} />
                                                            <div>
                                                                <span className="text-xs font-black text-slate-800 uppercase tracking-wide block">{cadet.name}</span>
                                                                {cadet.squad && (
                                                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mt-0.5">SQUAD {cadet.squad}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="shrink-0">
                                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded border ${
                                                                cadet.status?.toLowerCase() === 'absent' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                                                                cadet.status?.toLowerCase() === 'sick' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                                                'bg-indigo-50 text-indigo-700 border-indigo-100'
                                                            }`}>
                                                                {cadet.status}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            {items.length > 4 && (
                                                <button
                                                    onClick={() => toggleEvent(eventId)}
                                                    className="mt-3 w-full py-2 bg-slate-100 hover:bg-slate-200 text-blue-900 rounded-lg text-[10px] font-black uppercase tracking-widest border border-slate-200 transition-colors flex items-center justify-center gap-1 active:scale-[0.98]"
                                                >
                                                    {isEventExpanded ? 'COLLAPSE LIST' : `SHOW ALL ${items.length} CADETS (+${items.length - 4} MORE)`}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                    {filteredRecords.length === 0 && (
                        <div className="p-24 text-center flex flex-col items-center">
                            <div className="w-16 h-16 bg-slate-50 rounded-lg flex items-center justify-center text-slate-200 mb-6 border border-dashed border-slate-300">
                                <Search size={32} />
                            </div>
                            <p className="text-slate-400 font-black uppercase text-[10px] tracking-[0.3em] italic mb-2">No cadets identified in search range</p>
                            <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest max-w-[250px] mx-auto leading-relaxed">Adjust filters or purge search parameters to re-scan the registry ledger.</p>
                            <button
                                onClick={handleReset}
                                className="mt-8 text-blue-900 text-[10px] font-black uppercase tracking-[0.3em] border-b border-blue-900 hover:text-blue-700 hover:border-blue-700 transition-all"
                            >
                                Purge All Trace Parameters
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {hasMoreRecords && (
                <div className="flex justify-center pt-4">
                    <button
                        onClick={loadMoreRecords}
                        disabled={isDataLoading}
                        className="flex items-center gap-2 px-8 py-3 bg-blue-900 text-white border border-blue-800 rounded-md text-[10px] font-black uppercase tracking-widest hover:bg-blue-800 transition-all shadow-md disabled:opacity-50"
                    >
                        {isDataLoading ? (
                            <span className="flex items-center gap-2">
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                SCANNING RECORDS...
                            </span>
                        ) : (
                            'Load Extended Ledger'
                        )}
                    </button>
                </div>
            )}
            {/* Preview Modal */}
            {previewPdfUrl && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-6xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
                        <div className="bg-[#0f172a] text-white px-8 py-6 relative overflow-hidden shrink-0 flex justify-between items-center">
                            <div>
                                <h2 className="text-lg font-black tracking-tight uppercase">Audit Ledger Preview</h2>
                                <p className="text-[9px] font-bold text-slate-400 tracking-[0.3em] uppercase opacity-60">Authoritative Administrative View</p>
                            </div>
                            <button onClick={() => setPreviewPdfUrl(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
                                <span className="font-bold text-sm uppercase">Close</span>
                            </button>
                        </div>
                        <div className="flex-1 flex flex-col min-h-0 bg-slate-100">
                            <iframe src={previewPdfUrl} className="w-full flex-1 min-h-[60vh] border-0" title="PDF Preview" />
                            <div className="p-4 bg-white border-t flex justify-end gap-3 shrink-0">
                                <button onClick={() => setPreviewPdfUrl(null)} className="px-6 py-3 rounded-xl text-[11px] font-black uppercase text-slate-600 hover:bg-slate-100 border border-slate-200">Back</button>
                                <button onClick={() => reportService.generateAuditReport({ filteredRecords, title: "OFFICIAL AUDIT REPORT", officerName: "COMMANDANT" })} className="px-6 py-3 rounded-xl text-[11px] font-black uppercase bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2 shadow-sm">
                                    <Download size={16}/> Download PDF
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
