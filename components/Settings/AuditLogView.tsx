import React, { useState, useEffect } from 'react';
import { Search, Filter, Calendar, User, Shield, Info, ChevronDown, ChevronRight, Scale, Clock } from 'lucide-react';
import { dbService } from '../../services/dbService';
import { AuditEvent } from '../../types';
import { toast } from 'react-hot-toast';

export const AuditLogView: React.FC = () => {
    const [logs, setLogs] = useState<AuditEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedLog, setExpandedLog] = useState<string | null>(null);
    const [filters, setFilters] = useState({
        actionType: '',
        actorName: '',
        startDate: '',
        endDate: ''
    });

    useEffect(() => {
        fetchLogs();
    }, [filters]);

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await dbService.getAuditLogs({
                actorName: filters.actorName,
                actionType: filters.actionType,
                startDate: filters.startDate,
                endDate: filters.endDate
            });
            if (error) throw error;
            setLogs(data);
        } catch (err) {
            console.error('Failed to fetch audit logs:', err);
            toast.error('Forensic data retrieval failed.');
        } finally {
            setIsLoading(false);
        }
    };

    const getActionColor = (type: string) => {
        switch (type) {
            case 'CADET_MODIFIED': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'CADET_ADDED': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'CADET_REMOVED': return 'bg-rose-100 text-rose-700 border-rose-200';
            case 'SETTINGS_CHANGED': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'OFFICER_INVITED': return 'bg-purple-100 text-purple-700 border-purple-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    const filteredLogs = logs.filter(log =>
        (log.actorName ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.targetId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        JSON.stringify(log.payload).toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            {/* Forensic Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0f172a] p-6 rounded-2xl text-white shadow-xl overflow-hidden relative">
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-600 rounded-lg">
                            <Shield size={20} className="text-white" />
                        </div>
                        <h2 className="text-xl font-black uppercase tracking-tight">Institutional Audit Trail</h2>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest max-w-md">
                        Forensic-level tracking of all administrative modifications. Data is immutable and maintained for institutional security protocols.
                    </p>
                </div>
                <div className="flex items-center gap-3 relative z-10">
                    <div className="text-right hidden sm:block">
                        <p className="text-[9px] font-black text-slate-500 uppercase">Status</p>
                        <p className="text-[10px] font-black text-emerald-500 uppercase flex items-center gap-1 justify-end">
                            <Clock size={10} /> Active Monitoring
                        </p>
                    </div>
                </div>
                {/* Decorative Pattern */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            </div>

            {/* Tactical Control Bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="relative md:col-span-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-1 focus:ring-blue-900 outline-none"
                        placeholder="Search by Actor, Target ID, or Payload content..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div>
                    <select
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none cursor-pointer"
                        value={filters.actionType}
                        onChange={(e) => setFilters({ ...filters, actionType: e.target.value })}
                    >
                        <option value="">All Actions</option>
                        <option value="CADET_MODIFIED">Cadet Modified</option>
                        <option value="CADET_ADDED">Cadet Added</option>
                        <option value="CADET_REMOVED">Cadet Removed</option>
                        <option value="SETTINGS_CHANGED">Settings Changed</option>
                        <option value="OFFICER_INVITED">Officer Invited</option>
                    </select>
                </div>
                <button
                    onClick={() => setFilters({ actionType: '', actorName: '', startDate: '', endDate: '' })}
                    className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-blue-900 transition-colors"
                >
                    Reset Filters
                </button>
            </div>

            {/* Audit Ledger */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Timestamp</th>
                                <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                                <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Actor</th>
                                <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Target ID</th>
                                <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Reference</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 italic">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-8 h-8 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" />
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Decrypting Forensic Ledger...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center">
                                        <div className="flex flex-col items-center gap-2 text-slate-400">
                                            <Info size={24} />
                                            <span className="text-xs font-bold">No matching forensic records found in current segment.</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map((log) => (
                                    <React.Fragment key={log.id}>
                                        <tr
                                            className={`hover:bg-slate-50/80 transition-colors cursor-pointer group ${expandedLog === log.id ? 'bg-blue-50/30' : ''}`}
                                            onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                                        >
                                            <td className="p-4">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-mono font-bold text-slate-700">
                                                        {new Date(log.createdAt).toLocaleDateString('en-GB')}
                                                    </span>
                                                    <span className="text-[9px] font-mono text-slate-400 italic">
                                                        {new Date(log.createdAt).toLocaleTimeString('en-GB')}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-[9px] font-black border uppercase tracking-tight ${getActionColor(log.actionType)}`}>
                                                    {log.actionType.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center">
                                                        <User size={12} className="text-slate-500" />
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-800 uppercase">{log.actorName}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 font-mono text-[10px] text-slate-500">
                                                {log.targetId || 'N/A'}
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex items-center justify-end gap-2 text-slate-400 group-hover:text-blue-900 transition-colors">
                                                    <span className="text-[9px] font-black uppercase tracking-widest">Details</span>
                                                    {expandedLog === log.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedLog === log.id && (
                                            <tr className="bg-slate-50 border-l-4 border-blue-900 animate-in slide-in-from-top-1 duration-200">
                                                <td colSpan={5} className="p-6">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                        <div className="space-y-4">
                                                            <h4 className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                                <Scale size={12} className="text-blue-600" /> Forensic Diff Analysis
                                                            </h4>
                                                            <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3 shadow-inner">
                                                                {log.payload?.diff ? (
                                                                    log.payload.diff.map((d: any, i: number) => (
                                                                        <div key={i} className="flex items-center gap-2 text-[11px]">
                                                                            <span className="font-black text-slate-400 uppercase w-16">{d.field}:</span>
                                                                            <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded line-through decoration-rose-300 font-bold">{d.from}</span>
                                                                            <ChevronRight size={12} className="text-slate-300" />
                                                                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded font-bold">{d.to}</span>
                                                                        </div>
                                                                    ))
                                                                ) : (
                                                                    <pre className="text-[10px] font-mono whitespace-pre-wrap text-slate-600">
                                                                        {JSON.stringify(log.payload, null, 2)}
                                                                    </pre>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="space-y-4">
                                                            <h4 className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                                <Info size={12} className="text-blue-600" /> Meta Intelligence
                                                            </h4>
                                                            <div className="space-y-2">
                                                                <div className="flex justify-between text-xs border-b border-slate-200 pb-1">
                                                                    <span className="text-slate-400 font-bold">Event ID</span>
                                                                    <span className="font-mono text-slate-600 uppercase">{log.id.split('-')[0]}...</span>
                                                                </div>
                                                                <div className="flex justify-between text-xs border-b border-slate-200 pb-1">
                                                                    <span className="text-slate-400 font-bold">Actor Identity</span>
                                                                    <span className="text-slate-600 uppercase font-black">
                                                                        {log.actorId ? `${log.actorId.split('-')[0]}...` : 'SYSTEM'}
                                                                    </span>
                                                                </div>
                                                                <div className="flex justify-between text-xs border-b border-slate-200 pb-1">
                                                                    <span className="text-slate-400 font-bold">Protocol</span>
                                                                    <span className="text-slate-600 uppercase font-bold">SECURE_DASHBOARD_V2</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
