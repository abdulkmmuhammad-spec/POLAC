import React, { useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';
import { useParade } from '../../context/ParadeContext';

interface HistoricalTrendsProps {
    showChart?: boolean;
}

export const HistoricalTrends: React.FC<HistoricalTrendsProps> = ({ showChart = true }) => {
    const { records, selectedParadeType } = useParade();

    const trendData = useMemo(() => {
        // Group by date and calculate average attendance %
        const dailyStats: Record<string, { date: string, percentage: number, total: number, present: number }> = {};

        // Filter by the currently selected dashboard Parade Type before processing
        const filteredRecords = records.filter(r => r.paradeType === selectedParadeType);

        // Process last 14 unique dates
        const sortedRecords = [...filteredRecords].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        sortedRecords.forEach(record => {
            if (!dailyStats[record.date]) {
                dailyStats[record.date] = { date: record.date, percentage: 0, total: 0, present: 0 };
            }
            dailyStats[record.date].total += record.grandTotal;
            dailyStats[record.date].present += record.presentCount;
        });

        return Object.values(dailyStats).map(day => ({
            date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            attendance: day.total > 0 ? Math.round((day.present / day.total) * 100) : 0,
            present: day.present,
            total: day.total
        })).slice(-14);
    }, [records, selectedParadeType]);

    return (
        <div className="space-y-6">
            {showChart && (
                <div className="bg-white p-8 md:p-10 rounded-lg shadow-sm border border-slate-200">
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 md:mb-10 gap-6">
                        <div>
                            <h3 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-widest leading-tight">Attendance Velocity</h3>
                            <p className="text-sm text-slate-400 font-bold uppercase tracking-wider mt-1">14-day accountability trend analysis</p>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border border-slate-200 rounded-md">
                                <div className="w-2.5 h-2.5 bg-blue-900 rounded-sm shadow-[0_0_8px_rgba(30,58,138,0.3)]"></div>
                                <span className="text-sm font-black text-slate-600 uppercase tracking-widest">Daily Present %</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-[250px] md:h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trendData}>
                                <defs>
                                    <linearGradient id="colorAttend" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 13, fontWeight: 900, textAnchor: 'middle' }}
                                    dy={15}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 13, fontWeight: 900 }}
                                    domain={[0, 100]}
                                    tickFormatter={(value) => `${value}%`}
                                />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                        padding: '12px',
                                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                        backdropFilter: 'blur(4px)'
                                    }}
                                    itemStyle={{ fontSize: '10px', fontWeight: '900', color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="attendance"
                                    stroke="#1e3a8a"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorAttend)"
                                    animationDuration={1500}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            <div className={`grid grid-cols-1 ${showChart ? 'md:grid-cols-2' : ''} gap-6`}>
                <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200">
                    <h4 className="text-sm font-black text-slate-800 mb-6 uppercase tracking-[0.2em]">Volume Statistics</h4>
                    <div className="space-y-4">
                        {trendData.slice(-3).reverse().map((day, i) => (
                            <div key={i} className="flex items-center justify-between p-5 bg-slate-50 border border-slate-100 rounded-md group hover:bg-slate-100 transition-colors">
                                <div>
                                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">{day.date}</p>
                                    <p className="text-base font-black text-slate-800 uppercase">{day.present} / {day.total} Cadets</p>
                                </div>
                                <div className={`px-3 py-1.5 rounded text-sm font-black ${day.attendance > 90 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                                    {day.attendance}%
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {showChart && (
                    <div className="bg-blue-900 p-8 md:p-10 rounded-lg shadow-lg text-white relative overflow-hidden flex flex-col justify-center border border-blue-800">
                        <div className="relative z-10">
                            <h4 className="text-blue-400 font-black uppercase tracking-[0.3em] text-[11px] mb-3">Trend Intelligence</h4>
                            {trendData.length >= 2 ? (
                                <p className="text-xl md:text-2xl font-black leading-tight uppercase tracking-tight">
                                    ATTENDANCE VELOCITY HAS {trendData[trendData.length - 1].attendance >= trendData[trendData.length - 2].attendance ? 'ACCELERATED' : 'DECLINED'} BY
                                    <span className="text-blue-400 mx-2">
                                        {Math.abs(trendData[trendData.length - 1].attendance - trendData[trendData.length - 2].attendance)}%
                                    </span>
                                    SINCE PREVIOUS REPORTING CYCLE.
                                </p>
                            ) : (
                                <p className="text-xl md:text-2xl font-black leading-tight uppercase tracking-tight opacity-50">
                                    Insufficient trend data for longitudinal analysis.
                                </p>
                            )}
                            <button className="mt-10 bg-white/10 hover:bg-white/20 px-8 py-3 rounded-md text-sm font-black uppercase tracking-widest transition-all border border-white/20 backdrop-blur-sm self-start">
                                GENERATE DETAIL TRACE
                            </button>
                        </div>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rotate-45 translate-x-16 -translate-y-16 border border-blue-400/20"></div>
                        <div className="absolute bottom-4 right-4 text-blue-800/20 font-black text-7xl select-none pointer-events-none">TRD</div>
                    </div>
                )}
            </div>
        </div>
    );
};
