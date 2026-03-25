import React from 'react';
import { Users, CheckCircle, AlertCircle, Activity, Calendar, FileText, Zap } from 'lucide-react';
import { StatCard } from '../StatCard';
import { AttendanceBarChart } from '../Charts';
import { useParade } from '../../context/ParadeContext';
import { formatRC } from '../../utils/rcHelpers';
import { ParadeType } from '../../types';

export const DashboardOverview: React.FC = () => {
    const { records, stats, courseSummary, activeRC, selectedParadeType, setSelectedParadeType } = useParade();

    const chartData = [
        { name: 'Present', value: Math.round(stats.totalCadets * (stats.presentToday / 100)), color: '#3b82f6' },
        { name: 'Absent', value: stats.absentThisWeek, color: '#f59e0b' },
        { name: 'Sick', value: stats.sickCadets, color: '#f43f5e' },
        { name: 'Detention', value: records.reduce((sum, r) => sum + r.detentionCount, 0), color: '#6366f1' },
    ];


    const paradeTypes = [
        { id: ParadeType.MUSTER, label: 'MUSTER', icon: '☀️' },
        { id: ParadeType.SPECIAL, label: 'SPECIAL', icon: '⚡' },
        { id: ParadeType.TATTOO, label: 'TATTOO', icon: '🌙' },
    ];

    return (
        <div className="space-y-6 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
                <StatCard label="total strength" value={stats.totalCadets} icon={<Users />} color="blue" />
                <StatCard label="present today" value={`${stats.presentToday}%`} icon={<CheckCircle />} color="green" />
                <StatCard label="weekly absence" value={stats.absentThisWeek} icon={<AlertCircle />} color="orange" />
                <StatCard label="cadets in sickbay" value={stats.sickCadets} icon={<Activity />} color="red" />
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-5 border-b bg-slate-50/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-blue-900 flex items-center justify-center text-white shadow-sm border border-blue-950">
                            <Zap size={18} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-blue-900 uppercase tracking-[0.2em] mb-0.5">Tactical Summary</p>
                            <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm">
                                {selectedParadeType} FORMATION STATE
                            </h3>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-200/50 p-1 rounded-md border border-slate-200">
                        {paradeTypes.map((type) => (
                            <button
                                key={type.id}
                                onClick={() => setSelectedParadeType(type.id)}
                                className={`flex items-center gap-2 px-5 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all ${selectedParadeType === type.id
                                    ? 'bg-blue-900 text-white shadow-md'
                                    : 'text-slate-500 hover:text-slate-800'
                                    }`}
                            >
                                {type.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    {/* Desktop Table View */}
                    <table className="w-full text-sm text-left hidden md:table">
                        <thead className="bg-blue-900 text-white">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">REGULAR COURSE</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-center">LEVEL</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">PRESENT</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">ABSENT</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">SICK</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">DETENTION</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">TOTAL</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {courseSummary.map(c => (
                                <tr key={c.courseNumber} className="hover:bg-slate-50 border-l-[3px] border-l-transparent hover:border-l-blue-900 transition-all font-mono">
                                    <td className="px-6 py-4 font-black">
                                        <span className="text-blue-900 tracking-tighter">
                                            {formatRC(c.courseNumber)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 font-bold text-center">YEAR {c.currentLevel}</td>
                                    <td className="px-6 py-4 text-emerald-600 font-black text-right">{c.present}</td>
                                    <td className="px-6 py-4 text-rose-600 font-black text-right">{c.absent}</td>
                                    <td className="px-6 py-4 text-amber-600 font-black text-right">{c.sick}</td>
                                    <td className="px-6 py-4 text-indigo-600 font-black text-right">{c.detention}</td>
                                    <td className="px-6 py-4 font-black text-slate-900 text-right bg-slate-50/30">{c.total}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Mobile List/Card View */}
                    <div className="md:hidden divide-y divide-slate-100">
                        {courseSummary.map((item: any, idx) => {
                            const rcLabel = formatRC(item.courseNumber);
                            const yearLabel = item.currentLevel;
                            return (
                                <div key={idx} className="p-4 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="bg-blue-900 text-white text-[10px] font-black px-2 py-0.5 rounded-sm uppercase tracking-tighter font-mono">
                                                {rcLabel}
                                            </span>
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">YEAR {yearLabel}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Strength</span>
                                            <span className="text-sm font-black text-slate-900 font-mono tracking-tighter">{item.total}</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-slate-50 p-2.5 rounded-sm border border-slate-200 flex items-center justify-between">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">PRES</span>
                                            <span className="text-xs font-black text-emerald-600 font-mono">{item.present}</span>
                                        </div>
                                        <div className="bg-slate-50 p-2.5 rounded-sm border border-slate-200 flex items-center justify-between">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">ABST</span>
                                            <span className="text-xs font-black text-rose-600 font-mono">{item.absent}</span>
                                        </div>
                                        <div className="bg-slate-50 p-2.5 rounded-sm border border-slate-200 flex items-center justify-between">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">SICK</span>
                                            <span className="text-xs font-black text-amber-600 font-mono">{item.sick}</span>
                                        </div>
                                        <div className="bg-slate-50 p-2.5 rounded-sm border border-slate-200 flex items-center justify-between">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">DETN</span>
                                            <span className="text-xs font-black text-indigo-600 font-mono">{item.detention}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <AttendanceBarChart
                    title="SYSTEM ANALYTIC TRENDS"
                    data={chartData}
                />
                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <p className="text-[9px] font-black text-blue-900 uppercase tracking-[0.2em] mb-1">Queue Traffic</p>
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Recent Ingress logs</h3>
                        </div>
                        <Calendar size={16} className="text-slate-300" />
                    </div>
                    <div className="space-y-3">
                        {records.slice(0, 5).map(r => (
                            <div key={r.id} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-md border border-slate-200 group hover:border-blue-300 transition-all font-mono">
                                <div className="flex items-center space-x-4 min-w-0">
                                    <div className="w-9 h-9 shrink-0 rounded bg-white border border-slate-200 flex items-center justify-center text-slate-400 shadow-sm group-hover:bg-blue-900 group-hover:text-white transition-colors">
                                        <FileText size={16} />
                                    </div>
                                    <div className="truncate">
                                        <p className="font-black text-slate-900 text-[11px] uppercase tracking-tighter truncate">{r.officerName}</p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                                            {r.courseNumber ? formatRC(r.courseNumber) : r.courseName} <span className="mx-1 opacity-30">|</span> {r.paradeType}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[11px] font-black text-blue-900 uppercase tracking-tighter">{r.presentCount} / {r.grandTotal}</p>
                                    <p className="text-[8px] font-black text-slate-400 uppercase">{new Date(r.date).toLocaleDateString()}</p>
                                </div>
                            </div>
                        ))}
                        {records.length === 0 && (
                            <div className="text-center py-12 border border-dashed border-slate-200 rounded-md">
                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No Active Records in Buffer</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
