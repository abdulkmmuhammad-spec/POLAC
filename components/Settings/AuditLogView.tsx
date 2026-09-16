import React, { useState, useEffect } from 'react';
import { Search, Filter, Calendar, User, Shield, Info, ChevronDown, ChevronRight, Scale, Clock } from 'lucide-react';
import { dbService } from '../../services/dbService';
import { AuditEvent } from '../../types';
import { toast } from 'react-hot-toast';
import { AuditPayloadRenderer } from './AuditPayloadRenderer';

export const AuditLogView: React.FC = () => {
    const [logs, setLogs] = useState<AuditEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedLog, setExpandedLog] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const LIMIT = isMobile ? 10 : 15;

    const [filters, setFilters] = useState({
        actionType: '',
        actorName: '',
        startDate: '',
        endDate: ''
    });

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            const { data, count, error } = await dbService.getAuditLogs({
                actorName: filters.actorName,
                actionType: filters.actionType,
                startDate: filters.startDate,
                endDate: filters.endDate,
                page: currentPage,
                limit: LIMIT
            });
            if (error) throw error;
            setLogs(data);
            setTotalCount(count || 0);
        } catch (err) {
            console.error('Failed to fetch audit logs:', err);
            toast.error('Forensic data retrieval failed.');
        } finally {
            setIsLoading(false);
        }
    };

    // Reset page to 1 on filter/search changes
    useEffect(() => {
        if (currentPage !== 1) {
            setCurrentPage(1);
        } else {
            fetchLogs();
        }
    }, [filters, searchTerm]);

    // Fetch logs on page/limit transitions
    useEffect(() => {
        fetchLogs();
    }, [currentPage, LIMIT]);

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

    const getActionBorderColor = (type: string) => {
        switch (type) {
            case 'CADET_MODIFIED': return 'border-amber-500';
            case 'CADET_ADDED': return 'border-emerald-500';
            case 'CADET_REMOVED': return 'border-rose-500';
            case 'SETTINGS_CHANGED': return 'border-blue-600';
            case 'OFFICER_INVITED': return 'border-purple-500';
            default: return 'border-slate-500';
        }
    };

    const filteredLogs = logs.filter(log =>
        (log.actorName ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.targetId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        JSON.stringify(log.payload).toLowerCase().includes(searchTerm.toLowerCase())
    );

    const from = (currentPage - 1) * LIMIT;
    const to = from + LIMIT - 1;

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
            {isLoading ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Decrypting Forensic Ledger...</span>
                    </div>
                </div>
            ) : filteredLogs.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Info size={24} />
                        <span className="text-xs font-bold">No matching forensic records found in current segment.</span>
                    </div>
                </div>
            ) : (
                <>
                    {/* Desktop Ledger View */}
                    <div className="hidden md:block bg-white border border-blue-100 rounded-2xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-blue-50/40 border-b border-blue-100/60">
                                        <th className="p-4 text-[9px] font-black text-slate-800 uppercase tracking-widest">Timestamp</th>
                                        <th className="p-4 text-[9px] font-black text-slate-800 uppercase tracking-widest">Action</th>
                                        <th className="p-4 text-[9px] font-black text-slate-800 uppercase tracking-widest">Actor</th>
                                        <th className="p-4 text-[9px] font-black text-slate-800 uppercase tracking-widest">Target ID</th>
                                        <th className="p-4 text-[9px] font-black text-slate-800 uppercase tracking-widest text-right">Reference</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 italic">
                                    {filteredLogs.map((log) => (
                                        <React.Fragment key={log.id}>
                                            <tr
                                                className={`hover:bg-blue-50/20 transition-colors cursor-pointer group ${expandedLog === log.id ? 'bg-blue-50/40' : ''}`}
                                                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                                            >
                                                <td className="p-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-mono font-bold text-slate-800">
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
                                                        <div className="w-6 h-6 rounded bg-blue-50 text-blue-900 border border-blue-100 flex items-center justify-center">
                                                            <User size={12} className="text-blue-900/70" />
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-850 uppercase">{log.actorName}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4 font-mono text-[10px] text-slate-600">
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
                                                <tr className={`bg-slate-50 border-l-4 ${getActionBorderColor(log.actionType)} animate-in slide-in-from-top-1 duration-200`}>
                                                    <td colSpan={5} className="p-3 sm:p-6">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8">
                                                            <div className="space-y-4">
                                                                <h4 className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                                    <Scale size={12} className="text-blue-600" /> Forensic Analysis Narrative
                                                                </h4>
                                                                <AuditPayloadRenderer log={log} />
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
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Mobile Adaptive Card Ledger View */}
                    <div className="flex flex-col gap-4 md:hidden">
                        {filteredLogs.map((log) => (
                            <div key={log.id} className="space-y-2">
                                <div
                                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                                    className={`p-4 bg-slate-900/40 border border-slate-800/80 rounded-xl backdrop-blur-md flex flex-col gap-3 cursor-pointer transition-all hover:border-slate-600 ${
                                        expandedLog === log.id ? 'ring-1 ring-blue-500/50 border-blue-500/50' : ''
                                    }`}
                                >
                                    {/* Card Top Bar */}
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <span className={`px-2 py-0.5 rounded text-[8px] sm:text-[9px] font-black border uppercase tracking-tight ${getActionColor(log.actionType)}`}>
                                            {log.actionType.replace(/_/g, ' ')}
                                        </span>
                                        <span className="text-[10px] text-slate-500 font-mono font-medium">
                                            {new Date(log.createdAt).toLocaleDateString('en-GB')} {new Date(log.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>

                                    {/* Card Body */}
                                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 font-mono">
                                        <div>
                                            <span className="text-slate-400 block text-[8px] uppercase font-black tracking-wider">Actor</span>
                                            <span className="font-bold text-slate-800 uppercase">{log.actorName || 'System'}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-400 block text-[8px] uppercase font-black tracking-wider">Target ID</span>
                                            <span className="font-bold text-slate-800">{log.targetId || 'N/A'}</span>
                                        </div>
                                    </div>

                                    {/* Card Action footer */}
                                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[9px] font-black uppercase tracking-wider text-slate-400 group-hover:text-blue-900 transition-colors">
                                        <span>Details</span>
                                        {expandedLog === log.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                    </div>
                                </div>

                                {/* Expanded mobile card details */}
                                {expandedLog === log.id && (
                                    <div className={`p-4 bg-slate-900/60 border-l-4 ${getActionBorderColor(log.actionType)} border border-slate-800/50 rounded-xl space-y-4 animate-in slide-in-from-top-1 duration-200`}>
                                        <div className="space-y-3">
                                            <h4 className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                <Scale size={12} className="text-blue-500" /> Forensic Analysis Narrative
                                            </h4>
                                            <AuditPayloadRenderer log={log} />
                                        </div>
                                        <div className="space-y-2 pt-2 border-t border-slate-800/60">
                                            <h4 className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                <Info size={12} className="text-blue-500" /> Meta Intelligence
                                            </h4>
                                            <div className="space-y-1.5 text-xs text-slate-400">
                                                <div className="flex justify-between border-b border-slate-800/50 pb-1">
                                                    <span className="font-bold text-slate-500">Event ID</span>
                                                    <span className="font-mono text-slate-300">{log.id.split('-')[0]}...</span>
                                                </div>
                                                <div className="flex justify-between border-b border-slate-800/50 pb-1">
                                                    <span className="font-bold text-slate-500">Actor Identity</span>
                                                    <span className="font-mono text-slate-300">{log.actorId ? `${log.actorId.split('-')[0]}...` : 'SYSTEM'}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="font-bold text-slate-500">Protocol</span>
                                                    <span className="font-bold text-slate-300">SECURE_DASHBOARD_V2</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Pagination Control Deck */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200 mt-4 px-1">
                        <span className="font-mono text-slate-500 font-bold text-[11px]">
                            Showing {totalCount > 0 ? from + 1 : 0} to {Math.min(to + 1, totalCount)} of {totalCount} administrative logs.
                        </span>
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1 || isLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-900/40 hover:bg-slate-800/50 text-slate-200 border border-slate-800 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-900/40"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(totalCount / LIMIT)))}
                                disabled={currentPage >= Math.ceil(totalCount / LIMIT) || isLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-900/40 hover:bg-slate-800/50 text-slate-200 border border-slate-800 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-900/40"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
