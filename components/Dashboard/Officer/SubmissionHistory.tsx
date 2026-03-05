import React from 'react';
import { History, FileText } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useParade } from '../../../context/ParadeContext';

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
                    <table className="w-full text-left">
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
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Grand Total</th>
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
                                </tr>
                            ))}
                            {officerRecords.length === 0 && !isDataLoading && (
                                <tr>
                                    <td colSpan={6} className="px-8 py-20 text-center italic text-slate-400">
                                        You haven't submitted any parade states yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
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
        </div>
    );
};
