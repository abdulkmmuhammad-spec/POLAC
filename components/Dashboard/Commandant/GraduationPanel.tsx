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
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mt-6 text-slate-800">
            <div className="p-4 border-b bg-indigo-900 text-white flex items-center gap-3">
                <GraduationCap size={16} />
                <div>
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em]">Cohort Graduation Engine</h3>
                </div>
            </div>
            <div className="p-6 space-y-6">
                <div className="p-4 bg-indigo-50/50 rounded-md border border-indigo-100 flex items-start gap-3">
                    <Shield size={14} className="text-indigo-900 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-indigo-900/80 leading-relaxed font-bold uppercase tracking-tight">
                        <strong>FORENSIC INTEGRITY LOCK:</strong> Graduating a course permanently locks all associated parade records, marks all cadets as GRADUATED, and deactivates the assigned Course Officer's account to prevent identity hijacking.
                    </p>
                </div>

                <div className="p-4 bg-amber-50 rounded-md border border-amber-200 flex items-start gap-3">
                    <AlertTriangle size={14} className="text-amber-700 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-amber-800/90 leading-relaxed font-bold uppercase tracking-tight">
                        <strong>Notice:</strong> Confirming this graduation will instantly increment the academy's baseline Active RC configuration. All remaining active cohorts will immediately advance to their next year levels dynamically.
                    </p>
                </div>

                <div className="space-y-4">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Target Course to Graduate</label>
                    <div className="flex items-center gap-3">
                        <input
                            type="number"
                            min={1}
                            className="w-32 px-4 py-3 bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-indigo-900 outline-none font-mono font-black text-lg"
                            value={targetRC}
                            onChange={(e) => setTargetRC(parseInt(e.target.value) || 0)}
                            disabled={isSubmitting}
                        />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Regular Course</span>
                    </div>
                </div>

                <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg space-y-3">
                    <div className="flex items-center gap-2 text-rose-700">
                        <AlertTriangle size={16} />
                        <span className="text-xs font-black uppercase tracking-widest">Danger Zone</span>
                    </div>
                    <p className="text-[10px] font-bold text-rose-800/80 uppercase">
                        To confirm this irreversible action, please type: <strong>GRADUATE RC {targetRC}</strong>
                    </p>
                    <input
                        type="text"
                        className="w-full px-4 py-3 bg-white border border-rose-200 rounded focus:ring-1 focus:ring-rose-500 outline-none font-mono font-bold text-sm text-rose-900 placeholder:text-rose-300"
                        placeholder={`GRADUATE RC ${targetRC}`}
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        disabled={isSubmitting}
                    />
                </div>

                <button
                    onClick={handleGraduation}
                    disabled={isSubmitting || confirmText !== `GRADUATE RC ${targetRC}`}
                    className="w-full flex items-center justify-center gap-2 px-6 h-[50px] rounded-md font-black text-xs uppercase tracking-widest transition-all shadow-md bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                >
                    {isSubmitting ? 'Executing Graduation Protocol...' : 'Finalize Graduation'} <CheckCircle size={14} />
                </button>
            </div>
        </div>
    );
};
