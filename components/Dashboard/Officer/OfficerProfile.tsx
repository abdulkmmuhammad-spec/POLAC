import React, { useState } from 'react';
import { Users, Info, Settings, X, User, BookOpen, Image as ImageIcon, Hash, Save } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useParade } from '../../../context/ParadeContext';
import { dbService } from '../../../services/dbService';
import { formatRC, calculateCurrentLevel } from '../../../utils/rcHelpers';
import { toast } from 'react-hot-toast';
import AtRiskCadetsWidget from '../Commandant/AtRiskCadetsWidget';
import { User as UserType } from '../../../types';

export const OfficerProfile: React.FC = () => {
    const { currentUser, setCurrentUser } = useAuth();
    const { isDataLoading, refreshData, activeRC } = useParade();
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Draft form state isolated from AuthContext
    const [editForm, setEditForm] = useState<{
        fullName: string;
        courseName: string;
        totalCadets: number;
        profileImage: string;
        courseNumber: number | '';
    }>({
        fullName: '',
        courseName: '',
        totalCadets: 0,
        profileImage: '',
        courseNumber: ''
    });

    const handleOpenEdit = () => {
        if (!currentUser) return;
        setEditForm({
            fullName: currentUser.fullName || '',
            courseName: currentUser.courseName || '',
            totalCadets: currentUser.totalCadets || 0,
            profileImage: currentUser.profileImage || '',
            courseNumber: currentUser.courseNumber || ''
        });
        setIsModalOpen(true);
    };

    const handleUpdate = async () => {
        if (!currentUser) return;
        
        const updatedUser: UserType = {
            ...currentUser,
            fullName: editForm.fullName.trim() || currentUser.fullName,
            courseName: editForm.courseName.trim() || undefined,
            totalCadets: Number(editForm.totalCadets) || 0,
            profileImage: editForm.profileImage.trim() || undefined,
            courseNumber: editForm.courseNumber !== '' ? Number(editForm.courseNumber) : undefined
        };

        try {
            await dbService.updateUser(updatedUser);
            setCurrentUser(updatedUser);
            localStorage.setItem('polac_session', JSON.stringify(updatedUser));
            setIsModalOpen(false);
            await refreshData();
            toast.success('Profile settings updated successfully.');
        } catch (error) {
            toast.error('Update failed. Please try again.');
        }
    };

    if (!currentUser) return null;

    const courseNumber = currentUser.courseNumber;
    const yearLevel = courseNumber ? calculateCurrentLevel(courseNumber, activeRC) : currentUser.yearGroup;
    const rcLabel = courseNumber ? formatRC(courseNumber) : currentUser.courseName;

    return (
        <div className="space-y-10">
            <div className="bg-blue-900/5 border-l-4 border-blue-900 p-4 rounded-r-xl">
                <div className="flex items-start space-x-3">
                    <Info className="text-blue-900 mt-1 shrink-0" size={20} />
                    <div>
                        <h4 className="text-sm font-bold text-blue-900 uppercase tracking-wide">Command Directive</h4>
                        <p className="text-sm text-blue-800/80 italic font-medium">"Precision in cadet accountability is the hallmark of discipline. Ensure absolute accuracy in your daily returns. Errors reflect poorly on command capability and will not be tolerated. - Office of the Commandant"</p>
                    </div>
                </div>
            </div>

            <AtRiskCadetsWidget courseNumber={currentUser.courseNumber || undefined} />

            <div className="bg-white p-4 md:p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center space-y-6 md:space-y-0 md:space-x-8">
                <div className="w-32 h-32 bg-blue-100 rounded-3xl border-4 border-white shadow-xl flex items-center justify-center text-blue-600 text-4xl font-bold overflow-hidden relative group shrink-0">
                    {currentUser.profileImage ? (
                        <img src={currentUser.profileImage} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                        <span>{currentUser.fullName.charAt(0)}</span>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button className="text-white text-xs font-black tracking-widest uppercase bg-blue-600/80 px-3 py-1.5 rounded-lg backdrop-blur-sm hover:bg-blue-600" onClick={handleOpenEdit}>
                            EDIT
                        </button>
                    </div>
                </div>
                <div className="text-center md:text-left flex-1">
                    <h2 className="text-2xl font-bold text-slate-800">{currentUser.fullName}</h2>
                    <div className="flex flex-wrap gap-2 mt-1 justify-center md:justify-start">
                        {rcLabel && (
                            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">
                                {rcLabel}
                            </span>
                        )}
                        {yearLevel && (
                            <span className="bg-slate-100 text-slate-700 text-xs font-bold px-3 py-1 rounded-full">
                                YEAR {yearLevel}
                            </span>
                        )}
                    </div>
                    <div className="mt-4 inline-flex items-center space-x-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-xs font-bold">
                        <span className="flex items-center gap-1.5"><Users size={14} /> <span>{currentUser.totalCadets} Total Cadets Under Management</span></span>
                    </div>
                </div>
                <button
                    onClick={handleOpenEdit}
                    className="flex items-center space-x-2 bg-white border-2 border-slate-200 hover:border-blue-500 hover:text-blue-600 px-6 py-3 rounded-xl font-bold text-slate-600 text-sm transition-all shadow-sm group"
                >
                    <Settings size={18} className="text-slate-400 group-hover:text-blue-500 group-hover:rotate-45 transition-transform" />
                    <span>Profile Settings</span>
                </button>
            </div>

            {/* Profile Settings Centered Modal Overlay */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-slate-900 text-white w-full max-w-2xl rounded-3xl border border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                                    <Settings size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white">Profile Configuration</h3>
                                    <p className="text-xs text-slate-400">Manage officer credentials and course details</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Form Content */}
                        <div className="p-6 md:p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center space-x-1.5">
                                        <User size={14} className="text-blue-400" />
                                        <span>Full Name</span>
                                    </label>
                                    <input
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-white transition-all font-medium"
                                        value={editForm.fullName}
                                        onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                                        placeholder="Officer Full Name"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center space-x-1.5">
                                        <BookOpen size={14} className="text-blue-400" />
                                        <span>Course Name</span>
                                    </label>
                                    <input
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-white transition-all font-medium"
                                        value={editForm.courseName}
                                        onChange={(e) => setEditForm({ ...editForm, courseName: e.target.value })}
                                        placeholder="e.g. REGULAR COURSE 9"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center space-x-1.5">
                                        <Users size={14} className="text-blue-400" />
                                        <span>Total Cadets Under Management</span>
                                    </label>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-white transition-all font-medium"
                                        value={editForm.totalCadets}
                                        onChange={(e) => setEditForm({ ...editForm, totalCadets: parseInt(e.target.value) || 0 })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center space-x-1.5">
                                        <Hash size={14} className="text-blue-400" />
                                        <span>Regular Course Number</span>
                                    </label>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-white transition-all font-bold"
                                        placeholder="e.g. 12"
                                        value={editForm.courseNumber}
                                        onChange={(e) => setEditForm({ ...editForm, courseNumber: e.target.value === '' ? '' : parseInt(e.target.value) || 0 })}
                                    />
                                    <p className="text-[11px] text-slate-500">Used for automatic year level calculation.</p>
                                </div>

                                <div className="space-y-2 sm:col-span-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center space-x-1.5">
                                        <ImageIcon size={14} className="text-blue-400" />
                                        <span>Profile Image URL</span>
                                    </label>
                                    <input
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-white transition-all font-medium"
                                        placeholder="https://..."
                                        value={editForm.profileImage}
                                        onChange={(e) => setEditForm({ ...editForm, profileImage: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-6 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end space-x-3">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdate}
                                disabled={isDataLoading}
                                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50"
                            >
                                <Save size={16} />
                                <span>{isDataLoading ? 'Saving...' : 'Save Changes'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
