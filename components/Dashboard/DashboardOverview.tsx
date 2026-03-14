import React from 'react';
import { Users, CheckCircle, AlertCircle, Activity, Calendar, FileText, Zap } from 'lucide-react';
import { StatCard } from '../StatCard';
import { AttendanceBarChart } from '../Charts';
import { useParade } from '../../context/ParadeContext';
import { formatRC } from '../../utils/rcHelpers';
import { ParadeType } from '../../types';

export const DashboardOverview: React.FC = () => {
    const { records, stats, courseSummary, yearSummary, activeRC, selectedParadeType, setSelectedParadeType } = useParade();

    const chartData = [
        { name: 'Present', value: Math.round(stats.totalCadets * (stats.presentToday / 100)), color: '#10b981' },
        { name: 'Absent', value: stats.absentThisWeek, color: '#f59e0b' },
        { name: 'Sick', value: stats.sickCadets, color: '#f43f5e' },
        { name: 'Detention', value: records.reduce((sum, r) => sum + r.detentionCount, 0), color: '#6366f1' },
    ];

    // Prefer course-based summary (new records), fall back to year-based (old records)
    const useCourseView = courseSummary.length > 0;

    const paradeTypes = [
        { id: ParadeType.MUSTER, label: 'Muster', icon: '☀️' },
        { id: ParadeType.SPECIAL, label: 'Special', icon: '⚡' },
        { id: ParadeType.TATTOO, label: 'Tattoo', icon: '🌙' },
    ];

    return (
        <div className="space-y-6 md:space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <StatCard label="Active Strength" value={stats.totalCadets} icon={<Users />} color="blue" />
                <StatCard label="Present Today" value={`${stats.presentToday}%`} icon={<CheckCircle />} color="green" />
                <StatCard label="Weekly Absences" value={stats.absentThisWeek} icon={<AlertCircle />} color="orange" />
                <StatCard label="Hospitalized" value={stats.sickCadets} icon={<Activity />} color="red" />
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                            <Zap size={20} />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-800 tracking-tight">
                                Today's {selectedParadeType.charAt(0).toUpperCase() + selectedParadeType.slice(1)} Summary
                            </h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Regular Course Statistics</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                        {paradeTypes.map((type) => (
                            <button
                                key={type.id}
                                onClick={() => setSelectedParadeType(type.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${selectedParadeType === type.id
                                    ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200'
                                    : 'text-slate-500 hover:text-slate-800'
                                    }`}
                            >
                                <span>{type.icon}</span>
                                {type.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    {/* Desktop Table View */}
                    <table className="w-full text-sm text-left hidden md:table">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="px-6 py-3 font-semibold text-slate-600">Regular Course</th>
                                <th className="px-6 py-3 font-semibold text-slate-600">Year Level</th>
                                <th className="px-6 py-3 font-semibold text-emerald-600">Present</th>
                                <th className="px-6 py-3 font-semibold text-rose-600">Absent</th>
                                <th className="px-6 py-3 font-semibold text-amber-600">Sick</th>
                                <th className="px-6 py-3 font-semibold text-indigo-600">Detention</th>
                                <th className="px-6 py-3 font-semibold text-slate-600">Total Strength</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {useCourseView ? (
                                courseSummary.map(c => (
                                    <tr key={c.courseNumber} className="hover:bg-slate-50">
                                        <td className="px-6 py-3 font-bold">
                                            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">
                                                {formatRC(c.courseNumber)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-slate-600 font-medium">Year {c.currentLevel}</td>
                                        <td className="px-6 py-3 text-emerald-700 font-medium">{c.present}</td>
                                        <td className="px-6 py-3 text-rose-700 font-medium">{c.absent}</td>
                                        <td className="px-6 py-3 text-amber-700 font-medium">{c.sick}</td>
                                        <td className="px-6 py-3 text-indigo-700 font-medium">{c.detention}</td>
                                        <td className="px-6 py-3 font-bold">{c.total}</td>
                                    </tr>
                                ))
                            ) : (
                                yearSummary.map(y => (
                                    <tr key={y.year} className="hover:bg-slate-50">
                                        <td className="px-6 py-3 font-bold text-blue-600 font-medium">
                                            {formatRC(activeRC - (y.year - 1))}
                                        </td>
                                        <td className="px-6 py-3 text-slate-600 font-medium">Year {y.year}</td>
                                        <td className="px-6 py-3 text-emerald-700 font-medium">{y.present}</td>
                                        <td className="px-6 py-3 text-rose-700 font-medium">{y.absent}</td>
                                        <td className="px-6 py-3 text-amber-700 font-medium">{y.sick}</td>
                                        <td className="px-6 py-3 text-indigo-700 font-medium">{y.detention}</td>
                                        <td className="px-6 py-3 font-bold">{y.total}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>

                    {/* Mobile List/Card View */}
                    <div className="md:hidden divide-y divide-slate-100">
                        {(useCourseView ? courseSummary : yearSummary).map((item: any, idx) => {
                            const rcLabel = useCourseView ? formatRC(item.courseNumber) : formatRC(activeRC - (item.year - 1));
                            const yearLabel = useCourseView ? item.currentLevel : item.year;
                            return (
                                <div key={idx} className="p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md">
                                                {rcLabel}
                                            </span>
                                            <span className="text-xs font-bold text-slate-600">Year {yearLabel}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Strength</span>
                                            <span className="text-sm font-black text-slate-800">{item.total}</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 shadow-sm">
                                            <span className="text-[10px] font-black text-slate-400 uppercase">Present</span>
                                            <span className="text-sm font-black text-emerald-600">{item.present}</span>
                                        </div>
                                        <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 shadow-sm">
                                            <span className="text-[10px] font-black text-slate-400 uppercase">Absent</span>
                                            <span className="text-sm font-black text-rose-600">{item.absent}</span>
                                        </div>
                                        <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 shadow-sm">
                                            <span className="text-[10px] font-black text-slate-400 uppercase">Sick</span>
                                            <span className="text-sm font-black text-amber-600">{item.sick}</span>
                                        </div>
                                        <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 shadow-sm">
                                            <span className="text-[10px] font-black text-slate-400 uppercase">Detention</span>
                                            <span className="text-sm font-black text-indigo-600">{item.detention}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AttendanceBarChart
                    title="Current Attendance Metrics"
                    data={chartData}
                />
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-slate-800">Recent Submissions</h3>
                    </div>
                    <div className="space-y-4">
                        {records.slice(0, 5).map(r => (
                            <div key={r.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 group hover:border-blue-200 transition-all">
                                <div className="flex items-center space-x-4">
                                    <div className="w-10 h-10 rounded-lg bg-white border flex items-center justify-center text-slate-500 shadow-sm">
                                        <FileText size={20} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-800 text-sm">{r.officerName}</p>
                                        <p className="text-xs text-slate-500">
                                            {r.courseNumber ? formatRC(r.courseNumber) : r.courseName} • {r.paradeType}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-bold text-emerald-600">{r.presentCount} / {r.grandTotal}</p>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-tighter">{new Date(r.date).toLocaleDateString()}</p>
                                </div>
                            </div>
                        ))}
                        {records.length === 0 && <p className="text-center py-10 text-slate-400 italic">No submissions yet.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};
