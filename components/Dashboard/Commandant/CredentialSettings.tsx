import React, { useState, useEffect } from 'react';
import { Shield, Eye, EyeOff, UserCog, Mail, Key, Save, AlertTriangle, ShieldCheck, Plus, Search, ChevronDown, UserPlus } from 'lucide-react';
import { dbService, updateUserCredentials } from '../../../services/dbService';
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
    const [editPayload, setEditPayload] = useState({ email: '', password: '', confirmPassword: '', courseNumber: '' });

    // Split-View & Add Officer State
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [addPayload, setAddPayload] = useState({ fullName: '', username: '', email: '', password: '', role: UserRole.COURSE_OFFICER, courseName: '' });

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
        if (!user) return;
        setTargetUser(user);
        setEditPayload({
            email: user.email || '',
            password: user.password || '',
            confirmPassword: '',
            courseNumber: user.courseNumber ? String(user.courseNumber) : ''
        });
        setIsOverrideModalOpen(true);
    };

    const handleAuthorize = async (password: string) => {
        if (!currentUser) return;
        const isValid = await dbService.verifyCommandantAccess(currentUser.id, password);
        if (isValid) {
            setIsOverrideModalOpen(false);
            setIsEditing(true);
            toast.success('Authority verified. Secure link established.');
        } else {
            toast.error('Verification failed. Invalid administration password.');
        }
    };

    const handleSaveOverride = async () => {
        if (!targetUser) return;
        
        const isSelfEdit = String(targetUser.id) === String(currentUser?.id);
        if (isSelfEdit && editPayload.password !== editPayload.confirmPassword) {
            toast.error('Passwords do not match. Override aborted to prevent lockout.');
            return;
        }

        try {
            await updateUserCredentials({
                adminId: String(currentUser?.id),
                targetUserId: String(targetUser.id),
                newEmail: editPayload.email,
                newCourseAssignment: editPayload.courseNumber,
                newPassword: editPayload.password,
                auditDetails: "Sensitive credential modification via Commandant Control"
            });
            
            toast.success(`Access protocols updated for ${targetUser.fullName}`);
            setIsEditing(false);
            setTargetUser(null);
            fetchUsers();
        } catch (err: any) {
            const errMsg = err?.message || String(err);
            if (errMsg.includes('DUPLICATE_EMAIL') || errMsg.includes('users_email_key') || errMsg.includes('unique constraint')) {
                toast.error(`Override aborted: Email '${editPayload.email}' is already assigned to another account.`);
            } else {
                toast.error('Override execution failed. Database rejected modification.');
            }
        }
    };

    const handleAddOfficer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;
        setIsAdding(true);
        try {
            await dbService.registerOfficer(currentUser.id, {
                email: addPayload.email,
                password: addPayload.password,
                username: addPayload.username,
                role: addPayload.role
            });
            toast.success('Course Officer successfully provisioned.');
            setIsAddModalOpen(false);
            setAddPayload({ fullName: '', username: '', email: '', password: '', role: UserRole.COURSE_OFFICER, courseName: '' });
            fetchUsers();
        } catch (err: any) {
            toast.error(err.message || 'Failed to register officer.');
        } finally {
            setIsAdding(false);
        }
    };

    // Filter Logic
    const filteredUsers = users.filter(u => {
        const query = searchQuery.toLowerCase();
        return (u.fullName?.toLowerCase().includes(query) || 
                u.username?.toLowerCase().includes(query) || 
                u.courseName?.toLowerCase().includes(query) ||
                u.role.toLowerCase().includes(query));
    });

    const activeRoster = filteredUsers.filter(u => u.role === UserRole.COMMANDANT || u.isActive);
    const inactiveRegistry = filteredUsers.filter(u => u.role !== UserRole.COMMANDANT && !u.isActive);

    const activeOfficerCount = activeRoster.filter(u => u.role !== UserRole.COMMANDANT).length;
    const isCapReached = activeOfficerCount >= 5;

    if (isLoading) return (
        <div className="py-20 flex flex-col items-center gap-4 text-slate-500">
            <div className="w-10 h-10 border-2 border-slate-700 border-t-white rounded-full animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">Decrypting Security Roster...</p>
        </div>
    );

    const renderTable = (roster: User[]) => (
        <>
            <div className="hidden md:block w-full overflow-x-auto rounded-xl border border-slate-800/60 bg-slate-950/20 scrollbar-thin">
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
                        {roster.map((user) => (
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
                        {roster.length === 0 && (
                            <tr>
                                <td colSpan={4} className="p-8 text-center text-slate-500 text-xs font-black uppercase tracking-widest">
                                    No records found matching criteria
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="grid grid-cols-1 gap-4 md:hidden p-4">
                {roster.map((user) => (
                    <div key={user.id} className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-md p-4 rounded-xl space-y-4 shadow-lg">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-300 font-bold border border-slate-700/60 flex items-center justify-center text-sm uppercase">
                                    {user.fullName?.charAt(0) || user.username?.charAt(0).toUpperCase() || '?'}
                                </div>
                                <div>
                                    <p className="text-xs font-black text-white uppercase tracking-tight">{user.fullName || 'Unknown Officer'}</p>
                                    <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">{user.username}</p>
                                </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border shrink-0 ${
                                user.role === UserRole.COMMANDANT 
                                ? 'bg-blue-900/20 text-blue-400 border-blue-500/30' 
                                : 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30'
                            }`}>
                                {user.role === UserRole.COMMANDANT ? 'Cmdt' : 'Officer'}
                            </span>
                        </div>
                        <div className="space-y-2.5 text-xs">
                            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                <span className="text-slate-500 text-[9px] font-black uppercase">Authority</span>
                                <span className="text-slate-300 font-bold uppercase">{user.courseName || 'Academy HQ'}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-white/5 pb-2 gap-2">
                                <span className="text-slate-500 text-[9px] font-black uppercase shrink-0">Email</span>
                                <span className="text-slate-300 font-mono truncate max-w-[180px] text-right">{user.email || 'NO_EMAIL'}</span>
                            </div>
                            <div className="flex justify-between items-center gap-2">
                                <span className="text-slate-500 text-[9px] font-black uppercase shrink-0">Password</span>
                                <div className="flex items-center gap-2 bg-black px-2 py-1 rounded border border-white/5">
                                    <span className="text-xs font-mono text-white tracking-widest">
                                        {revealPasswords[user.id] ? user.password : '••••••••'}
                                    </span>
                                    <button 
                                        onClick={() => toggleReveal(user.id)}
                                        className="text-slate-500 hover:text-white transition-colors"
                                    >
                                        {revealPasswords[user.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="pt-2">
                            <button 
                                onClick={() => handleInitiateOverride(user)}
                                className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-700/60 text-slate-200 border border-slate-700/50 text-[10px] font-black tracking-widest uppercase rounded-lg transition-all text-center"
                            >
                                Security Override
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 p-3 md:p-6 mx-0 md:mx-2">
            <SecurityOverrideModal 
                isOpen={isOverrideModalOpen}
                onClose={() => setIsOverrideModalOpen(false)}
                onAuthorize={handleAuthorize}
                targetName={targetUser?.fullName || ''}
            />

            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 backdrop-blur-xl rounded-2xl p-6 shadow-2xl">
                        <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
                            <UserPlus className="text-blue-500" size={24} />
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">Provision Course Officer</h3>
                        </div>
                        <form onSubmit={handleAddOfficer} className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-mono font-bold tracking-widest text-slate-400 mb-1.5">Full Name</label>
                                <input required type="text" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500/50 outline-none transition-all" value={addPayload.fullName} onChange={e => setAddPayload({...addPayload, fullName: e.target.value})} placeholder="e.g. John Doe" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono font-bold tracking-widest text-slate-400 mb-1.5">Username</label>
                                <input required type="text" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500/50 outline-none transition-all" value={addPayload.username} onChange={e => setAddPayload({...addPayload, username: e.target.value})} placeholder="e.g. jdoe" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono font-bold tracking-widest text-slate-400 mb-1.5">Email</label>
                                <input required type="email" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500/50 outline-none transition-all" value={addPayload.email} onChange={e => setAddPayload({...addPayload, email: e.target.value})} placeholder="officer@polac.edu" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono font-bold tracking-widest text-slate-400 mb-1.5">Initial Password</label>
                                <input required type="text" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-blue-500/50 outline-none transition-all" value={addPayload.password} onChange={e => setAddPayload({...addPayload, password: e.target.value})} placeholder="Secure password" />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button disabled={isAdding} type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl text-xs uppercase tracking-widest transition-all disabled:opacity-50">
                                    {isAdding ? 'Provisioning...' : 'Add Officer'}
                                </button>
                                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-6 bg-transparent hover:bg-white/5 border border-white/10 text-slate-500 font-black py-3 rounded-xl text-xs uppercase tracking-widest transition-all">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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
                        onClick={() => {
                            const self = users.find(u => u.role === UserRole.COMMANDANT || String(u.id) === String(currentUser?.id));
                            if (self) handleInitiateOverride(self);
                            else toast.error('Security profile not found in active registry.');
                        }}
                        className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-black text-[10px] uppercase tracking-widest transition-all hover:translate-y-[-2px]"
                    >
                        Update My Protocols
                    </button>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl group-hover:bg-blue-600/10 transition-colors duration-700" />
            </div>

            {/* Credential Override Form (Conditional) */}
            {isEditing && targetUser && (
                <div className="bg-[#0a0a0a] p-4 sm:p-8 rounded-2xl border border-red-500/30 shadow-2xl animate-in zoom-in-95 duration-300">
                    <div className="flex flex-wrap items-center gap-3 mb-8">
                        <UserCog size={20} className="text-red-500" />
                        <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Live Protocol Injection: {targetUser.fullName}</h3>
                    </div>
                    
                    {String(targetUser.id) === String(currentUser?.id) && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
                            <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-red-400 font-bold leading-relaxed uppercase tracking-wide">
                                WARNING: You are modifying your own administrative credentials. Ensure the new password matches the confirmation field, or you will be permanently locked out.
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="block text-[10px] font-mono font-bold tracking-widest text-slate-400 mb-1.5 ml-1">Secure Email</label>
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
                            <label className="block text-[10px] font-mono font-bold tracking-widest text-slate-400 mb-1.5 ml-1">Auth Token (Password)</label>
                            <div className="relative">
                                <Key size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input 
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-12 py-4 text-sm text-white font-mono focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 outline-none transition-all"
                                    value={editPayload.password}
                                    onChange={e => setEditPayload({...editPayload, password: e.target.value})}
                                />
                            </div>
                        </div>

                        {String(targetUser.id) === String(currentUser?.id) && (
                            <div className="space-y-2 md:col-span-2">
                                <label className="block text-[10px] font-mono font-bold tracking-widest text-slate-400 mb-1.5 ml-1">Confirm Auth Token</label>
                                <div className="relative">
                                    <Key size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input 
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-12 py-4 text-sm text-white font-mono focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 outline-none transition-all"
                                        value={editPayload.confirmPassword}
                                        onChange={e => setEditPayload({...editPayload, confirmPassword: e.target.value})}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="md:col-span-2 space-y-2">
                            <label className="block text-[10px] font-mono font-bold tracking-widest text-slate-400 mb-1.5 ml-1">Department Authority (Course Number)</label>
                            <input 
                                type="number"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-sm text-white uppercase font-bold focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 outline-none transition-all"
                                value={editPayload.courseNumber}
                                onChange={e => setEditPayload({...editPayload, courseNumber: e.target.value})}
                                placeholder="e.g. 11"
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

            {/* Strategic Personnel Registry */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-6 mt-8">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input 
                        type="text"
                        placeholder="Search officers, ID, or assignment..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white border border-slate-700 text-slate-900 pl-11 pr-4 py-3 rounded-xl backdrop-blur-md focus:ring-2 focus:ring-blue-500/50 outline-none placeholder:text-slate-500 text-sm"
                    />
                </div>
                <div className="group relative w-full md:w-auto">
                    <button 
                        onClick={() => !isCapReached && setIsAddModalOpen(true)}
                        disabled={isCapReached}
                        className={`w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${
                            isCapReached 
                            ? 'bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed opacity-50'
                            : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-900/20'
                        }`}
                    >
                        <Plus size={16} />
                        Add Course Officer
                    </button>
                    {isCapReached && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-3 py-1.5 bg-slate-800 text-slate-300 text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-slate-700">
                            Cap Reached (5/5). Use Lifecycle Engine for Change of Command.
                        </div>
                    )}
                </div>
            </div>

            {/* Active Command Roster */}
            <div className="bg-[#050505] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                <div className="p-6 bg-white/5 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Shield size={18} className="text-blue-500" />
                        <h3 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Active Command Roster</h3>
                    </div>
                    <span className="text-[10px] font-mono text-blue-500 uppercase tracking-widest bg-blue-500/10 px-2 py-1 rounded">{activeRoster.length} Active Profiles</span>
                </div>
                {renderTable(activeRoster)}
            </div>

            {/* Archived Credentials */}
            <details className="group bg-[#050505] rounded-2xl border border-white/10 overflow-hidden shadow-xl mt-6">
                <summary className="p-6 bg-slate-900/30 hover:bg-slate-900/50 cursor-pointer flex items-center justify-between transition-colors list-none outline-none">
                    <div className="flex items-center gap-3">
                        <UserCog size={18} className="text-slate-500" />
                        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Archived / Inactive Registry</h3>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{inactiveRegistry.length} Inactive Profiles</span>
                        <ChevronDown size={16} className="text-slate-500 group-open:rotate-180 transition-transform" />
                    </div>
                </summary>
                <div className="border-t border-white/5">
                    {renderTable(inactiveRegistry)}
                </div>
            </details>

            {/* Tactical Backdrop */}
            <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-center gap-3">
                <AlertTriangle size={14} className="text-emerald-500 shrink-0" />
                <p className="text-[9px] text-emerald-500/80 leading-relaxed font-bold uppercase tracking-tight">
                    Encrypted Core Link Active: Modifying any credential here initiates an instant global override of user access rights.
                </p>
            </div>
        </div>
    );
};
