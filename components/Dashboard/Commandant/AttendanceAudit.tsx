import React, { useState, useMemo } from 'react';
import { Download, FileText, Calendar, RotateCcw } from 'lucide-react';
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
        totalPages
    } = useParade();
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [courseFilter, setCourseFilter] = useState<string>('all');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [isDefaultView, setIsDefaultView] = useState(true);

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

                if (statusFilter !== 'all' && item.status !== statusFilter) return false;
                if (courseFilter !== 'all' && item.r.courseNumber !== parseInt(courseFilter)) return false;

                return true;
            });
    }, [records, isDefaultView, dateRange, statusFilter, courseFilter, currentWeekRange]);

    const handleUpdateDetail = async (cadetDetailId: any, updates: any) => {
        try {
            await dbService.updateCadetDetail(cadetDetailId, updates);
            await refreshData();
        } catch (error) {
            console.error("Failed to update detail:", error);
        }
    };

    const handleReset = () => {
        setIsDefaultView(true);
        setDateRange({ start: '', end: '' });
        setStatusFilter('all');
        setCourseFilter('all');
    };

    const handleExport = () => {
        const data = filteredRecords.map(item => ({
            'Date': item.r.date,
            'Cadet Name': item.name,
            'Squad': item.squad,
            'Status': item.status,
            'Course': item.r.courseNumber ? formatRC(item.r.courseNumber) : 'Legacy',
            'Year Level': item.r.courseNumber ? calculateCurrentLevel(item.r.courseNumber, activeRC) : item.r.yearGroup,
            'Officer': item.r.officerName,
            'Reason': (item as any).reason_category || 'Uncategorized',
            'Notes': (item as any).commandant_notes || ''
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "AttendanceAudit");
        XLSX.writeFile(wb, `Attendance_Audit_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="space-y-6">
            {/* Control Panel */}
            <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-wrap items-center justify-between gap-4 md:gap-6">
                <div className="flex flex-wrap items-center gap-4 flex-1">
                    <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
                        <button
                            onClick={() => setIsDefaultView(true)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${isDefaultView ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            Current Week
                        </button>
                        <button
                            onClick={() => setIsDefaultView(false)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${!isDefaultView ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            Historical Audit
                        </button>
                    </div>

                    {!isDefaultView && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-xl shrink-0">
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                                Page {currentPage} of {totalPages}
                            </span>
                        </div>
                    )}

                    {!isDefaultView && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 shrink-0">
                            <input
                                type="date"
                                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
                                value={dateRange.start}
                                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            />
                            <span className="text-slate-400 font-bold text-[10px]">TO</span>
                            <input
                                type="date"
                                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
                                value={dateRange.end}
                                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            />
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <select
                            className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                            value={courseFilter}
                            onChange={(e) => setCourseFilter(e.target.value)}
                        >
                            <option value="all">Course: All</option>
                            {availableCourses.map(cn => (
                                <option key={cn} value={cn}>{formatRC(cn)}</option>
                            ))}
                        </select>

                        <select
                            className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="all">Status: All</option>
                            <option value="absent">Unexcused (Absent)</option>
                            <option value="sick">Medical (Sick)</option>
                            <option value="detention">Detention</option>
                        </select>

                        <button
                            onClick={handleReset}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Reset Filters"
                        >
                            <RotateCcw size={18} />
                        </button>
                    </div>

                    <div className="h-8 w-px bg-slate-200 mx-2 hidden sm:block" />

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExport}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all"
                        >
                            <Download size={14} />
                            Excel
                        </button>
                        <button
                            onClick={() => reportService.generateCommandReturn(records, "ATTENDANCE AUDIT REPORT")}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all font-bold"
                        >
                            <FileText size={14} />
                            PDF
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    {/* Desktop Table View */}
                    <table className="w-full text-left hidden md:table">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cadet & Squad</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Regular Course</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Year</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date / Type</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">P / S / Y</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Reason Category</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Commandant Notes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredRecords.map((item, idx) => {
                                const cn = item.r.courseNumber;
                                const level = cn ? calculateCurrentLevel(cn, activeRC) : item.r.yearGroup;
                                return (
                                    <tr key={idx} className="hover:bg-slate-50/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                                            <p className="text-[10px] text-slate-500 font-medium uppercase">{item.squad}</p>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {cn ? (
                                                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap">
                                                    {formatRC(cn)}
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 italic text-[10px]">Legacy</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-xs font-bold text-slate-600">Y{level}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <Calendar size={12} className="text-slate-400" />
                                                <span className="text-xs font-medium">{new Date(item.r.date).toLocaleDateString()}</span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 uppercase mt-1">{item.r.paradeType}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter ${item.status === CadetStatus.ABSENT ? 'bg-rose-100 text-rose-600 border border-rose-200' :
                                                item.status === CadetStatus.SICK ? 'bg-amber-100 text-amber-600 border border-amber-200' :
                                                    'bg-indigo-100 text-indigo-600 border border-indigo-200'
                                                }`}>
                                                {item.status === CadetStatus.YET_TO_REPORT ? 'YTR' : item.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <span className="text-[10px] font-bold text-purple-600" title="On Pass">{item.r.passCount || 0}</span>
                                                <span className="text-slate-300">/</span>
                                                <span className="text-[10px] font-bold text-slate-500" title="On Suspension">{item.r.suspensionCount || 0}</span>
                                                <span className="text-slate-300">/</span>
                                                <span className="text-[10px] font-bold text-cyan-600" title="Yet to Report">{item.r.yetToReportCount || 0}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <select
                                                className="bg-transparent border-0 text-[10px] font-bold text-slate-600 outline-none focus:ring-0 cursor-pointer hover:text-blue-600"
                                                defaultValue={(item as any).reason_category || 'UNCATEGORIZED'}
                                                onChange={(e) => handleUpdateDetail((item as any).id, { reason_category: e.target.value })}
                                            >
                                                <option value="UNCATEGORIZED">UNCATEGORIZED</option>
                                                <option value="MEDICAL (SICK BAY)">MEDICAL (SICK BAY)</option>
                                                <option value="EMERGENCY LEAVE">EMERGENCY LEAVE</option>
                                                <option value="UNAUTHORIZED ABSENCE">UNAUTHORIZED ABSENCE</option>
                                                <option value="OFFICIAL DUTY">OFFICIAL DUTY</option>
                                                <option value="ON PASS">ON PASS</option>
                                                <option value="ON SUSPENSION">ON SUSPENSION</option>
                                                <option value="YET TO REPORT">YET TO REPORT</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-4">
                                            <input
                                                placeholder="Add command follow-up..."
                                                className="bg-transparent border-0 text-[11px] text-slate-500 placeholder-slate-300 outline-none w-full focus:ring-0 focus:placeholder-slate-400/0"
                                                defaultValue={(item as any).commandant_notes || ''}
                                                onBlur={(e) => handleUpdateDetail((item as any).id, { commandant_notes: e.target.value })}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Mobile Card View */}
                    <div className="md:hidden divide-y divide-slate-100">
                        {filteredRecords.map((item, idx) => {
                            const cn = item.r.courseNumber;
                            const level = cn ? calculateCurrentLevel(cn, activeRC) : item.r.yearGroup;
                            return (
                                <div key={idx} className="p-4 space-y-4 hover:bg-slate-50/50 transition-colors">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-sm">{item.name}</h4>
                                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">{item.squad} • Year {level}</p>
                                        </div>
                                        <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter shadow-sm border ${item.status === CadetStatus.ABSENT ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                            item.status === CadetStatus.SICK ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                'bg-indigo-50 text-indigo-600 border-indigo-100'
                                            }`}>
                                            {item.status === CadetStatus.YET_TO_REPORT ? 'YTR' : item.status}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                                        <div>
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Date / Type</p>
                                            <div className="flex items-center gap-1.5 text-slate-600">
                                                <Calendar size={10} className="text-slate-400" />
                                                <span className="text-[10px] font-bold">{new Date(item.r.date).toLocaleDateString()}</span>
                                            </div>
                                            <p className="text-[9px] text-slate-500 mt-0.5 font-medium">{item.r.paradeType}</p>
                                        </div>
                                        {cn && (
                                            <div>
                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Course</p>
                                                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full inline-block">
                                                    {formatRC(cn)}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Reason Category</label>
                                            <select
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                                defaultValue={(item as any).reason_category || 'UNCATEGORIZED'}
                                                onChange={(e) => handleUpdateDetail((item as any).id, { reason_category: e.target.value })}
                                            >
                                                <option value="UNCATEGORIZED">UNCATEGORIZED</option>
                                                <option value="MEDICAL (SICK BAY)">MEDICAL (SICK BAY)</option>
                                                <option value="EMERGENCY LEAVE">EMERGENCY LEAVE</option>
                                                <option value="UNAUTHORIZED ABSENCE">UNAUTHORIZED ABSENCE</option>
                                                <option value="OFFICIAL DUTY">OFFICIAL DUTY</option>
                                                <option value="ON PASS">ON PASS</option>
                                                <option value="ON SUSPENSION">ON SUSPENSION</option>
                                                <option value="YET TO REPORT">YET TO REPORT</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Commandant Notes</label>
                                            <input
                                                placeholder="Add follow-up..."
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] text-slate-600 placeholder-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                                                defaultValue={(item as any).commandant_notes || ''}
                                                onBlur={(e) => handleUpdateDetail((item as any).id, { commandant_notes: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {filteredRecords.length === 0 && (
                        <div className="p-24 text-center flex flex-col items-center">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-4 border-2 border-dashed border-slate-100">
                                <FileText size={32} />
                            </div>
                            <p className="text-slate-400 font-medium italic text-sm">No recorded absences for this training cycle.</p>
                            <button
                                onClick={() => setIsDefaultView(false)}
                                className="mt-4 text-blue-600 text-[10px] font-black uppercase tracking-widest hover:underline"
                            >
                                Switch to Historical Audit Mode
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
                        className="flex items-center gap-2 px-8 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 hover:border-blue-200 hover:text-blue-600 transition-all shadow-sm disabled:opacity-50"
                    >
                        {isDataLoading ? (
                            <span className="flex items-center gap-2">
                                <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                Loading...
                            </span>
                        ) : (
                            'Load More Cadets if any'
                        )}
                    </button>
                </div>
            )}
        </div>
    );
};
