import React, { useState } from 'react';
import { dbService, supabase } from '../../../services/dbService';
import { toast } from 'react-hot-toast';
import { GraduationCap, AlertTriangle, Shield, CheckCircle } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useParade } from '../../../context/ParadeContext';

interface GraduationPanelProps {
    onCommissionIncoming?: (newRC: number) => void;
}

export const GraduationPanel: React.FC<GraduationPanelProps> = ({ onCommissionIncoming }) => {
    const { currentUser } = useAuth();
    const { activeRC } = useParade();
    const [targetRC, setTargetRC] = useState<number>(activeRC + 4); // Default to graduating the oldest class
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [isSuccess, setIsSuccess] = useState(false);
    const [incomingRC, setIncomingRC] = useState<number | null>(null);

    const handleGraduation = async () => {
        if (confirmText !== `GRADUATE RC ${targetRC}`) {
            toast.error('Confirmation text does not match.');
            return;
        }

        setIsSubmitting(true);
        try {
            // Using a secure RPC procedure for the lifecycle engine
            const { error } = await supabase.rpc('execute_course_graduation', {
                p_course_number: targetRC,
                p_actor_id: currentUser?.id?.toString(),
                p_actor_name: currentUser?.fullName
            });

            if (error) throw error;

            toast.success(`RC ${targetRC} successfully graduated and archived.`);
            setConfirmText('');
            // Calculate incoming RC based on the standard 5-year pipeline if it was the oldest class
            const isOldest = (targetRC === activeRC + 4);
            const nextRC = isOldest ? activeRC + 5 : targetRC + 1; // Simplistic pipeline projection for handover
            setIncomingRC(nextRC);
            setIsSuccess(true);
        } catch (err: any) {
            console.error('Graduation error:', err);
            toast.error(err.message || 'Failed to execute graduation sequence.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="bg-emerald-50 rounded-lg shadow-sm border border-emerald-200 overflow-hidden mt-6 text-slate-800 p-8 text-center space-y-6">
                <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-4">
                    <CheckCircle size={32} />
                </div>
                <h3 className="text-xl font-black text-emerald-900 tracking-tight">Graduation Protocol Complete</h3>
                <p className="text-sm font-medium text-emerald-800/80 max-w-md mx-auto leading-relaxed">
                    RC {targetRC} has been successfully graduated. The Course Officer profile is deactivated and the global registry has been updated.
                </p>
                
                <div className="pt-6 space-y-3 max-w-xs mx-auto">
                    <button
                        onClick={() => {
                            if (onCommissionIncoming && incomingRC) {
                                onCommissionIncoming(incomingRC);
                                setIsSuccess(false);
                            }
                        }}
                        className="w-full h-[50px] bg-emerald-700 hover:bg-emerald-800 text-white font-black uppercase tracking-widest text-xs rounded-md shadow-md transition-all flex items-center justify-center gap-2"
                    >
                        Commission Incoming Officer Now
                    </button>
                    <button
                        onClick={() => {
                            setIsSuccess(false);
                            setTargetRC(activeRC + 4);
                        }}
                        className="w-full h-[50px] bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-bold uppercase tracking-widest text-[10px] rounded-md transition-all"
                    >
                        Do This Later
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 overflow-hidden text-slate-800">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                    <GraduationCap size={20} />
                </div>
                <div>
                    <h3 className="text-base font-bold text-slate-900">Regular Course Graduation</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Archive a graduating Regular Course and advance remaining intakes
                    </p>
                </div>
            </div>
            <div className="p-4 sm:p-5 space-y-5">
                <div className="p-3.5 bg-indigo-50/70 rounded-xl border border-indigo-100 flex items-start gap-2.5">
                    <Shield size={16} className="text-indigo-700 mt-0.5 shrink-0" />
                    <p className="text-xs text-indigo-950/90 leading-relaxed">
                        <span className="font-semibold">Integrity Lock:</span> Graduating a course permanently locks its parade records, marks cadets as Graduated, and deactivates the assigned Course Officer account.
                    </p>
                </div>

                <div className="p-3.5 bg-amber-50/80 rounded-xl border border-amber-200/80 flex items-start gap-2.5">
                    <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-900 leading-relaxed">
                        Confirming graduation increments the Active RC baseline, advancing all remaining active Regular Courses by one year level.
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-700">Target Course to Graduate</label>
                    <div className="flex items-center gap-3">
                        <input
                            type="number"
                            min={1}
                            className="w-28 min-h-[44px] px-3.5 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:border-indigo-600 outline-none font-mono font-bold text-base text-slate-900"
                            value={targetRC}
                            onChange={(e) => setTargetRC(parseInt(e.target.value) || 0)}
                            disabled={isSubmitting}
                        />
                        <span className="text-xs font-semibold text-slate-500">Regular Course</span>
                    </div>
                </div>

                <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-rose-700">
                        <AlertTriangle size={16} />
                        <span className="text-xs font-bold">Danger Zone</span>
                    </div>
                    <p className="text-xs text-rose-900 leading-relaxed">
                        To confirm this irreversible action, type <span className="font-mono font-bold">GRADUATE RC {targetRC}</span> below:
                    </p>
                    <input
                        type="text"
                        className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-rose-200 rounded-xl focus:border-rose-500 outline-none font-mono font-bold text-sm text-rose-900 placeholder:text-rose-300"
                        placeholder={`GRADUATE RC ${targetRC}`}
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        disabled={isSubmitting}
                    />
                </div>

                <button
                    onClick={handleGraduation}
                    disabled={isSubmitting || confirmText !== `GRADUATE RC ${targetRC}`}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-2xs bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? 'Processing Graduation...' : 'Finalize Graduation'} <CheckCircle size={15} />
                </button>
            </div>
        </div>
    );
};
