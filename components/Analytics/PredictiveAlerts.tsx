import React, { useMemo } from 'react';
import { AlertTriangle, TrendingUp, Info, CheckCircle } from 'lucide-react';
import { useParade } from '../../context/ParadeContext';

export const PredictiveAlerts: React.FC = () => {
    const { records } = useParade();

    const alerts = useMemo(() => {
        const findings: { type: 'warning' | 'info' | 'success', title: string, message: string, icon: any }[] = [];

        // Sort records by date
        const sorted = [...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        if (sorted.length < 3) return findings;

        // 1. Sickness Trend
        const recentSick = sorted.slice(0, 3).reduce((sum, r) => sum + r.sickCount, 0) / 3;
        const previousSick = sorted.slice(3, 6).reduce((sum, r) => sum + r.sickCount, 0) / 3;

        if (recentSick > previousSick * 1.5 && recentSick > 5) {
            findings.push({
                type: 'warning',
                title: 'Rising Sickness Rate',
                message: `Average sick reports have increased by ${Math.round((recentSick / previousSick - 1) * 100)}% over the last 3 days. Recommend medical review.`,
                icon: AlertTriangle
            });
        }

        // 2. Attendance Stability
        const recentAttendance = sorted.slice(0, 5).every(r => (r.presentCount / r.grandTotal) > 0.95);
        if (recentAttendance) {
            findings.push({
                type: 'success',
                title: 'High Operational Readiness',
                message: 'Attendance has remained consistently above 95% for the past 5 reporting periods.',
                icon: CheckCircle
            });
        }

        // 3. Reporting Consistency
        const today = new Date().toISOString().split('T')[0];
        const reportedToday = sorted.some(r => r.date === today);
        if (!reportedToday) {
            findings.push({
                type: 'info',
                title: 'Pending Submissions',
                message: 'Reports for today are still pending from several courses. Real-time stats may be incomplete.',
                icon: Info
            });
        }

        return findings;
    }, [records]);

    return (
        <div className="bg-white p-4 md:p-8 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="text-lg md:text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <TrendingUp className="text-blue-600" />
                Command Insights & Alerts
            </h3>

            <div className="space-y-4">
                {alerts.length > 0 ? (
                    alerts.map((alert, i) => (
                        <div key={i} className={`p-6 rounded-2xl border flex items-start gap-4 transition-all hover:scale-[1.01] ${alert.type === 'warning' ? 'bg-rose-50 border-rose-100' :
                            alert.type === 'success' ? 'bg-emerald-50 border-emerald-100' :
                                'bg-blue-50 border-blue-100'
                            }`}>
                            <div className={`p-3 rounded-xl ${alert.type === 'warning' ? 'bg-rose-100 text-rose-600' :
                                alert.type === 'success' ? 'bg-emerald-100 text-emerald-600' :
                                    'bg-blue-100 text-blue-600'
                                }`}>
                                <alert.icon size={20} />
                            </div>
                            <div>
                                <h4 className={`font-bold ${alert.type === 'warning' ? 'text-rose-900' :
                                    alert.type === 'success' ? 'text-emerald-900' :
                                        'text-blue-900'
                                    }`}>{alert.title}</h4>
                                <p className={`text-sm mt-1 leading-relaxed ${alert.type === 'warning' ? 'text-rose-700' :
                                    alert.type === 'success' ? 'text-emerald-700' :
                                        'text-blue-700'
                                    }`}>{alert.message}</p>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-10">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                            <TrendingUp size={32} />
                        </div>
                        <p className="text-slate-400 italic">Analyzing data for trends. No major alerts at this time.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
