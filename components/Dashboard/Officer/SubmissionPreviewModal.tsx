import React, { useState, useEffect } from 'react';
import { X, Calendar, FileText, CheckCircle2, Loader2 } from 'lucide-react';
import { ParadeRecordMetadata, CadetStatus, CadetDetail } from '../../../types';
import { dbService } from '../../../services/dbService';

interface SubmissionPreviewModalProps {
    record: ParadeRecordMetadata | null;
    onClose: () => void;
}

export const SubmissionPreviewModal: React.FC<SubmissionPreviewModalProps> = ({ record, onClose }) => {
    const [cadets, setCadets] = useState<CadetDetail[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!record) {
            setCadets([]);
            return;
        }

        const fetchDetails = async () => {
            setIsLoading(true);
            const { data } = await dbService.getParadeDetails(record.id);
            setCadets(data || []);
            setIsLoading(false);
        };
        fetchDetails();
    }, [record]);

    if (!record) return null;

    // Filter out completely "Present" cadets
    const nonPresentCadets = cadets.filter(c => c.status !== CadetStatus.PRESENT);

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-slate-800 p-6 flex items-start justify-between relative shrink-0">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-2">Submission Details</h3>
                        <div className="flex items-center gap-4 text-slate-300 text-xs font-medium">
                            <span className="flex items-center gap-1.5"><Calendar size={14} /> {new Date(record.date).toLocaleDateString()}</span>
                            <span className="flex items-center gap-1.5"><FileText size={14} /> {record.paradeType}</span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white hover:bg-slate-700 p-2 rounded-xl transition-colors"
                    >
                        <X size={20} />
                    </button>
                    {/* Decorative element */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl transform translate-x-1/2 -translate-y-1/2" />
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
                    {isLoading ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center">
                            <Loader2 size={32} className="animate-spin text-blue-500 mb-4" />
                            <p className="text-slate-500 text-sm font-medium">Loading cadet details...</p>
                        </div>
                    ) : (
                        <>
                            <div className="mb-4">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                    Non-Present Individuals ({nonPresentCadets.length})
                                </p>
                            </div>

                            {nonPresentCadets.length > 0 ? (
                                <div className="space-y-3">
                                    {nonPresentCadets.map((cadet, idx) => (
                                        <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-blue-200 transition-colors">
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm group-hover:text-blue-700 transition-colors">{cadet.name}</p>
                                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">{cadet.squad}</p>
                                            </div>
                                            <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter shrink-0 border shadow-sm ${
                                                cadet.status === CadetStatus.ABSENT ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                cadet.status === CadetStatus.SICK ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                cadet.status === CadetStatus.DETENTION ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                                                cadet.status === CadetStatus.PASS ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                                cadet.status === CadetStatus.SUSPENSION ? 'bg-slate-50 text-slate-600 border-slate-200' :
                                                cadet.status === CadetStatus.YET_TO_REPORT ? 'bg-cyan-50 text-cyan-600 border-cyan-100' :
                                                'bg-blue-50 text-blue-600 border-blue-100'
                                            }`}>
                                                {cadet.status === CadetStatus.YET_TO_REPORT ? 'YTR' : 
                                                 cadet.status === CadetStatus.PASS ? 'PASS' :
                                                 cadet.status === CadetStatus.SUSPENSION ? 'SUSP' :
                                                 cadet.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-12 flex flex-col items-center justify-center text-center">
                                    <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mb-4 border-4 border-emerald-100/50">
                                        <CheckCircle2 size={32} />
                                    </div>
                                    <h4 className="text-emerald-700 font-bold mb-1">100% Attendance</h4>
                                    <p className="text-slate-500 text-sm max-w-[250px]">All cadets were marked as Present for this submission.</p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-slate-50 shrink-0">
                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-white border-2 border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:border-slate-300 hover:bg-slate-50 transition-colors shadow-sm"
                    >
                        Close Preview
                    </button>
                </div>
            </div>
        </div>
    );
};
