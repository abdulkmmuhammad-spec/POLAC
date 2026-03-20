import React, { useState, useMemo } from 'react';
import { Download, FileText, Calendar, RotateCcw, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { useParade } from '../../../context/ParadeContext';
import { CadetStatus } from '../../../types';
import { reportService } from '../../../services/reportService';
import { dbService } from '../../../services/dbService';
import { formatRC, calculateCurrentLevel } from '../../../utils/rcHelpers';
import * as XLSX from 'xlsx';

export const AttendanceAudit: React.FC = () => {
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

    // Toggle accordion for an RC
    const toggleRC = (rc: number) => {
        setExpandedRCs(prev => ({ ...prev, [rc]: !prev[rc] }));
    };

    // Get unique course numbers for the filter dropdown
    const availableCourses = useMemo(() => {
        const numbers = new Set<number>();
        records.forEach(r => {
            if (r.courseNumber) numbers.add(r.courseNumber);
        });
        return Array.from(numbers).sort((a, b) => b - a);
    }, [records]);

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

    const filteredRecords = useMemo(() => {
        return records.flatMap(r => r.cadets.map(c => ({ ...c, r })))
            .filter(item => {
                const itemDate = new Date(item.r.date);

                if (isDefaultView) {
                    if (itemDate < currentWeekRange.monday || itemDate > currentWeekRange.sunday) return false;
                } else if (dateRange.start && dateRange.end) {
                    const start = new Date(dateRange.start);
                    const end = new Date(dateRange.end);
                    if (itemDate < start || itemDate > end) return false;
                }

                if (auditStatusFilter !== 'all' && item.status !== auditStatusFilter) return false;
                if (auditCourseFilter !== 'all' && item.r.courseNumber !== parseInt(auditCourseFilter)) return false;

                if (auditSearchTerm) {
                    const search = auditSearchTerm.toLowerCase();
                    return item.name.toLowerCase().includes(search) || item.squad.toLowerCase().includes(search);
                }

                return true;
            });
    }, [records, isDefaultView, dateRange, auditStatusFilter, auditCourseFilter, auditSearchTerm, currentWeekRange]);

    // Grouping logic for Accordions
    const groupedRecords = useMemo(() => {
        const groups: Record<number, any[]> = {};
        filteredRecords.forEach(item => {
            const rc = item.r.courseNumber || 0; // 0 for Legacy
            if (!groups[rc]) groups[rc] = [];
            groups[rc].push(item);
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
    };

    const handleExport = () => {
        const data = filteredRecords.map(item => ({
            'Date': item.r.date,
            'Cadet Name': item.name,
            'Squad': item.squad,
            'Status': item.status,
            'Course': item.r.courseNumber ? formatRC(item.r.courseNumber) : 'Legacy',
            'Year Level': item.r.courseNumber ? calculateCurrentLevel(item.r.courseNumber, activeRC) : item.r.yearGroup,
            'Officer': item.r.officerName
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
                            onClick={() => reportService.generateCommandReturn(records, "ATTENDANCE AUDIT REPORT")}
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

            {/* Tactical Audit Table with RC Accordions */}
            <div className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto relative">
                    {/* Desktop Table Header - STICKY */}
                    <table className="w-full text-left hidden md:table border-collapse">
                        <thead className="bg-blue-900 text-white border-b border-blue-800 sticky top-0 z-20">
                            <tr>
                                <th className="px-8 py-5 text-sm font-black uppercase tracking-wider">Cadet & Squad Identifier</th>
                                <th className="px-6 py-5 text-sm font-black uppercase tracking-wider text-center">Status Pip</th>
                                <th className="px-6 py-5 text-sm font-black uppercase tracking-wider">Date / Training Type</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {Object.entries(groupedRecords)
                                .sort(([rcA], [rcB]) => parseInt(rcB) - parseInt(rcA)) // Sort RC descending
                                .map(([rcStr, items]) => {
                                    const rc = parseInt(rcStr);
                                    const groupItems = items as any[];
                                    const isExpanded = expandedRCs[rc] !== false; // Default to expanded
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
                                                            {groupItems.length} ENTRIES IN BLOCK
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>

                                            {isExpanded && groupItems.map((item, idx) => (
                                                <tr key={`${rc}-${idx}`} className="even:bg-slate-50/50 hover:bg-blue-50/30 transition-colors group">
                                                    <td className="px-8 py-6">
                                                        <p className="font-black text-slate-900 text-base uppercase tracking-tight">{item.name}</p>
                                                        <p className="text-[11px] text-slate-400 font-mono tracking-tighter mt-1">SQUAD: {item.squad.toUpperCase()}</p>
                                                    </td>
                                                    <td className="px-6 py-6">
                                                        <div className="flex items-center justify-center gap-4">
                                                            <div className={`w-3.5 h-3.5 rounded-sm ${item.status === CadetStatus.ABSENT ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' :
                                                                item.status === CadetStatus.SICK ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' :
                                                                    'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.4)]'
                                                                }`} />
                                                            <span className="text-sm font-black uppercase tracking-tight text-slate-700 min-w-[70px]">
                                                                {item.status === CadetStatus.YET_TO_REPORT ? 'YTR' : item.status}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-6">
                                                        <div className="flex items-center gap-3 text-slate-600 mb-1">
                                                            <Calendar size={14} className="text-slate-400" />
                                                            <span className="text-sm font-mono font-bold">{new Date(item.r.date).toLocaleDateString()}</span>
                                                        </div>
                                                        <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest">{item.r.paradeType}</p>
                                                    </td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                        </tbody>
                    </table>

                    {/* Mobile View - Hardened Cards */}
                    <div className="md:hidden divide-y divide-slate-100 bg-slate-50/50">
                        {filteredRecords.map((item, idx) => {
                            const cn = item.r.courseNumber;
                            const level = cn ? calculateCurrentLevel(cn, activeRC) : item.r.yearGroup;
                            return (
                                <div key={idx} className="p-5 space-y-4 hover:bg-blue-50/30 transition-colors">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h4 className="font-black text-slate-900 text-xs uppercase tracking-tight">{item.name}</h4>
                                            <p className="text-[9px] text-slate-500 font-mono font-black uppercase tracking-tighter mt-1">{item.squad} • LEVEL {level}</p>
                                        </div>
                                        <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
                                            <div className={`w-2 h-2 rounded-sm ${item.status === CadetStatus.ABSENT ? 'bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,0.3)]' :
                                                item.status === CadetStatus.SICK ? 'bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.3)]' :
                                                    'bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,0.3)]'
                                                }`} />
                                            <span className="text-[9px] font-black uppercase tracking-tighter">
                                                {item.status === CadetStatus.YET_TO_REPORT ? 'YTR' : item.status}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 bg-white/60 p-3 rounded border border-slate-200 shadow-[inset_0_1px_4px_rgba(0,0,0,0.02)]">
                                        <div>
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">LOCK TIMESTAMP</p>
                                            <div className="flex items-center gap-1.5 text-slate-600">
                                                <Calendar size={10} className="text-slate-400" />
                                                <span className="text-[10px] font-mono font-black">{new Date(item.r.date).toLocaleDateString()}</span>
                                            </div>
                                            <p className="text-[9px] text-blue-900 mt-1 font-black uppercase tracking-tighter italic">{item.r.paradeType}</p>
                                        </div>
                                        {cn && (
                                            <div>
                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">DESIGNATION</p>
                                                <span className="font-mono text-[9px] font-black text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                                    {formatRC(cn)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
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
        </div>
    );
};
