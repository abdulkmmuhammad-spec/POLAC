import React, { useState } from 'react';
import { History, FileText, Eye } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useParade } from '../../../context/ParadeContext';
import { SubmissionPreviewModal } from './SubmissionPreviewModal';
import { ParadeRecord } from '../../../types';

export const SubmissionHistory: React.FC = () => {
const { currentUser } = useAuth();
    const {
        records,
        loadMoreRecords,
        hasMoreRecords,
        isDataLoading,
        currentPage,
        totalPages
    } = useParade();
    const [selectedRecord, setSelectedRecord] = useState<ParadeRecord | null>(null);

    const officerRecords = records.filter(r => r.officerId === currentUser?.id);

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 md:p-8 border-b flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <History size={24} className="text-blue-600" />
                        Submission History
                    </h3>
                    <div className="flex items-center gap-3">
                        <div className="px-3 py-1 bg-blue-50 border border-blue-100 rounded-xl">
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                                Page {currentPage} of {totalPages}
                            </span>
                        </div>
                        <p className="text-sm text-slate-400">{officerRecords.length} records shown</p>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    {/* Desktop Table View */}
                    <table className="w-full text-left hidden md:table">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Date</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Parade Type</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Present</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Absent</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Detention</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Pass</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Susp.</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">YTR</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Total</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase text-center w-24">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {officerRecords.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-8 py-5 font-bold text-slate-800">{new Date(r.date).toLocaleDateString()}</td>
                                    <td className="px-8 py-5">
                                        <span className="flex items-center gap-2 text-slate-600 font-medium">
                                            <FileText size={16} /> {r.paradeType}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-emerald-600 font-bold">{r.presentCount}</td>
                                    <td className="px-8 py-5 text-rose-600 font-bold">{r.absentCount}</td>
                                    <td className="px-8 py-5 text-indigo-600 font-bold">{r.detentionCount}</td>
                                    <td className="px-8 py-5 text-purple-600 font-bold">{r.passCount || 0}</td>
                                    <td className="px-8 py-5 text-slate-500 font-bold">{r.suspensionCount || 0}</td>
                                    <td className="px-8 py-5 text-cyan-600 font-bold">{r.yetToReportCount || 0}</td>
                                    <td className="px-8 py-5 font-bold">{r.grandTotal}</td>
                                    <td className="px-8 py-5 text-center">
                                        <button
                                            onClick={() => setSelectedRecord(r)}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                                            title="View Details"
                                        >
                                            <Eye size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {officerRecords.length === 0 && !isDataLoading && (
                                <tr>
                                    <td colSpan={10} className="px-8 py-20 text-center italic text-slate-400">
                                        You haven't submitted any parade states yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    {/* Mobile Card View */}
                    <div className="md:hidden divide-y divide-slate-100 border-t border-slate-100">
                        {officerRecords.map((r) => (
                            <div key={r.id} className="p-4 space-y-4 hover:bg-slate-50 transition-colors">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                                        <FileText size={16} className="text-blue-600" />
                                        <span>{r.paradeType}</span>
                                    </div>
                                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">{new Date(r.date).toLocaleDateString()}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <div className="flex justify-between items-center bg-white p-2 rounded-lg shadow-sm border border-slate-100">
                                        <span className="text-[10px] font-black uppercase text-slate-400">Present</span>
                                        <span className="text-sm font-bold text-emerald-600">{r.presentCount}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-white p-2 rounded-lg shadow-sm border border-slate-100">
                                        <span className="text-[10px] font-black uppercase text-slate-400">Absent</span>
                                        <span className="text-sm font-bold text-rose-600">{r.absentCount}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-white p-2 rounded-lg shadow-sm border border-slate-100">
                                        <span className="text-[10px] font-black uppercase text-slate-400">Detention</span>
                                        <span className="text-sm font-bold text-indigo-600">{r.detentionCount}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-white p-2 rounded-lg shadow-sm border border-slate-100">
                                        <span className="text-[10px] font-black uppercase text-slate-400">P/S/Y</span>
                                        <span className="text-xs font-bold text-slate-600 tracking-wider">
                                            {r.passCount || 0}/{r.suspensionCount || 0}/{r.yetToReportCount || 0}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between pt-1">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Grand Total</span>
                                    <span className="text-sm font-black text-slate-800">{r.grandTotal}</span>
                                </div>
                                <button
                                    onClick={() => setSelectedRecord(r)}
                                    className="w-full mt-2 py-3 bg-white border-2 border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:border-slate-300 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                                >
                                    <Eye size={16} /> Look at Details
                                </button>
                            </div>
                        ))}
                        {officerRecords.length === 0 && !isDataLoading && (
                            <div className="p-8 text-center italic text-slate-400 text-sm">
                                You haven't submitted any parade states yet.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {hasMoreRecords && (
                <div className="flex justify-center pt-4">
                    <button
                        onClick={loadMoreRecords}
                        disabled={isDataLoading}
                        className="flex items-center gap-2 px-8 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50 hover:border-blue-200 hover:text-blue-600 transition-all shadow-sm disabled:opacity-50"
                    >
                        {isDataLoading ? (
                            <span className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                Loading...
                            </span>
                        ) : (
                            'Load More Submissions if any'
                        )}
                    </button>
                </div>
            )}

            <SubmissionPreviewModal
                record={selectedRecord}
                onClose={() => setSelectedRecord(null)}
            />
        </div>
    );
};
