import React, { useState, useEffect } from 'react';
import { UserPlus, RefreshCw, Shield, MapPin, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { dbService } from '../../../services/dbService';
import { User } from '../../../types';
import { toast } from 'react-hot-toast';

export const OfficerManager: React.FC = () => {
    const [officers, setOfficers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // New Officer Form
    const [newName, setNewName] = useState('');
    const [newServiceNumber, setNewServiceNumber] = useState('');
    const [initialCourse, setInitialCourse] = useState<number>(12);

    const fetchOfficers = async () => {
        setIsLoading(true);
        try {
            const data = await dbService.getOfficers();
            setOfficers(data);
        } catch (err) {
            toast.error('Failed to load officers');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchOfficers();
    }, []);

    const handleCreateOfficer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName || !newServiceNumber) return;

        setIsSubmitting(true);
        try {
            await dbService.inviteOfficer(newName, newServiceNumber, initialCourse);
            toast.success(`Account created for ${newName} (SN: ${newServiceNumber})`);
            setNewName('');
            setNewServiceNumber('');
            fetchOfficers();
        } catch (err) {
            toast.error('Failed to create officer account');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdateAssignment = async (officerId: string | number, course: number) => {
        try {
            await dbService.updateOfficerAssignment(officerId, course);
            toast.success('Assignment updated successfully');
            fetchOfficers();
        } catch (err) {
            toast.error('Failed to update assignment');
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="bg-white p-4 md:p-8 rounded-lg shadow-sm border border-slate-200">
                <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-blue-900 rounded-md text-white shadow-lg shadow-blue-900/10">
                        <UserPlus size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Commission New Course Officer</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Initialize secure service account via Service Number</p>
                    </div>
                </div>

                <form onSubmit={handleCreateOfficer} className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Full Service Name</label>
                        <input
                            placeholder="e.g. CAPT. JOHN DOE"
                            className="w-full px-4 py-3 rounded-md border border-slate-200 focus:ring-1 focus:ring-blue-900 outline-none transition-all text-xs font-bold uppercase placeholder:text-slate-300"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Service Number ID</label>
                        <input
                            placeholder="e.g. SN12345"
                            className="w-full px-4 py-3 rounded-md border border-slate-200 focus:ring-1 focus:ring-blue-900 outline-none transition-all text-xs font-mono font-bold uppercase placeholder:text-slate-300"
                            value={newServiceNumber}
                            onChange={(e) => setNewServiceNumber(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Initial Duty Post</label>
                        <select
                            className="w-full px-4 py-3 rounded-md border border-slate-200 focus:ring-1 focus:ring-blue-900 outline-none transition-all bg-white text-xs font-bold uppercase"
                            value={initialCourse}
                            onChange={(e) => setInitialCourse(parseInt(e.target.value))}
                        >
                            {[12, 11, 10, 9, 8].map(rc => (
                                <option key={rc} value={rc}>REGULAR COURSE {rc}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-end">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-blue-900 hover:bg-blue-800 text-white font-black uppercase tracking-widest h-[46px] rounded-md transition-all shadow-md flex items-center justify-center gap-2 group text-[10px]"
                        >
                            <UserPlus size={14} className="group-hover:scale-110 transition-transform" />
                            <span>Establish Account</span>
                        </button>
                    </div>
                </form>
            </div>

            <div className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3">
                        <Shield size={16} className="text-blue-900" />
                        Officer Rotation Ledger
                    </h3>
                    <button
                        onClick={fetchOfficers}
                        className="p-2 hover:bg-white rounded-md transition-colors text-slate-400 hover:text-blue-900 border border-transparent hover:border-slate-200"
                    >
                        <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-blue-900 text-white">
                                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em]">Official Details</th>
                                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em]">Service ID</th>
                                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-center">Assigned Seat</th>
                                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-right">Command Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 italic-alternate">
                            {officers.map(officer => (
                                <tr key={officer.id} className="hover:bg-blue-50/20 transition-colors">
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className="h-9 w-9 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-900 font-black text-xs shadow-inner">
                                                {officer.fullName.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-900 text-sm uppercase">{officer.fullName}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <code className="text-blue-900 px-2 py-1 rounded bg-blue-50 border border-blue-100 text-[11px] font-mono font-bold">
                                            {officer.serviceNumber || 'N/A'}
                                        </code>
                                    </td>
                                    <td className="px-8 py-5 text-center">
                                        {officer.assignedCourseNumber ? (
                                            <div className="inline-flex items-center gap-2 text-blue-900">
                                                <span className="text-[11px] font-mono font-black">RC {officer.assignedCourseNumber}</span>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest font-mono">Unassigned</span>
                                        )}
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                            <select
                                                className="text-[10px] font-black uppercase bg-slate-50 border border-slate-200 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-blue-900 transition-all cursor-pointer tracking-widest"
                                                value={officer.assignedCourseNumber || ''}
                                                onChange={(e) => handleUpdateAssignment(officer.id, parseInt(e.target.value))}
                                            >
                                                <option value="">Vacate Seat</option>
                                                {[12, 11, 10, 9, 8].map(rc => (
                                                    <option key={rc} value={rc}>Reassign (RC {rc})</option>
                                                ))}
                                            </select>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {officers.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan={4} className="px-8 py-16 text-center">
                                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] italic">Zero commandants identified in registry</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
