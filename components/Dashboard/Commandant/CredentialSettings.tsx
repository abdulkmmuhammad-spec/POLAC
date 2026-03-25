import React, { useState, useEffect } from 'react';
import { Shield, Eye, EyeOff, UserCog, Mail, Key, Save, AlertTriangle, ShieldCheck } from 'lucide-react';
import { dbService } from '../../../services/dbService';
import { User, UserRole } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { SecurityOverrideModal } from './SecurityOverrideModal';

export const CredentialSettings: React.FC = () => {
    const { currentUser } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [revealPasswords, setRevealPasswords] = useState<Record<string, boolean>>({});
    
    // Override State
    const [targetUser, setTargetUser] = useState<User | null>(null);
    const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editPayload, setEditPayload] = useState({ email: '', password: '', courseName: '' });

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const data = await dbService.getAllUsers();
            setUsers(data);
        } catch (err) {
            toast.error('Failed to access credential registry.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const toggleReveal = (userId: string | number) => {
        setRevealPasswords(prev => ({
            ...prev,
            [userId]: !prev[userId]
        }));
    };

    const handleInitiateOverride = (user: User) => {
        setTargetUser(user);
        setEditPayload({
            email: user.email || '',
            password: user.password || '',
            courseName: user.courseName || ''
        });
        setIsOverrideModalOpen(true);
    };

    const handleAuthorize = () => {
        setIsOverrideModalOpen(false);
        setIsEditing(true);
    };

    const handleSaveOverride = async () => {
        if (!targetUser) return;
        
        try {
            await dbService.updateUserCredentials(targetUser.id, {
                email: editPayload.email,
                password: editPayload.password,
                course_name: editPayload.courseName
            }, currentUser?.fullName || 'SYSTEM_ADMIN');
            
            toast.success(`Access protocols updated for ${targetUser.fullName}`);
            setIsEditing(false);
            setTargetUser(null);
            fetchUsers();
        } catch (err) {
            toast.error('Override execution failed. Database rejected modification.');
        }
    };

    if (isLoading) return (
        <div className="py-20 flex flex-col items-center gap-4 text-slate-500">
            <div className="w-10 h-10 border-2 border-slate-700 border-t-white rounded-full animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">Decrypting Security Roster...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <SecurityOverrideModal 
                isOpen={isOverrideModalOpen}
                onClose={() => setIsOverrideModalOpen(false)}
                onAuthorize={handleAuthorize}
                targetName={targetUser?.fullName || ''}
            />

            {/* Self-Management Card (Commandant) */}
            <div className="bg-[#050505] p-6 rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden group">
                <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-6 text-center sm:text-left">
                        <div className="w-16 h-16 rounded-2xl bg-blue-900/50 border border-blue-500/30 flex items-center justify-center text-blue-400">
                            <ShieldCheck size={32} />
                        </div>
                        <div>
                            <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">Active Authority</span>
                            <h3 className="text-xl font-black text-white mt-1 uppercase tracking-tight">{currentUser?.fullName || 'COMMANDANT'}</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">COMMANDANT OF THE POLICE ACADEMY</p>
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => handleInitiateOverride(users.find(u => u.role === UserRole.COMMANDANT)!)}
                        className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-black text-[10px] uppercase tracking-widest transition-all hover:translate-y-[-2px]"
                    >
                        Update My Protocols
                    </button>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl group-hover:bg-blue-600/10 transition-colors duration-700" />
            </div>

            {/* Credential Override Form (Conditional) */}
            {isEditing && targetUser && (
                <div className="bg-[#0a0a0a] p-8 rounded-2xl border border-red-500/30 shadow-2xl animate-in zoom-in-95 duration-300">
                    <div className="flex items-center gap-3 mb-8">
                        <UserCog size={20} className="text-red-500" />
                        <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Live Protocol Injection: {targetUser.fullName}</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Secure Email</label>
                            <div className="relative">
                                <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input 
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-12 py-4 text-sm text-white focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 outline-none transition-all"
                                    value={editPayload.email}
                                    onChange={e => setEditPayload({...editPayload, email: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Auth Token (Password)</label>
                            <div className="relative">
                                <Key size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input 
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-12 py-4 text-sm text-white font-mono focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 outline-none transition-all"
                                    value={editPayload.password}
                                    onChange={e => setEditPayload({...editPayload, password: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="md:col-span-2 space-y-2">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Department Authority (Course Name)</label>
                            <input 
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-sm text-white uppercase font-bold focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 outline-none transition-all"
                                value={editPayload.courseName}
                                onChange={e => setEditPayload({...editPayload, courseName: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="flex gap-4 mt-8">
                        <button 
                            onClick={handleSaveOverride}
                            className="flex-1 bg-white text-black font-black py-4 rounded-xl text-xs uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-3"
                        >
                            <Save size={18} />
                            Deploy Protocols
                        </button>
                        <button 
                            onClick={() => setIsEditing(false)}
                            className="px-8 bg-transparent hover:bg-white/5 border border-white/10 text-slate-500 font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Officer Roster Table */}
            <div className="bg-[#050505] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                <div className="p-6 bg-white/5 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Shield size={18} className="text-slate-400" />
                        <h3 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Strategic Personnel Registry</h3>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{users.length} Active Profiles</span>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[#0a0a0a] text-[9px] font-black uppercase tracking-widest text-slate-500 border-b border-white/5">
                            <tr>
                                <th className="p-6">Officer Personnel</th>
                                <th className="p-6">Command Level</th>
                                <th className="p-6">Digital Credentials</th>
                                <th className="p-6 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="p-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-lg bg-slate-900 border border-white/10 flex items-center justify-center text-slate-500 font-black">
                                                {user.fullName?.charAt(0) || user.username?.charAt(0).toUpperCase() || '?'}
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-white uppercase tracking-tight">{user.fullName || 'Unknown Officer'}</p>
                                                <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">{user.username}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <span className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                                            user.role === UserRole.COMMANDANT 
                                            ? 'bg-blue-900/20 text-blue-400 border-blue-500/30' 
                                            : 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30'
                                        }`}>
                                            {user.role === UserRole.COMMANDANT ? 'Commandant' : 'Course Officer'}
                                        </span>
                                        <p className="text-[10px] text-slate-500 font-bold mt-2 uppercase">{user.courseName || 'Academy HQ'}</p>
                                    </td>
                                    <td className="p-6">
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <Mail size={12} className="text-slate-600" />
                                                <span className="text-[10px] font-mono text-slate-400">{user.email || 'NO_EMAIL_ASSIGNED'}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4 p-2 bg-black rounded-lg border border-white/5 group-hover:border-white/10 transition-colors">
                                                <div className="flex items-center gap-2">
                                                    <Key size={12} className="text-slate-600" />
                                                    <span className="text-xs font-mono text-white tracking-widest">
                                                        {revealPasswords[user.id] ? user.password : '••••••••'}
                                                    </span>
                                                </div>
                                                <button 
                                                    onClick={() => toggleReveal(user.id)}
                                                    className="text-slate-600 hover:text-white transition-colors"
                                                >
                                                    {revealPasswords[user.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-6 text-right">
                                        <button 
                                            onClick={() => handleInitiateOverride(user)}
                                            className="px-4 py-2 bg-transparent hover:bg-red-500/10 border border-white/10 hover:border-red-500/40 text-slate-500 hover:text-red-500 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all"
                                        >
                                            Security Override
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Tactical Backdrop */}
                <div className="p-4 bg-emerald-500/5 border-t border-emerald-500/10 flex items-center gap-3">
                    <AlertTriangle size={14} className="text-emerald-500 shrink-0" />
                    <p className="text-[9px] text-emerald-500/80 leading-relaxed font-bold uppercase tracking-tight">
                        Encrypted Core Link Active: Modifying any credential here initiates an instant global override of user access rights.
                    </p>
                </div>
            </div>
        </div>
    );
};
