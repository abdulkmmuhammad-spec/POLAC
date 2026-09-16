import React, { useState, useEffect } from 'react';
import { UserPlus, RefreshCw, Shield, MapPin, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { dbService } from '../../../services/dbService';
import { User, UserRole } from '../../../types';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../../context/AuthContext';

export const OfficerManager: React.FC = () => {
    const { currentUser } = useAuth();
    const [officers, setOfficers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Registration Form State
    const [showForm, setShowForm] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [role, setRole] = useState(UserRole.COURSE_OFFICER);

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

    const handleUpdateAssignment = async (officerId: string | number, course: number) => {
        try {
            await dbService.updateOfficerAssignment(officerId, course);
            toast.success('Assignment updated successfully');
            fetchOfficers();
        } catch (err) {
            toast.error('Failed to update assignment');
        }
    };

    const handleRegisterOfficer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser?.id) return;
        setIsSubmitting(true);
        try {
            await dbService.registerOfficer(currentUser.id, {
                email,
                password,
                username,
                role
            });
            toast.success('Officer registered successfully');
            setShowForm(false);
            setEmail('');
            setPassword('');
            setUsername('');
            fetchOfficers();
        } catch (err: any) {
            toast.error(err.message || 'Failed to register officer');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="bg-white p-4 md:p-8 rounded-lg shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-900 rounded-md text-white shadow-lg shadow-blue-900/10">
                            <UserPlus size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Office Commissioning</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Commandant Administrative Control</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all border ${showForm ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-blue-900 text-white border-blue-900 hover:bg-blue-800 shadow-md shadow-blue-900/20'}`}
                    >
                        {showForm ? 'Cancel' : 'Register New Officer'}
                    </button>
                </div>

                {showForm ? (
                    <form onSubmit={handleRegisterOfficer} className="animate-in fade-in slide-in-from-top-2 p-6 bg-slate-50 border border-slate-200 rounded-xl mt-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Official Email</label>
                                <input
                                    type="email"
                                    required
                                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-sm font-medium"
                                    placeholder="officer@polac.gov.ng"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Temporary Password</label>
                                <input
                                    type="password"
                                    required
                                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-sm font-medium font-mono"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Rank / Username</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-sm font-medium"
                                    placeholder="e.g. Officer Smith"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Assigned Role</label>
                                <select
                                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-sm font-medium bg-white"
                                    value={role}
                                    onChange={(e) => setRole(e.target.value as UserRole)}
                                >
                                    <option value={UserRole.COURSE_OFFICER}>Course Officer (Max 5)</option>
                                    <option value={UserRole.COMMANDANT}>Commandant (Max 1)</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end pt-2">
                            <button
                                type="submit"
                                disabled={isSubmitting || !email || !password || !username}
                                className="px-6 py-3 bg-blue-900 hover:bg-blue-800 text-white text-xs font-black uppercase tracking-widest rounded-lg transition-all shadow-md shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isSubmitting ? <RefreshCw size={14} className="animate-spin" /> : <Shield size={14} />}
                                {isSubmitting ? 'Registering...' : 'Commission Officer'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="p-4 bg-blue-50/50 rounded-md border border-blue-100 flex items-start gap-3 mt-4">
                        <Shield size={14} className="text-blue-900 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-blue-900/80 leading-relaxed font-bold tracking-tight uppercase">
                            <strong>SECURITY PROTOCOL UPDATE:</strong> Public registration has been permanently disabled. All new Course Officers must be manually registered via this secure administrative portal by the Commandant to ensure strict system integrity.
                        </p>
                    </div>
                )}
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

                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-blue-900 text-white">
                                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em]">Official Details</th>
                                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em]">Service Email</th>
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
                                            {officer.email || officer.serviceNumber || 'N/A'}
                                        </code>
                                    </td>
                                    <td className="px-8 py-5 text-center">
                                        {officer.courseNumber ? (
                                            <div className="inline-flex items-center gap-2 text-blue-900">
                                                <span className="text-[11px] font-mono font-black">RC {officer.courseNumber}</span>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest font-mono">Unassigned</span>
                                        )}
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                            <select
                                                className="text-[10px] font-black uppercase bg-slate-50 border border-slate-200 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-blue-900 transition-all cursor-pointer tracking-widest"
                                                value={officer.courseNumber || ''}
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

                {/* Mobile Card View */}
                <div className="flex flex-col gap-4 md:hidden p-4">
                  {officers.map((officer) => (
                    <div 
                      key={officer.id} 
                      className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-xl backdrop-blur-md flex flex-col gap-3"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-md bg-blue-900 border border-blue-800 flex items-center justify-center text-white font-black text-xs shadow-inner">
                                {officer.fullName.charAt(0)}
                            </div>
                            <span className="text-slate-200 font-bold uppercase text-sm">{officer.fullName}</span>
                        </div>
                        <span className="text-[10px] px-2 py-1 bg-slate-800 text-slate-300 rounded-md font-mono font-bold tracking-widest">
                          {officer.courseNumber ? `RC ${officer.courseNumber}` : 'UNASSIGNED'}
                        </span>
                      </div>
                      <code className="text-slate-400 text-xs font-mono truncate">
                          {officer.email || officer.serviceNumber || 'N/A'}
                      </code>
                      <div className="mt-2 border-t border-slate-800/50 pt-3">
                          <select
                              className="w-full text-[10px] font-black uppercase bg-slate-800/50 text-slate-300 border border-slate-700 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer tracking-widest"
                              value={officer.courseNumber || ''}
                              onChange={(e) => handleUpdateAssignment(officer.id, parseInt(e.target.value))}
                          >
                              <option value="">Vacate Seat</option>
                              {[12, 11, 10, 9, 8].map(rc => (
                                  <option key={rc} value={rc}>Reassign (RC {rc})</option>
                              ))}
                          </select>
                      </div>
                    </div>
                  ))}
                  {officers.length === 0 && !isLoading && (
                    <div className="p-8 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Zero commandants identified in registry
                    </div>
                  )}
                </div>
            </div>
        </div>
    );
};
