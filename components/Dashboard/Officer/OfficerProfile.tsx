import React, { useState } from 'react';
import { Users, Info } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useParade } from '../../../context/ParadeContext';
import { dbService } from '../../../services/dbService';
import { formatRC, calculateCurrentLevel } from '../../../utils/rcHelpers';
import { toast } from 'react-hot-toast';

export const OfficerProfile: React.FC = () => {
    const { currentUser, setCurrentUser } = useAuth();
    const { isDataLoading, refreshData, activeRC } = useParade();
    const [showEdit, setShowEdit] = useState(false);

    const handleUpdate = async () => {
        if (!currentUser) return;
        try {
            await dbService.updateUser(currentUser);
            localStorage.setItem('polac_session', JSON.stringify(currentUser));
            setShowEdit(false);
            await refreshData();
            toast.success('Profile updated.');
        } catch (error) {
            toast.error('Update failed.');
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
                    <Info className="text-blue-900 mt-1" size={20} />
                    <div>
                        <h4 className="text-sm font-bold text-blue-900 uppercase tracking-wide">Command Directive</h4>
                        <p className="text-sm text-blue-800/80 italic font-medium">"Precision in personnel accountability is the hallmark of discipline. Ensure absolute accuracy in your daily returns. Errors reflect poorly on command capability and will not be tolerated. - Office of the Commandant"</p>
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 md:p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center space-y-6 md:space-y-0 md:space-x-8">
                <div className="w-32 h-32 bg-blue-100 rounded-3xl border-4 border-white shadow-xl flex items-center justify-center text-blue-600 text-4xl font-bold overflow-hidden relative group">
                    {currentUser.profileImage ? (
                        <img src={currentUser.profileImage} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                        <span>{currentUser.fullName.charAt(0)}</span>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button className="text-white text-xs font-bold" onClick={() => setShowEdit(true)}>EDIT</button>
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
                                Year {yearLevel}
                            </span>
                        )}
                    </div>
                    <div className="mt-4 inline-flex items-center space-x-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-xs font-bold">
                        <span className="flex items-center gap-1"><Users size={14} /> <span>{currentUser.totalCadets} Total Cadets Under Management</span></span>
                    </div>
                </div>
                <button
                    onClick={() => setShowEdit(!showEdit)}
                    className="bg-white border-2 border-slate-200 hover:border-blue-500 px-6 py-3 rounded-xl font-bold text-slate-600 text-sm transition-all shadow-sm"
                >
                    {showEdit ? 'Cancel' : 'Profile Settings'}
                </button>
            </div>

            {showEdit && (
                <div className="bg-slate-800 text-white p-4 md:p-8 rounded-3xl space-y-6 animate-in fade-in duration-300">
                    <h3 className="text-lg font-bold">Edit Profile Configuration</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Full Name</label>
                            <input
                                className="w-full bg-slate-700 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500"
                                value={currentUser.fullName}
                                onChange={(e) => setCurrentUser({ ...currentUser, fullName: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Course Name</label>
                            <input
                                className="w-full bg-slate-700 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500"
                                value={currentUser.courseName || ''}
                                onChange={(e) => setCurrentUser({ ...currentUser, courseName: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Cadets</label>
                            <input
                                type="number"
                                className="w-full bg-slate-700 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500"
                                value={currentUser.totalCadets || 0}
                                onChange={(e) => setCurrentUser({ ...currentUser, totalCadets: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Profile URL</label>
                            <input
                                className="w-full bg-slate-700 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500"
                                placeholder="https://..."
                                value={currentUser.profileImage || ''}
                                onChange={(e) => setCurrentUser({ ...currentUser, profileImage: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest text-blue-400">Regular Course Number</label>
                            <input
                                type="number"
                                className="w-full bg-slate-700 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 font-bold"
                                placeholder="e.g. 12"
                                value={currentUser.courseNumber || ''}
                                onChange={(e) => setCurrentUser({ ...currentUser, courseNumber: parseInt(e.target.value) || 0 })}
                            />
                            <p className="text-[10px] text-slate-500">Determines year level calculation.</p>
                        </div>
                    </div>
                    <div className="flex justify-end pt-4">
                        <button
                            onClick={handleUpdate}
                            disabled={isDataLoading}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg"
                        >
                            {isDataLoading ? 'Updating...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
