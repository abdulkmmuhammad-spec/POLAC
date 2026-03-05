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
            <div className="bg-white p-4 md:p-8 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                        <UserPlus size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">Assign New Course Officer</h3>
                        <p className="text-sm text-slate-500">Create functional accounts based on Service Number</p>
                    </div>
                </div>

                <form onSubmit={handleCreateOfficer} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase ml-1">Full Name</label>
                        <input
                            placeholder="e.g. Capt. John Doe"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase ml-1">Service Number</label>
                        <input
                            placeholder="e.g. SN12345"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            value={newServiceNumber}
                            onChange={(e) => setNewServiceNumber(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase ml-1">Initial Assignment</label>
                        <select
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                            value={initialCourse}
                            onChange={(e) => setInitialCourse(parseInt(e.target.value))}
                        >
                            {[12, 11, 10, 9, 8].map(rc => (
                                <option key={rc} value={rc}>Regular Course {rc}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-end">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-[50px] rounded-xl transition-all shadow-md flex items-center justify-center gap-2 group"
                        >
                            <UserPlus size={18} className="group-hover:scale-110 transition-transform" />
                            <span>Create Account</span>
                        </button>
                    </div>
                </form>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Shield size={18} className="text-blue-600" />
                        Officer Rotation Roster
                    </h3>
                    <button
                        onClick={fetchOfficers}
                        className="p-2 hover:bg-white rounded-lg transition-colors text-slate-400 hover:text-blue-600"
                    >
                        <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Officer Details</th>
                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Service No.</th>
                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Current Seat</th>
                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Duty Change</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {officers.map(officer => (
                                <tr key={officer.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-black text-xs">
                                                {officer.fullName.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800">{officer.fullName}</p>
                                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Active Duty</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <code className="bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-xs font-bold">
                                            {officer.serviceNumber || 'N/A'}
                                        </code>
                                    </td>
                                    <td className="px-8 py-5 text-center">
                                        {officer.assignedCourseNumber ? (
                                            <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs font-bold border border-green-100">
                                                <CheckCircle size={12} />
                                                RC {officer.assignedCourseNumber}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-400 px-3 py-1 rounded-full text-xs font-bold border border-slate-100">
                                                <XCircle size={12} />
                                                Unassigned
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <select
                                            className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                                            value={officer.assignedCourseNumber || ''}
                                            onChange={(e) => handleUpdateAssignment(officer.id, parseInt(e.target.value))}
                                        >
                                            <option value="">Vacate Seat</option>
                                            {[12, 11, 10, 9, 8].map(rc => (
                                                <option key={rc} value={rc}>Reassign to RC {rc}</option>
                                            ))}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                            {officers.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan={4} className="px-8 py-12 text-center text-slate-400 italic">
                                        No course officers found in the registry.
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
