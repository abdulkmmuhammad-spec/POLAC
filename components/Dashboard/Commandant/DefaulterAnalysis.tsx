import React, { useState, useMemo } from 'react';
import { AlertCircle, Calendar } from 'lucide-react';
import { useParade } from '../../../context/ParadeContext';
import { CadetStatus } from '../../../types';
import { formatRC, calculateCurrentLevel } from '../../../utils/rcHelpers';

export const DefaulterAnalysis: React.FC = () => {
    const { records, activeRC } = useParade();
    const [defaulterPeriod, setDefaulterPeriod] = useState<'week' | 'month' | 'all'>('all');
    const [absentCourseFilter, setAbsentCourseFilter] = useState<string>('all');

    // Get unique course numbers for the filter dropdown
    const availableCourses = useMemo(() => {
        const numbers = new Set<number>();
        records.forEach(r => {
            if (r.courseNumber) numbers.add(r.courseNumber);
        });
        return Array.from(numbers).sort((a, b) => b - a);
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
            <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                    <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                        <AlertCircle size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Defaulter Analysis</h3>
                        <p className="text-sm text-slate-500">Real-time attendance tracking</p>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                    <select
                        className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold w-full sm:w-auto"
                        value={absentCourseFilter}
                        onChange={(e) => setAbsentCourseFilter(e.target.value)}
                    >
                        <option value="all">Module: All Regular Courses</option>
                        {availableCourses.map(cn => (
                            <option key={cn} value={cn}>{formatRC(cn)}</option>
                        ))}
                    </select>
                    <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto no-scrollbar">
                        {(['week', 'month', 'all'] as const).map((p) => (
                            <button
                                key={p}
                                onClick={() => setDefaulterPeriod(p)}
                                className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all whitespace-nowrap ${defaulterPeriod === p ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {p === 'all' ? 'All Time' : `This ${p}`}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    {/* Desktop Table View */}
                    <table className="w-full text-left hidden md:table">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Cadet Name</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Squad</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">Regular Course</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">Year</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">Absences</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Last Absence</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {mostAbsentCadets.map((cadet, idx) => {
                                const cn = cadet.courseNumber;
                                const level = cn ? calculateCurrentLevel(cn, activeRC) : cadet.yearGroup;
                                return (
                                    <tr key={idx} className="hover:bg-slate-50 transition-all group">
                                        <td className="px-8 py-5">
                                            <div className="flex items-center space-x-3">
                                                <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xs">
                                                    {idx + 1}
                                                </div>
                                                <span className="font-bold text-slate-800">{cadet.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 text-slate-600 font-medium">{cadet.squad}</td>
                                        <td className="px-8 py-5 text-center">
                                            {cn ? (
                                                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-3 py-1 rounded-full">
                                                    {formatRC(cn)}
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 italic text-xs">Legacy</span>
                                            )}
                                        </td>
                                        <td className="px-8 py-5 text-center text-slate-600 font-bold text-sm">Year {level}</td>
                                        <td className="px-8 py-5 text-center">
                                            <span className="px-3 py-1 bg-rose-100 text-rose-700 font-black rounded-lg text-sm">
                                                {cadet.absences}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            <div className="flex items-center justify-end space-x-2 text-slate-400 text-sm">
                                                <Calendar size={14} />
                                                <span>{new Date(cadet.lastAbsence).toLocaleDateString()}</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Mobile Card View */}
                    <div className="md:hidden divide-y divide-slate-100">
                        {mostAbsentCadets.map((cadet, idx) => {
                            const cn = cadet.courseNumber;
                            const level = cn ? calculateCurrentLevel(cn, activeRC) : cadet.yearGroup;
                            return (
                                <div key={idx} className="p-4 space-y-4 hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-7 h-7 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-black text-[10px] border border-rose-100">
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 text-sm">{cadet.name}</h4>
                                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-tight">{cadet.squad} • Year {level}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Absences</p>
                                            <span className="bg-rose-100 text-rose-700 text-xs font-black px-2 py-1 rounded-lg">
                                                {cadet.absences}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <Calendar size={12} />
                                            <span className="text-[10px] font-bold">Last: {new Date(cadet.lastAbsence).toLocaleDateString()}</span>
                                        </div>
                                        {cn && (
                                            <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-100">
                                                {formatRC(cn)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
