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
    const { records } = useParade();

    const trendData = useMemo(() => {
        // Group by date and calculate average attendance %
        const dailyStats: Record<string, { date: string, percentage: number, total: number, present: number }> = {};

        // Process last 14 unique dates
        const sortedRecords = [...records].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
    }, [records]);

    return (
        <div className="space-y-6">
            {showChart && (
                <div className="bg-white p-4 md:p-8 rounded-3xl shadow-sm border border-slate-100">
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 md:mb-8 gap-4">
                        <div>
                            <h3 className="text-lg md:text-xl font-bold text-slate-800">Attendance Velocity</h3>
                            <p className="text-xs md:text-sm text-slate-500">14-day accountability trend analysis</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                                <span className="text-xs font-bold text-slate-600 uppercase">Daily Present %</span>
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
                                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                                    domain={[0, 100]}
                                    tickFormatter={(value) => `${value}%`}
                                />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: '16px',
                                        border: 'none',
                                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                                        padding: '12px'
                                    }}
                                    itemStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="attendance"
                                    stroke="#2563eb"
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
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                    <h4 className="font-bold text-slate-800 mb-4">Volume Statistics</h4>
                    <div className="space-y-4">
                        {trendData.slice(-3).reverse().map((day, i) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{day.date}</p>
                                    <p className="text-sm font-bold text-slate-800">{day.present} / {day.total} Cadets</p>
                                </div>
                                <div className={`px-3 py-1 rounded-full text-xs font-black ${day.attendance > 90 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {day.attendance}%
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {showChart && (
                    <div className="bg-blue-600 p-6 md:p-8 rounded-3xl shadow-lg text-white relative overflow-hidden">
                        <div className="relative z-10">
                            <h4 className="text-blue-100 font-bold uppercase tracking-widest text-[10px] mb-2">Trend Insight</h4>
                            <p className="text-lg md:text-xl font-bold leading-tight">
                                Attendance has {trendData.length > 1 && trendData[trendData.length - 1].attendance >= trendData[trendData.length - 2].attendance ? 'increased' : 'decreased'} by
                                {Math.abs((trendData[trendData.length - 1]?.attendance || 0) - (trendData[trendData.length - 2]?.attendance || 0))}% since the last report.
                            </p>
                            <button className="mt-6 bg-white/20 hover:bg-white/30 px-6 py-2 rounded-xl text-sm font-bold transition-all backdrop-blur-sm">
                                View Deep Dive
                            </button>
                        </div>
                        <div className="absolute top-[-20%] right-[-10%] w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
                    </div>
                )}
            </div>
        </div>
    );
};
