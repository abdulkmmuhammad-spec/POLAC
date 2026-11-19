import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/dbService';
import { ShieldAlert, AlertTriangle, CheckCircle, Search, Calendar } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const HistoricalAlertsView: React.FC = () => {
    const [alerts, setAlerts] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchAlerts();
    }, []);

    const fetchAlerts = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('cadet_alerts')
                .select('*')
                .order('updated_at', { ascending: false });

            if (error) throw error;
            setAlerts(data || []);
        } catch (error) {
            console.error('Failed to fetch historical alerts:', error);
            toast.error('Failed to load historical alerts ledger.');
        } finally {
            setIsLoading(false);
        }
    };

    const filteredAlerts = alerts.filter(a => 
        a.cadet_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        a.squad.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                        <ShieldAlert size={20} />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-slate-900">Historical Alerts</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Past cadet absence alerts and command directives
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={fetchAlerts}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
                >
                    Refresh
                </button>
            </div>
            
            <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center gap-4">
                <div className="flex bg-white items-center px-3.5 min-h-[44px] rounded-xl border border-slate-200 flex-1 focus-within:border-blue-600 transition-colors">
                    <Search size={16} className="text-slate-400 mr-2.5 shrink-0" />
                    <input
                        type="text"
                        placeholder="Search by cadet name or squad..."
                        className="w-full text-base sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none bg-transparent"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="min-h-[300px]">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center p-16 opacity-60">
                        <div className="w-8 h-8 border-4 border-blue-900 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : filteredAlerts.length === 0 ? (
                    <div className="text-center py-20">
                        <CheckCircle size={40} className="mx-auto text-emerald-500/40 mb-3" />
                        <p className="text-sm font-semibold text-slate-500">No alerts in history</p>
                    </div>
                ) : (
                    <>
                        {/* Mobile Stacked Cards (< 768px) */}
                        <div className="md:hidden p-3 space-y-3 bg-slate-50/50">
                            {filteredAlerts.map((alert) => (
                                <div
                                    key={alert.id}
                                    className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5 shadow-2xs"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-slate-900 truncate">
                                                {alert.cadet_name}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                Squad {alert.squad} • RC {alert.course_number}
                                            </p>
                                        </div>
                                        {alert.status === 'RESOLVED' ? (
                                            <span className="inline-flex items-center gap-1 text-emerald-700 text-[11px] font-semibold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full shrink-0">
                                                <CheckCircle size={12} /> Resolved
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-amber-700 text-[11px] font-semibold bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full shrink-0">
                                                <AlertTriangle size={12} /> Active
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span
                                            className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-full ${
                                                alert.alert_level === 'FLAGRANT'
                                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                            }`}
                                        >
                                            {alert.alert_level} ({alert.trigger_count} absences)
                                        </span>
                                        <span className="text-[11px] font-mono text-slate-400">
                                            {new Date(alert.updated_at || alert.created_at).toLocaleDateString()}
                                        </span>
                                    </div>

                                    {(alert.resolution_notes || alert.commandant_directive) && (
                                        <div className="pt-2 border-t border-slate-100 text-xs text-slate-600">
                                            {alert.resolution_notes ? (
                                                <>
                                                    <p className="italic">"{alert.resolution_notes}"</p>
                                                    {alert.acknowledged_by && (
                                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                                            Resolved by {alert.acknowledged_by}
                                                        </p>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-blue-800">
                                                    Directive: "{alert.commandant_directive}"
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Desktop Table (>= 768px) */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                            <tr>
                                <th className="px-5 py-3.5 text-xs font-semibold">Date & Time</th>
                                <th className="px-5 py-3.5 text-xs font-semibold">Cadet</th>
                                <th className="px-5 py-3.5 text-xs font-semibold">Alert Level</th>
                                <th className="px-5 py-3.5 text-xs font-semibold">Notes</th>
                                <th className="px-5 py-3.5 text-xs font-semibold">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredAlerts.map((alert) => (
                                <tr key={alert.id} className="hover:bg-slate-50/70 transition-colors">
                                    <td className="px-5 py-3.5 text-xs font-mono text-slate-500 whitespace-nowrap">
                                        {new Date(alert.updated_at || alert.created_at).toLocaleString()}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <p className="font-semibold text-slate-900 text-sm">{alert.cadet_name}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">Squad {alert.squad} • RC {alert.course_number}</p>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className={`px-2.5 py-1 text-[11px] font-semibold rounded-full ${
                                            alert.alert_level === 'FLAGRANT' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                                        }`}>
                                            {alert.alert_level} ({alert.trigger_count} absences)
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        {alert.resolution_notes ? (
                                            <div className="max-w-xs">
                                                <p className="text-xs text-slate-700 truncate" title={alert.resolution_notes}>"{alert.resolution_notes}"</p>
                                                <p className="text-[11px] text-slate-400 mt-0.5">Resolved by {alert.acknowledged_by}</p>
                                            </div>
                                        ) : alert.commandant_directive ? (
                                            <div className="max-w-xs">
                                                <p className="text-xs text-blue-800 truncate" title={alert.commandant_directive}>Directive: "{alert.commandant_directive}"</p>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">No notes</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        {alert.status === 'RESOLVED' ? (
                                            <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full w-fit">
                                                <CheckCircle size={12} /> Resolved
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-semibold bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full w-fit">
                                                <AlertTriangle size={12} /> Active
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
