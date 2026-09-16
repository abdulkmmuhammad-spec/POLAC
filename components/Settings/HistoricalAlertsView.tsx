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
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b bg-blue-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <ShieldAlert size={16} className="text-amber-400" />
                    <div>
                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em]">Historical Alerts Trace</h3>
                    </div>
                </div>
                <button onClick={fetchAlerts} className="text-[10px] uppercase font-bold tracking-widest text-blue-200 hover:text-white transition-colors">
                    Refresh Ledger
                </button>
            </div>
            
            <div className="p-4 border-b bg-slate-50 flex items-center gap-4">
                <div className="flex bg-white items-center px-4 py-2 rounded-md border border-slate-200 flex-1 shadow-inner focus-within:ring-2 focus-within:ring-blue-500">
                    <Search size={16} className="text-slate-400 mr-3" />
                    <input
                        type="text"
                        placeholder="SEARCH BY CADET NAME OR SQUADRON..."
                        className="w-full text-xs font-bold uppercase tracking-widest outline-none bg-transparent"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="overflow-x-auto min-h-[400px]">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center p-16 opacity-50">
                        <div className="w-8 h-8 border-4 border-blue-900 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : filteredAlerts.length === 0 ? (
                    <div className="text-center py-24">
                        <CheckCircle size={48} className="mx-auto text-emerald-500/30 mb-4" />
                        <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest italic">No Alerts in System Trace</p>
                    </div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 text-slate-600">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Date / Time</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Cadet Details</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Alert Level</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Resolution Notes</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                            {filteredAlerts.map((alert) => (
                                <tr key={alert.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 text-[10px] text-slate-500">
                                        {new Date(alert.updated_at || alert.created_at).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-slate-900">{alert.cadet_name.toUpperCase()}</p>
                                        <p className="text-[10px] text-slate-400 mt-1">SQUADRON: {alert.squad} | COURSE: {alert.course_number}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 text-[10px] font-black rounded-md ${
                                            alert.alert_level === 'FLAGRANT' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                                        }`}>
                                            {alert.alert_level} ({alert.trigger_count} ABSENCES)
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {alert.resolution_notes ? (
                                            <div className="max-w-xs">
                                                <p className="text-xs text-slate-700 truncate" title={alert.resolution_notes}>"{alert.resolution_notes}"</p>
                                                <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Resolved by {alert.acknowledged_by}</p>
                                            </div>
                                        ) : alert.commandant_directive ? (
                                            <div className="max-w-xs">
                                                <p className="text-xs text-blue-800 truncate" title={alert.commandant_directive}>Directive: "{alert.commandant_directive}"</p>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] text-slate-300 italic">No notes</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {alert.status === 'RESOLVED' ? (
                                            <span className="flex items-center gap-1 text-emerald-600 text-[10px] font-black bg-emerald-50 px-2 py-1 rounded w-fit">
                                                <CheckCircle size={10} /> RESOLVED
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-amber-600 text-[10px] font-black bg-amber-50 px-2 py-1 rounded w-fit">
                                                <AlertTriangle size={10} /> ACTIVE
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
