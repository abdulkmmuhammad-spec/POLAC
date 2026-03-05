import React, { useState } from 'react';
import { RefreshCcw, LogOut, Bell, History, FileText, User as UserIcon, Trash2, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useParade } from '../../context/ParadeContext';
import { dbService } from '../../services/dbService';

interface HeaderProps {
    title: string;
    showRefresh?: boolean;
    onProfileClick?: () => void;
    onMenuClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, showRefresh = true, onProfileClick, onMenuClick }) => {
    const { currentUser, logout } = useAuth();
    const { isDataLoading, refreshData, notifications } = useParade();
    const [showNotifications, setShowNotifications] = useState(false);

    const handleClearLogs = async () => {
        if (window.confirm('Clear all activity logs?')) {
            await dbService.clearNotifications();
            refreshData();
        }
    };

    return (
        <header className="bg-white border-b border-slate-200 h-20 flex items-center justify-between px-4 md:px-8 shrink-0 relative">
            <div className="flex items-center gap-3">
                {onMenuClick && (
                    <button
                        onClick={onMenuClick}
                        className="p-2 md:hidden text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <Menu size={24} />
                    </button>
                )}
                <h2 className="text-lg md:text-xl font-bold text-slate-800 capitalize truncate max-w-[150px] md:max-w-none">{title}</h2>
                <span className="hidden sm:inline-block px-2 py-0.5 bg-blue-100 text-blue-600 text-[10px] font-black rounded-full border border-blue-200">V2</span>
            </div>

            <div className="flex items-center space-x-4">
                {/* Notification Bell */}
                <div className="relative">
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className={`p-2 rounded-full transition-all relative ${showNotifications ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}
                    >
                        <Bell size={20} />
                        {notifications.some(n => !n.read) && (
                            <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
                        )}
                    </button>

                    {showNotifications && (
                        <>
                            {/* Backdrop */}
                            <div
                                className="fixed inset-0 z-[60] bg-slate-900/20 backdrop-blur-sm transition-opacity"
                                onClick={() => setShowNotifications(false)}
                            ></div>

                            {/* Notification Container */}
                            <div className="fixed inset-x-4 top-[10%] bottom-[10%] md:absolute md:inset-auto md:right-0 md:top-full md:mt-3 md:w-80 md:bottom-auto bg-white rounded-2xl shadow-2xl border border-slate-100 z-[70] overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right flex flex-col">
                                <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50 shrink-0">
                                    <h4 className="font-bold text-slate-800 text-sm">Activity Logs</h4>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleClearLogs}
                                            className="p-2 text-slate-400 hover:text-rose-600 transition-colors rounded-lg hover:bg-rose-50"
                                            title="Clear Logs"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => setShowNotifications(false)}
                                            className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100 md:hidden"
                                        >
                                            <Menu size={16} className="rotate-45" /> {/* Using Menu as a quick close X if needed, or just standard button */}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                                    {notifications.length === 0 ? (
                                        <div className="p-12 text-center">
                                            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                                <Bell size={24} className="text-slate-200" />
                                            </div>
                                            <p className="text-xs text-slate-400 italic">No recent activity found</p>
                                        </div>
                                    ) : (
                                        notifications.map(n => (
                                            <div key={n.id} className="p-4 hover:bg-slate-50 transition-colors cursor-default">
                                                <div className="flex gap-4">
                                                    <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${n.type === 'profile_update' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                        {n.type === 'profile_update' ? <UserIcon size={18} /> : <FileText size={18} />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-slate-800 truncate">{n.title}</p>
                                                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-3 leading-relaxed">{n.content}</p>
                                                        <div className="flex items-center gap-2 mt-3">
                                                            <History size={10} className="text-slate-400" />
                                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{new Date(n.timestamp).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="p-3 bg-slate-50/50 border-t border-slate-50 text-center md:hidden">
                                    <button
                                        onClick={() => setShowNotifications(false)}
                                        className="w-full py-2 text-sm font-bold text-slate-600 hover:text-slate-800"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {showRefresh && (
                    <button
                        onClick={refreshData}
                        className={`p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors ${isDataLoading ? 'animate-spin' : ''}`}
                    >
                        <RefreshCcw size={20} />
                    </button>
                )}

                <div className="h-8 w-[1px] bg-slate-200 mx-2"></div>

                <div
                    onClick={onProfileClick}
                    className={`flex items-center space-x-3 ${onProfileClick ? 'cursor-pointer group hover:bg-slate-50 p-2 rounded-xl border border-transparent hover:border-slate-100 transition-all' : ''}`}
                    title={onProfileClick ? 'Open System Settings' : ''}
                >
                    <div className="text-right hidden md:block">
                        <p className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{currentUser?.fullName}</p>
                        <p className="text-xs text-slate-500">{currentUser?.role === 'commandant' ? 'Administrator' : 'Course Officer'}</p>
                    </div>
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold border-2 border-white shadow-sm group-hover:shadow-md transition-all">
                        {currentUser?.fullName.charAt(0)}
                    </div>
                </div>
                <button onClick={logout} className="hidden md:block p-2 text-slate-400 hover:text-red-600 transition-colors" title="Sign Out">
                    <LogOut size={20} />
                </button>
            </div>
        </header>
    );
};
