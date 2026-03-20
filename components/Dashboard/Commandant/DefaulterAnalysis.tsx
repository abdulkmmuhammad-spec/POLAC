import React, { useState, useMemo } from 'react';
import { AlertCircle, Calendar, ShieldAlert } from 'lucide-react';
import { useParade } from '../../../context/ParadeContext';
import { CadetStatus } from '../../../types';
import { formatRC, calculateCurrentLevel } from '../../../utils/rcHelpers';

export const DefaulterAnalysis: React.FC = () => {
    const { records, activeRC } = useParade();
    const [defaulterPeriod, setDefaulterPeriod] = useState<'week' | 'month' | 'all'>('week');
    const [absentCourseFilter, setAbsentCourseFilter] = useState<string>('all');

    // Get unique course numbers for the filter dropdown
    const availableCourses = useMemo(() => {
        const numbers = new Set<number>();
        records.forEach(r => {
            if (r.courseNumber) numbers.add(r.courseNumber);
        });
        return Array.from(numbers).sort((a, b) => b - a);
    }, [records]);

    // Calculate Heatmap Data for last 35 days (5 weeks)
    const heatmapData = useMemo(() => {
        const days = [];
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        // Go back 34 days to get total 35 days (7x5 grid)
        for (let i = 34; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            // Count total absences on this date
            let absenceCount = 0;
            records.forEach(r => {
                if (r.date === dateStr) {
                    absenceCount += r.absentCount;
                }
            });

            days.push({
                date: dateStr,
                count: absenceCount,
                dayName: date.toLocaleDateString('en-US', { weekday: 'narrow' }),
                fullDate: date.toLocaleDateString()
            });
        }
        return days;
    }, [records]);

    const mostAbsentCadets = useMemo(() => {
        const cadetStats: Record<string, {
            name: string;
            squad: string;
            absences: number;
            officer: string;
            yearGroup: number;
            courseNumber: number | null;
            lastAbsence: string
        }> = {};

        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

        records.forEach(record => {
            const recordDate = new Date(record.date);

            if (defaulterPeriod === 'week' && recordDate < weekAgo) return;
            if (defaulterPeriod === 'month' && recordDate < monthAgo) return;

            if (absentCourseFilter !== 'all' && record.courseNumber !== parseInt(absentCourseFilter)) return;

            record.cadets.forEach(cadet => {
                if (cadet.status === CadetStatus.ABSENT) {
                    const key = `${cadet.name}-${cadet.squad}`;
                    if (!cadetStats[key]) {
                        cadetStats[key] = {
                            name: cadet.name,
                            squad: cadet.squad,
                            absences: 0,
                            officer: record.officerName,
                            yearGroup: record.yearGroup,
                            courseNumber: record.courseNumber,
                            lastAbsence: record.date
                        };
                    }
                    cadetStats[key].absences += 1;
                    if (new Date(record.date) > new Date(cadetStats[key].lastAbsence)) {
                        cadetStats[key].lastAbsence = record.date;
                    }
                }
            });
        });

        return Object.values(cadetStats).sort((a, b) => b.absences - a.absences);
    }, [records, defaulterPeriod, absentCourseFilter]);

    return (
        <div className="space-y-6">
            <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center space-x-6">
                    <div className="p-4 bg-rose-900 text-white rounded-md shadow-[0_4px_10px_rgba(159,18,57,0.2)]">
                        <AlertCircle size={32} />
                    </div>
                    <div>
                        <h3 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-widest leading-tight">Defaulter Intelligence</h3>
                        <p className="text-sm text-slate-400 font-bold uppercase tracking-wider mt-1">Real-time absence density & ranking</p>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
                    <select
                        className="px-5 py-3 bg-slate-50 border border-slate-200 rounded-md text-sm font-black uppercase tracking-widest outline-none focus:ring-1 focus:ring-blue-900 appearance-none min-w-[200px]"
                        value={absentCourseFilter}
                        onChange={(e) => setAbsentCourseFilter(e.target.value)}
                    >
                        <option value="all">RC: ALL MODULES</option>
                        {availableCourses.map(cn => (
                            <option key={cn} value={cn}>{formatRC(cn)}</option>
                        ))}
                    </select>
                    <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200">
                        {(['week', 'month', 'all'] as const).map((p) => (
                            <button
                                key={p}
                                onClick={() => setDefaulterPeriod(p)}
                                className={`px-5 py-2.5 rounded text-sm font-black uppercase tracking-widest transition-all ${defaulterPeriod === p ? 'bg-white text-blue-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {p === 'all' ? 'All Time' : p}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {/* Ranking Section - Expanded for Clarity */}
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <ShieldAlert className="text-rose-600" size={24} />
                            <h4 className="text-xl font-black text-slate-800 uppercase tracking-widest">Chronic Defaulter Index</h4>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">{mostAbsentCadets.length} IDENTIFIED</span>
                            <div className="px-3 py-1 bg-rose-50 border border-rose-100 rounded text-[11px] font-black text-rose-600 uppercase">High Priority Trace</div>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-blue-900 text-white border-b border-blue-800">
                                <tr>
                                    <th className="px-8 py-5 text-sm font-black uppercase tracking-[0.2em]">Rank / Identification</th>
                                    <th className="px-8 py-5 text-sm font-black uppercase tracking-[0.2em] text-center">RC</th>
                                    <th className="px-8 py-5 text-sm font-black uppercase tracking-[0.2em] text-center">Absences</th>
                                    <th className="px-8 py-5 text-sm font-black uppercase tracking-[0.2em] text-right">Last Trace</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {mostAbsentCadets.slice(0, 15).map((cadet, idx) => {
                                    const cn = cadet.courseNumber;
                                    const level = cn ? calculateCurrentLevel(cn, activeRC) : cadet.yearGroup;
                                    return (
                                        <tr key={idx} className="even:bg-slate-50/50 hover:bg-rose-50/30 transition-colors group">
                                            <td className="px-8 py-6">
                                                <div className="flex items-center space-x-6">
                                                    <span className="text-base font-mono font-black text-slate-400 group-hover:text-rose-600 transition-colors">#{idx + 1}</span>
                                                    <div>
                                                        <p className="font-black text-slate-900 text-lg uppercase tracking-tight leading-none group-hover:translate-x-1 transition-transform">{cadet.name}</p>
                                                        <p className="text-[12px] text-slate-400 font-mono tracking-widest uppercase mt-2">{cadet.squad} • LEVEL {level} • {cadet.officer}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-center">
                                                {cn && (
                                                    <span className="font-mono text-sm font-black text-blue-900 bg-blue-50 px-4 py-1.5 rounded border border-blue-100">
                                                        {formatRC(cn)}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-8 py-6 text-center">
                                                <div className="flex items-center justify-center gap-3">
                                                    <span className={`w-3 h-3 rounded-full ${cadet.absences > 5 ? 'bg-rose-600 animate-pulse' : 'bg-amber-500'}`} />
                                                    <span className="text-xl font-black text-slate-900 font-mono">{cadet.absences}</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <div className="flex items-center justify-end gap-3 text-slate-400">
                                                    <Calendar size={18} />
                                                    <span className="text-base font-mono font-bold">{new Date(cadet.lastAbsence).toLocaleDateString()}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
