import React, { useState } from 'react';
import { RefreshCw, Shield, MapPin, UserPlus } from 'lucide-react';
import { dbService } from '../../../services/dbService';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../../context/AuthContext';

interface HandoverWizardProps {
    prefilledTargetRC?: number | null;
    onClearPrefill?: () => void;
}

export const HandoverWizard: React.FC<HandoverWizardProps> = ({ prefilledTargetRC, onClearPrefill }) => {
    const { currentUser } = useAuth();
    const [targetRC, setTargetRC] = useState<number>(0);
    const [newOfficerName, setNewOfficerName] = useState('');
    const [newOfficerEmail, setNewOfficerEmail] = useState('');
    const [newOfficerPassword, setNewOfficerPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    React.useEffect(() => {
        if (prefilledTargetRC) {
            setTargetRC(prefilledTargetRC);
        }
    }, [prefilledTargetRC]);

    const handleHandover = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetRC || !newOfficerName || !newOfficerEmail || !newOfficerPassword) {
            toast.error('Please fill in all fields.');
            return;
        }

        setIsSubmitting(true);
        try {
            // First, vacate and deactivate the existing officer assigned to this Regular Course (RC)
            await dbService.deactivateOfficerForCourse(targetRC);

            // Now, register the new officer securely
            const { data, error } = await dbService.registerOfficer(currentUser?.id?.toString() || '', {
                email: newOfficerEmail,
                password: newOfficerPassword,
                username: newOfficerName,
                role: 'course_officer'
            });

            if (error) throw error;

            // Wait, registerOfficer already creates the officer. We need to assign them to the RC.
            // But wait, the admin_register_officer doesn't assign the course. We need a way to assign the new officer and potentially deactivate the old one?
            // Actually, if we just use the new UI pattern for Handover, we're basically assigning the newly commissioned officer to the target RC.
            // The Graduation engine deactivates them. What does the Handover wizard do? "The Commandant needs a 'Handover' wizard".
            // It allows them to swap an officer out for a course.

            // Extract the actual UUID string if the RPC returns an object wrapper
            const newOfficerId = (typeof data === 'object' && data !== null) 
                ? (data.id || data.user_id || Object.values(data)[0]) 
                : data;

            await dbService.updateOfficerAssignment(newOfficerId as string, targetRC);

            toast.success(`Command successfully handed over to ${newOfficerName} for RC ${targetRC}.`);
            
            // Clear form
            if (onClearPrefill) onClearPrefill();
            setTargetRC(0);
            setNewOfficerName('');
            setNewOfficerEmail('');
            setNewOfficerPassword('');
            
        } catch (err: any) {
            console.error('Handover error:', err);
            toast.error(err.message || 'Failed to complete handover sequence.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mt-6 text-slate-800">
            <div className="p-4 border-b bg-teal-900 text-white flex items-center gap-3">
                <RefreshCw size={16} />
                <div>
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em]">Change of Command Handover</h3>
                </div>
            </div>
            
            <form onSubmit={handleHandover} className="p-6 space-y-6">
                <div className="p-4 bg-teal-50/50 rounded-md border border-teal-100 flex items-start gap-3">
                    <Shield size={14} className="text-teal-900 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-teal-900/80 leading-relaxed font-bold uppercase tracking-tight">
                        <strong>PROTOCOL:</strong> Use this wizard to commission a new Course Officer and immediately hand over command of a specific Regular Course. This ensures continuity without password sharing.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 mb-1 block">Target Course (RC)</label>
                        <input
                            type="number"
                            min={1}
                            required
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-teal-900 outline-none font-mono font-bold text-sm"
                            value={targetRC || ''}
                            onChange={(e) => setTargetRC(parseInt(e.target.value))}
                            disabled={isSubmitting}
                            placeholder="e.g. 12"
                        />
                    </div>
                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 mb-1 block">New Officer Name</label>
                        <input
                            type="text"
                            required
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-teal-900 outline-none font-bold text-sm"
                            value={newOfficerName}
                            onChange={(e) => setNewOfficerName(e.target.value)}
                            disabled={isSubmitting}
                            placeholder="e.g. Insp. A. Smith"
                        />
                    </div>
                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 mb-1 block">Official Service Email</label>
                        <input
                            type="email"
                            required
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-teal-900 outline-none font-mono font-bold text-sm"
                            value={newOfficerEmail}
                            onChange={(e) => setNewOfficerEmail(e.target.value)}
                            disabled={isSubmitting}
                            placeholder="officer@polac.gov.ng"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 mb-1 block">Temporary Credential (Password)</label>
                        <input
                            type="password"
                            required
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-teal-900 outline-none font-mono font-bold text-sm"
                            value={newOfficerPassword}
                            onChange={(e) => setNewOfficerPassword(e.target.value)}
                            disabled={isSubmitting}
                            placeholder="••••••••"
                        />
                    </div>
                </div>

                <div className="flex justify-end pt-2">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-6 py-3 bg-teal-900 hover:bg-teal-800 text-white text-xs font-black uppercase tracking-widest rounded-lg transition-all shadow-md shadow-teal-900/20 disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSubmitting ? <RefreshCw size={14} className="animate-spin" /> : <UserPlus size={14} />}
                        {isSubmitting ? 'Executing Handover...' : 'Execute Change of Command'}
                    </button>
                </div>
            </form>
        </div>
    );
};
