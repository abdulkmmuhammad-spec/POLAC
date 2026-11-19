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
        <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 overflow-hidden text-slate-800">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                    <RefreshCw size={20} />
                </div>
                <div>
                    <h3 className="text-base font-bold text-slate-900">Change of Command Handover</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Transfer a Regular Course to a newly commissioned Course Officer
                    </p>
                </div>
            </div>
            
            <form onSubmit={handleHandover} className="p-4 sm:p-5 space-y-5">
                <div className="p-3.5 bg-teal-50/70 rounded-xl border border-teal-100 flex items-start gap-2.5">
                    <Shield size={16} className="text-teal-700 mt-0.5 shrink-0" />
                    <p className="text-xs text-teal-950/90 leading-relaxed">
                        Assign a new Course Officer and immediately transfer command of a Regular Course—no password sharing needed.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">Target Course (RC)</label>
                        <input
                            type="number"
                            min={1}
                            required
                            className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:border-teal-600 outline-none font-mono font-bold text-sm text-slate-900"
                            value={targetRC || ''}
                            onChange={(e) => setTargetRC(parseInt(e.target.value))}
                            disabled={isSubmitting}
                            placeholder="e.g. 12"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">New Officer Name</label>
                        <input
                            type="text"
                            required
                            className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:border-teal-600 outline-none font-semibold text-sm text-slate-900"
                            value={newOfficerName}
                            onChange={(e) => setNewOfficerName(e.target.value)}
                            disabled={isSubmitting}
                            placeholder="e.g. Insp. A. Smith"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">Official Service Email</label>
                        <input
                            type="email"
                            required
                            className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:border-teal-600 outline-none font-mono text-sm text-slate-900"
                            value={newOfficerEmail}
                            onChange={(e) => setNewOfficerEmail(e.target.value)}
                            disabled={isSubmitting}
                            placeholder="officer@polac.gov.ng"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
                        <input
                            type="password"
                            required
                            className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:border-teal-600 outline-none font-mono text-sm text-slate-900"
                            value={newOfficerPassword}
                            onChange={(e) => setNewOfficerPassword(e.target.value)}
                            disabled={isSubmitting}
                            placeholder="••••••••"
                        />
                    </div>
                </div>

                <div className="flex justify-end pt-1">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl transition-all shadow-2xs disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? <RefreshCw size={15} className="animate-spin" /> : <UserPlus size={15} />}
                        {isSubmitting ? 'Transferring Command...' : 'Transfer Command'}
                    </button>
                </div>
            </form>
        </div>
    );
};
