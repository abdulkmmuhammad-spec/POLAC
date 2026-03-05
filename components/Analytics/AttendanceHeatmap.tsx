import React, { useMemo } from 'react';
import { useParade } from '../../context/ParadeContext';

export const AttendanceHeatmap: React.FC = () => {
    const { records } = useParade();

    const calendarData = useMemo(() => {
        // Generate last 30 days
        const days = [];
        const now = new Date();
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];

            const dayRecords = records.filter(r => r.date === dateStr);
            let intensity = 0; // 0 to 4

            if (dayRecords.length > 0) {
                const total = dayRecords.reduce((sum, r) => sum + r.grandTotal, 0);
                const present = dayRecords.reduce((sum, r) => sum + r.presentCount, 0);
                const percentage = total > 0 ? (present / total) * 100 : 0;

                if (percentage >= 98) intensity = 4;
                else if (percentage >= 95) intensity = 3;
                else if (percentage >= 90) intensity = 2;
                else intensity = 1;
            }

            days.push({ date: dateStr, intensity, day: d.getDate(), month: d.toLocaleString('default', { month: 'short' }) });
        }
        return days;
    }, [records]);

    const intensityColors = [
        'bg-slate-100', // 0: No data
        'bg-rose-400',  // 1: < 90%
        'bg-amber-400', // 2: 90-95%
        'bg-blue-400',  // 3: 95-98%
        'bg-emerald-500' // 4: > 98%
    ];

    return (
        <div className="bg-white p-4 md:p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="mb-6 md:mb-8">
                <h3 className="text-lg md:text-xl font-bold text-slate-800">Operational Heatmap</h3>
                <p className="text-xs md:text-sm text-slate-500">Daily accountability levels for the last 30 days</p>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-2 md:gap-3">
                {calendarData.map((day, i) => (
                    <div key={i} className="group relative">
                        <div className={`aspect-square rounded-xl ${intensityColors[day.intensity]} transition-all duration-500 hover:scale-110 cursor-help shadow-sm`}>
                            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                {day.day}
                            </div>
                        </div>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-slate-800 text-white text-[10px] p-2 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-20">
                            <p className="font-bold">{day.month} {day.day}</p>
                            <p className="text-slate-400">Status: {day.intensity === 0 ? 'No Data' : day.intensity === 4 ? 'Optimal' : day.intensity === 1 ? 'Critical' : 'Nominal'}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-8 pt-8 border-t border-slate-50 flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Legend</span>
                </div>
                {[
                    { color: 'bg-rose-400', label: '< 90%' },
                    { color: 'bg-amber-400', label: '90-95%' },
                    { color: 'bg-blue-400', label: '95-98%' },
                    { color: 'bg-emerald-500', label: '> 98%' },
                ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-md ${item.color}`}></div>
                        <span className="text-xs font-bold text-slate-600">{item.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
