import React, { useMemo } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import { useParade } from '../../../context/ParadeContext';
import { HistoricalTrends } from '../../Analytics/HistoricalTrends';
import { DefaulterAnalysis } from './DefaulterAnalysis';
import { Calendar, Activity, TrendingUp, TrendingDown, AlertTriangle, Users, ChevronDown, ChevronUp, Clock, BarChart3, Stethoscope, ShieldAlert, FileText, Download, CheckCircle } from 'lucide-react';
import { reportService } from '../../../services/reportService';

const SummaryCard = ({ title, value, subtext, icon: Icon, color, onClick, isExpanded, range }: any) => {
    return (
        <div
            onClick={onClick}
            className={`bg-white/80 backdrop-blur-md rounded-lg border p-8 shadow-sm cursor-pointer transition-all hover:shadow-md group relative overflow-hidden ${isExpanded
                ? 'bg-blue-50/50 border-blue-700 ring-1 ring-blue-700 shadow-blue-900/10'
                : 'border-slate-200 hover:border-blue-300'
                }`}
        >
            <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col">
                    <p className={`text-[13.5px] font-black uppercase tracking-[0.2em] ${isExpanded ? 'text-blue-900' : 'text-slate-500'}`}>
                        {title}
                    </p>
                    {range && <span className="text-[10px] font-mono text-blue-700 uppercase tracking-tighter mt-1">Range: {range}</span>}
                </div>
                <div className="flex items-center gap-3">
                    {isExpanded && (
                        <div className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border border-emerald-200 animate-in fade-in zoom-in-95">
                            <CheckCircle size={10} />
                            Active
                        </div>
                    )}
                    <div className={`p-2 rounded-md ${isExpanded ? 'bg-blue-900 text-white' : (color === 'rose' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600')}`}>
                        <Icon size={24} />
                    </div>
                </div>
            </div>

            <div className="flex items-baseline gap-4 mt-6">
                <h2 className={`text-4xl font-black font-mono tracking-tighter ${isExpanded ? 'text-blue-900' : 'text-blue-900'}`}>
                    {value}
                </h2>
                {subtext && <span className="text-base text-slate-500 font-bold uppercase tracking-tighter">{subtext}</span>}
            </div>

            <div className={`mt-6 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest transition-colors ${isExpanded ? 'text-blue-900' : 'text-blue-900/40 group-hover:text-blue-900'}`}>
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {isExpanded ? 'Hide Intel' : 'Show Detailed Analytics'}
            </div>

            <div className={`absolute top-0 right-0 w-24 h-24 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110 ${isExpanded ? 'bg-blue-200/20' : 'bg-blue-50/20'}`} />
        </div>
    );
};

const VolumeStatisticsCard = ({ counts }: any) => {
    return (
        <div className="bg-white/90 backdrop-blur-md rounded-lg border border-slate-200 p-8 shadow-xl animate-in fade-in slide-in-from-left-4 duration-500 relative overflow-hidden">
            <div className="flex flex-col mb-8 relative z-10">
                <span className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">
                    Weekly Volume Statistics
                </span>
                <span className="text-xs font-mono text-blue-700 uppercase tracking-widest mt-1">Institutional Baseline: Mon - Sun</span>
            </div>

            <div className="grid grid-cols-3 gap-10 relative z-10">
                <div className="border-l-4 border-rose-600 pl-6 group transition-all hover:pl-8">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Absences</p>
                    <h3 className="text-4xl font-black text-slate-900 font-mono tracking-tighter group-hover:text-rose-600 transition-colors">
                        {counts.absences || 'NIL'}
                    </h3>
                </div>

                <div className="border-l-4 border-amber-600 pl-6 group transition-all hover:pl-8">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Medical</p>
                    <h3 className="text-4xl font-black text-slate-900 font-mono tracking-tighter group-hover:text-amber-600 transition-colors">
                        {counts.medical || 'NIL'}
                    </h3>
                </div>

                <div className="border-l-4 border-indigo-600 pl-6 group transition-all hover:pl-8">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Detention</p>
                    <h3 className="text-4xl font-black text-slate-900 font-mono tracking-tighter group-hover:text-indigo-600 transition-colors">
                        {counts.detention || 'NIL'}
                    </h3>
                </div>
            </div>

            <div className="absolute -bottom-8 -right-8 opacity-[0.03] text-blue-900">
                <ShieldAlert size={120} />
            </div>
        </div>
    );
};

