import React, { useState, useEffect } from 'react';
import { X, Calendar, FileText, CheckCircle2, Loader2, Flag, Send, CheckCheck, Clock, AlertTriangle } from 'lucide-react';
import { ParadeRecordMetadata, CadetStatus, CadetDetail, CommandantRemark } from '../../../types';
import { dbService } from '../../../services/dbService';
import { useParade } from '../../../context/ParadeContext';
import { useAuth } from '../../../context/AuthContext';
import { getStatusFullLabel, getStatusBadgeStyles } from '../../../utils/statusHelpers';
import { toast } from 'react-hot-toast';

interface SubmissionPreviewModalProps {
    record: ParadeRecordMetadata | null;
    onClose: () => void;
}

export const SubmissionPreviewModal: React.FC<SubmissionPreviewModalProps> = ({ record, onClose }) => {
    const { currentUser } = useAuth();
    const { remarks, refreshRemarks } = useParade();
    const [cadets, setCadets] = useState<CadetDetail[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
    const [submittingId, setSubmittingId] = useState<string | null>(null);

    const recordRemarks = React.useMemo(() => {
        if (!record) return [];
        return remarks.filter(rm => String(rm.submissionId) === String(record.id));
    }, [remarks, record]);

    const handleSendReply = async (remark: CommandantRemark) => {
        const text = (replyTexts[remark.id] || '').trim();
        if (!text) {
            toast.error('Please enter a justification response.');
            return;
        }
        setSubmittingId(remark.id);
        try {
            await dbService.respondToCommandantRemark({
                remarkId: remark.id,
                officerResponse: text,
                officerName: currentUser?.fullName || record?.officerName || 'Course Officer',
                officerId: currentUser?.id
            });
            setReplyTexts(prev => ({ ...prev, [remark.id]: '' }));
            await refreshRemarks();
            toast.success('Official response submitted.');
        } catch (err) {
            toast.error('Failed to submit response.');
        } finally {
            setSubmittingId(null);
        }
    };

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
                <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 space-y-5">
                    {recordRemarks.length > 0 && (
                        <div className="space-y-3">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                <Flag size={13} className="text-amber-600" />
                                Commandant Remarks ({recordRemarks.length})
                            </p>
                            {recordRemarks.map(rm => {
                                const isResolved = rm.status === 'resolved';
                                const hasReply = Boolean(rm.officerResponse);
                                return (
                                    <div
                                        key={rm.id}
                                        className={`p-4 rounded-2xl border bg-white space-y-2.5 shadow-2xs ${
                                            isResolved
                                                ? 'border-emerald-200'
                                                : hasReply
                                                ? 'border-blue-200'
                                                : 'border-amber-300'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            {isResolved ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800">
                                                    <CheckCheck size={11} /> Resolved
                                                </span>
                                            ) : hasReply ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-blue-100 text-blue-800">
                                                    <Clock size={11} /> Response Filed
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-100 text-amber-900">
                                                    <AlertTriangle size={11} /> Pending Review
                                                </span>
                                            )}
                                            <span className="text-[10px] font-mono text-slate-400">
                                                {new Date(rm.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <p className="text-xs font-semibold text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                            "{rm.remarkText}"
                                        </p>
                                        {hasReply ? (
                                            <div className="text-xs text-blue-900 bg-blue-50/70 p-2.5 rounded-xl border border-blue-100">
                                                <span className="block text-[9px] font-black uppercase text-blue-700 mb-0.5">
                                                    Your Response:
                                                </span>
                                                "{rm.officerResponse}"
                                            </div>
                                        ) : (
                                            !isResolved && (
                                                <div className="space-y-2 pt-1">
                                                    <textarea
                                                        rows={2}
                                                        value={replyTexts[rm.id] || ''}
                                                        onChange={e =>
                                                            setReplyTexts(prev => ({
                                                                ...prev,
                                                                [rm.id]: e.target.value
                                                            }))
                                                        }
                                                        placeholder="Submit justification for absentees..."
                                                        className="w-full p-2.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-xl text-xs outline-none resize-none"
                                                    />
                                                    <button
                                                        type="button"
                                                        disabled={submittingId === rm.id || !(replyTexts[rm.id] || '').trim()}
                                                        onClick={() => handleSendReply(rm)}
                                                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5"
                                                    >
                                                        {submittingId === rm.id ? (
                                                            <Loader2 size={13} className="animate-spin" />
                                                        ) : (
                                                            <Send size={13} />
                                                        )}
                                                        <span>Submit Response</span>
                                                    </button>
                                                </div>
                                            )
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

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
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight shrink-0 border shadow-sm ${getStatusBadgeStyles(cadet.status)}`}>
                                                {getStatusFullLabel(cadet.status)}
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