const RCComparisonChart = ({ data }: any) => {
    return (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200 h-[400px]">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-[0.2em]">RC Volume Distribution</h4>
                    <p className="text-[11px] text-slate-400 font-bold uppercase mt-1">Cross-course cadet accounting</p>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-blue-900 rounded-px" />
                        Absence Volume
                    </div>
                </div>
            </div>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 11, fontWeight: 900 }}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 11, fontWeight: 900 }}
                    />
                    <RechartsTooltip
                        contentStyle={{
                            backgroundColor: '#1e3a8a',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#fff'
                        }}
                        itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                        labelStyle={{ display: 'none' }}
                    />
                    <Bar dataKey="volume" radius={[4, 4, 0, 0]} barSize={40}>
                        {data.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.volume > 15 ? '#1e3a8a' : '#3b82f6'} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export const CommandAnalytics: React.FC = () => {
    const { records, selectedParadeType, activeRC } = useParade();
    const [expandedSection, setExpandedSection] = React.useState<string | null>(null);

    const handleBoxClick = (section: string, elementId: string) => {
        const isOpening = expandedSection !== section;
        setExpandedSection(isOpening ? section : null);

        if (isOpening && window.innerWidth < 768) {
            // Wait for render, then scroll
            setTimeout(() => {
                const element = document.getElementById(elementId);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
        }
    };

    // Calculate Core Three Intel (v2.1 refined)
    const intel = useMemo(() => {
        // Enforce Current Week Baseline (Mon-Sun)
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(now.setDate(diff));
        monday.setHours(0, 0, 0, 0);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        const currentWeekRecordsAll = records.filter(r => {
            const date = new Date(r.date);
            return date >= monday && date <= sunday;
        });

        // 1. Academy Snapshot (Weekly Aggregated - ALL 14 Parade Cycles)
        const weeklyExpected = currentWeekRecordsAll.reduce((acc, r) => acc + r.grandTotal, 0);
        const weeklyPresent = currentWeekRecordsAll.reduce((acc, r) => acc + r.presentCount, 0);
        const weeklyAbsences = currentWeekRecordsAll.reduce((acc, r) => acc + (r.grandTotal - r.presentCount), 0);
        const weeklyMedical = currentWeekRecordsAll.reduce((acc, r) => acc + r.sickCount, 0);
        const weeklyDetention = currentWeekRecordsAll.reduce((acc, r) => acc + r.detentionCount, 0);

        // 2. Hierarchical Course Intelligence (Weekly Performance)
        const courseMap: Record<number, {
            volume: number,
            expected: number,
            present: number,
            cadets: Record<string, { count: number, squad: string }>
        }> = {};

        currentWeekRecordsAll.forEach(r => {
            const rc = r.courseNumber;
            if (!courseMap[rc]) courseMap[rc] = { volume: 0, expected: 0, present: 0, cadets: {} };

            courseMap[rc].volume += (r.grandTotal - r.presentCount);
            courseMap[rc].expected += r.grandTotal;
            courseMap[rc].present += r.presentCount;

            r.cadets?.forEach(c => {
                if (c.status === 'absent') {
                    if (!courseMap[rc].cadets[c.name]) {
                        courseMap[rc].cadets[c.name] = { count: 0, squad: c.squad || 'N/A' };
                    }
                    courseMap[rc].cadets[c.name].count += 1;
                }
            });
        });

        const courseWiseData = Object.entries(courseMap).map(([rcStr, data]) => {
            const rc = parseInt(rcStr);
            const attendancePct = data.expected > 0 ? (data.present / data.expected) * 100 : 0;

            const topDefaulters = Object.entries(data.cadets)
                .filter(([_, info]) => info.count >= 3)
                .map(([name, info]) => ({
                    id: `RC${rc}-${name.substring(0, 3).toUpperCase()}`,
                    name,
                    squad: info.squad,
                    absences: info.count,
                    standing: info.count > 5 ? 'Critical' : 'Standard'
                }))
                .sort((a, b) => b.absences - a.absences)
                .slice(0, 10);

            return {
                rc,
                volume: data.volume,
                expected: data.expected,
                present: data.present,
                avgAttendance: attendancePct,
                standing: attendancePct >= 95 ? 'Exemplary' : attendancePct < 85 ? 'Critical' : 'Standard',
                topDefaulters
            };
        }).sort((a, b) => b.volume - a.volume);

        const formatDate = (date: Date) => {
            const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            const d = date.getDate();
            return `${months[date.getMonth()]} ${d}, ${date.getFullYear()}`;
        };

        const rangeLabelFull = `${formatDate(monday)} – ${formatDate(sunday)}`;
        let criticalRC = courseWiseData.length > 0 ? `RC ${courseWiseData[0].rc}` : 'N/A';

        // Filter currentWeekRecords by selectedParadeType for the dashboard visualization
        const dashboardRecords = currentWeekRecordsAll.filter(r => r.paradeType === selectedParadeType);

        // Dashboard Stats (Current Parade Type)
        const d_expected = dashboardRecords.reduce((acc, r) => acc + r.grandTotal, 0);
        const d_present = dashboardRecords.reduce((acc, r) => acc + r.presentCount, 0);
        const d_absences = dashboardRecords.reduce((acc, r) => acc + (r.grandTotal - r.presentCount), 0);
        const d_medical = dashboardRecords.reduce((acc, r) => acc + r.sickCount, 0);
        const d_detention = dashboardRecords.reduce((acc, r) => acc + r.detentionCount, 0);

        const rcComparisonData = courseWiseData.map(c => ({
            name: `RC ${c.rc}`,
            volume: c.volume
        }));

        return {
            strength: `${weeklyExpected > 0 ? Math.round((weeklyPresent / weeklyExpected) * 100) : 0}%`,
            counts: { absences: weeklyAbsences, medical: weeklyMedical, detention: weeklyDetention },
            weeklyAggregates: { absences: weeklyAbsences, medical: weeklyMedical, detention: weeklyDetention },
            criticalRC,
            courseWiseData,
            rcComparisonData,
            rangeLabelFull,
            rangeLabel: rangeLabelFull
        };
    }, [records]);

    const miniMapData = useMemo(() => {
        const dailyStats: Record<string, { date: string, percentage: number, total: number, present: number }> = {};
        const filteredRecords = records.filter(r => r.paradeType === selectedParadeType);

        filteredRecords.forEach(record => {
            if (!dailyStats[record.date]) {
                dailyStats[record.date] = { date: record.date, percentage: 0, total: 0, present: 0 };
            }
            dailyStats[record.date].total += record.grandTotal;
            dailyStats[record.date].present += record.presentCount;
        });

        return Object.values(dailyStats)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map(day => ({
                attendance: day.total > 0 ? Math.round((day.present / day.total) * 100) : 0,
            })).slice(-30);
    }, [records, selectedParadeType]);

    return (
        <div className="space-y-10 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Refined v2.1 Intelligence Panel */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-3 px-6 py-3 bg-blue-900/5 border border-blue-900/20 rounded-md self-start">
                    <Clock size={16} className="text-blue-900" />
                    <span className="text-[13.5px] font-black text-blue-900 uppercase tracking-widest">
                        TEMPORAL WINDOW: CURRENT_WEEK ({intel.rangeLabel})
                    </span>
                </div>

                <button
                    onClick={() => reportService.generateCommandantReport({
                        volumeStats: intel.weeklyAggregates,
                        activeRC: activeRC,
                        officerName: "COMMANDANT",
                        rangeLabel: intel.rangeLabelFull,
                        courseWiseData: intel.courseWiseData
                    })}
                    className="flex items-center gap-2 px-8 py-3 bg-blue-900 text-white rounded-md font-black uppercase text-xs tracking-widest hover:bg-blue-800 transition-all shadow-lg active:scale-95 group"
                >
                    <FileText size={18} className="group-hover:animate-pulse" />
                    Generate Weekly Command Report
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <SummaryCard
                    title="Strength Snapshot"
                    value={intel.strength}
                    icon={Users}
                    color="blue"
                    range="Current Week"
                    isExpanded={expandedSection === 'trends'}
                    onClick={() => handleBoxClick('trends', 'course-performance')}
                />
                <SummaryCard
                    title="Volume Statistics"
                    value={intel.counts.absences + intel.counts.medical + intel.counts.detention}
                    subtext="Total Issues"
                    icon={BarChart3}
                    color="rose"
                    range="Current Week"
                    isExpanded={expandedSection === 'volume'}
                    onClick={() => handleBoxClick('volume', 'snapshot-section')}
                />
                <SummaryCard
                    title="Critical RC Alert"
                    value={intel.criticalRC}
                    icon={ShieldAlert}
                    color="rose"
                    range="Current Week"
                    isExpanded={expandedSection === 'defaulters'}
                    onClick={() => handleBoxClick('defaulters', 'defaulter-registry')}
                />
            </div>

            {/* Volume Deep-Dive Section */}
            {expandedSection === 'volume' && (
                <div id="snapshot-section" className="space-y-8 animate-in zoom-in-95 fade-in duration-500">
                    <VolumeStatisticsCard counts={intel.counts} />
                    <RCComparisonChart data={intel.rcComparisonData} />
                </div>
            )}

            {/* Progressive Disclosure: Historical Trends */}
            {expandedSection === 'trends' && (
                <div id="course-performance" className="space-y-8 animate-in zoom-in-95 fade-in duration-500">
                    <div className="bg-blue-900 rounded-lg p-8 border border-blue-800 shadow-xl overflow-hidden relative">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 rounded-md bg-blue-800/50 border border-blue-700 flex items-center justify-center text-blue-400">
                                    <Activity size={32} />
                                </div>
                                <div>
                                    <p className="text-sm font-black text-blue-400 uppercase tracking-[0.3em] mb-1">Command Ingress</p>
                                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">30-Day Velocity Overview</h2>
                                </div>
                            </div>

                            <div className="w-full md:w-80 h-24">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={miniMapData}>
                                        <Area
                                            type="monotone"
                                            dataKey="attendance"
                                            stroke="#3b82f6"
                                            strokeWidth={3}
                                            fillOpacity={0.3}
                                            fill="#1e40af"
                                            animationDuration={2000}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="flex gap-6">
                                <div className="text-right">
                                    <p className="text-[11px] font-black text-blue-400 uppercase tracking-widest mb-1">Peak Status</p>
                                    <p className="text-3xl font-black text-white">{miniMapData.length > 0 ? Math.max(...miniMapData.map(d => d.attendance)) : 0}%</p>
                                </div>
                                <div className="w-px h-12 bg-blue-800" />
                                <div className="text-right">
                                    <p className="text-[11px] font-black text-blue-400 uppercase tracking-widest mb-1">Current</p>
                                    <p className="text-3xl font-black text-emerald-400">{miniMapData.length > 0 ? miniMapData[miniMapData.length - 1].attendance : 0}%</p>
                                </div>
                            </div>
                        </div>
                        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                            style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                    </div>
                    <HistoricalTrends />
                </div>
            )}

            {/* Progressive Disclosure: Defaulter Analysis */}
            {expandedSection === 'defaulters' && (
                <div id="defaulter-registry" className="pt-10 border-t border-slate-200 animate-in zoom-in-95 fade-in duration-500">
                    <div className="mb-10">
                        <div className="flex items-center gap-4 mb-2">
                            <Calendar className="text-blue-900" size={18} />
                            <p className="text-sm font-black text-blue-900 uppercase tracking-[0.2em] opacity-60">Analytical Deep-Dive</p>
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Cadet Accountability Trace</h3>
                        <p className="text-base text-slate-500 font-bold uppercase tracking-tighter mt-2">Cross-reference individual cadet attendance patterns and repeat defaulter analysis</p>
                    </div>
                    <DefaulterAnalysis />
                </div>
            )}
        </div>
    );
};
