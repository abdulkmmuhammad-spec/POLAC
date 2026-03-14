import React, { useState, useEffect } from 'react';
import { RefreshCcw, LogOut, Bell, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useParade } from '../../context/ParadeContext';
import { UserRole } from '../../types';
import { dbService } from '../../services/dbService';
import { ConfirmationModal } from './ConfirmationModal';
import { NotificationDrawer } from './NotificationDrawer';

interface HeaderProps {
    title: string;
    showRefresh?: boolean;
    onProfileClick?: () => void;
    onMenuClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, showRefresh = true, onProfileClick, onMenuClick }) => {
    const { currentUser, logout } = useAuth();
    const { isDataLoading, refreshData, notifications, markNotificationRead, markAllAsRead } = useParade();
    const [showDrawer, setShowDrawer] = useState(false);
    const [showConfirmClear, setShowConfirmClear] = useState(false);

    // Determine if user is commandant (sees all) or course officer (sees only own)
    const isCommandant = currentUser?.role === UserRole.COMMANDANT;
    const officerNameFilter = !isCommandant ? currentUser?.fullName : undefined;

    // Filter notifications for display - course officers only see their own
    const displayNotifications = isCommandant
        ? notifications
        : notifications.filter(n =>
            n.officerName?.toLowerCase() === currentUser?.fullName?.toLowerCase() ||
            !n.officerName
        );

    const unreadCount = displayNotifications.filter(n => !n.read).length;

    const handleOpenDrawer = () => {
        setShowDrawer(true);
        // Load notifications with appropriate filter based on role
        refreshData(officerNameFilter);
    };

    const handleClearLogs = async () => {
        try {
            await dbService.clearNotifications();
            refreshData(officerNameFilter);
        } catch (error) {
            console.error('Failed to clear notifications:', error);
        } finally {
            setShowConfirmClear(false);
        }
    };

    return (
        <header className="bg-white border-b border-slate-200 h-20 flex items-center justify-between px-2 md:px-8 shrink-0 relative">
            <div className="flex items-center gap-1 md:gap-3 min-w-0">
                {onMenuClick && (
                    <button
                        onClick={onMenuClick}
                        className="p-1 md:hidden text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                    >
                        <Menu size={24} />
                    </button>
                )}
                <h2 className="text-sm sm:text-base md:text-xl font-bold text-slate-800 capitalize leading-tight">{title}</h2>
                <span className="hidden sm:inline-block px-2 py-0.5 bg-blue-100 text-blue-600 text-[10px] font-black rounded-full border border-blue-200 shrink-0">V2</span>
            </div>

            <div className="flex items-center gap-1 md:gap-4 shrink-0">
                {/* Notification Bell */}
                <button
                    onClick={handleOpenDrawer}
                    className="p-2 rounded-full transition-all relative text-slate-400 hover:bg-slate-50 hover:text-blue-600"
                >
                    <Bell size={20} />
                    {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-rose-500 rounded-full border-2 border-white flex items-center justify-center">
                            <span className="text-[9px] font-black text-white leading-none">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        </span>
                    )}
                </button>

                {showRefresh && (
                    <button
                        onClick={refreshData}
                        className={`p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors ${isDataLoading ? 'animate-spin' : ''}`}
                    >
                        <RefreshCcw size={20} />
                    </button>
                )}

                <div className="h-8 w-[1px] bg-slate-200 mx-1 md:mx-2"></div>

                <div
                    onClick={onProfileClick}
                    className={`flex items-center gap-1 md:gap-3 ${onProfileClick ? 'cursor-pointer group hover:bg-slate-50 p-1 md:p-2 rounded-xl border border-transparent hover:border-slate-100 transition-all' : ''}`}
                    title={onProfileClick ? 'Open System Settings' : ''}
                >
                    <div className="text-right hidden md:block">
                        <p className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{currentUser?.fullName}</p>
                        <p className="text-xs text-slate-500">{currentUser?.role === 'commandant' ? 'Administrator' : 'Course Officer'}</p>
                    </div>
                    <div className="w-8 h-8 md:w-10 md:h-10 shrink-0 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold border-2 border-white shadow-sm group-hover:shadow-md transition-all text-xs md:text-base">
                        {currentUser?.fullName.charAt(0)}
                    </div>
                </div>
                <button onClick={logout} className="hidden md:block p-2 text-slate-400 hover:text-red-600 transition-colors" title="Sign Out">
                    <LogOut size={20} />
                </button>
            </div>

            {/* ── Notification Drawer ── */}
            <NotificationDrawer
                isOpen={showDrawer}
                onClose={() => setShowDrawer(false)}
                notifications={displayNotifications}
                onMarkRead={markNotificationRead}
                onMarkAllRead={markAllAsRead}
                onClearAll={() => {
                    setShowDrawer(false);
                    setShowConfirmClear(true);
                }}
            />

            {/* ── Clear Confirmation ── */}
            <ConfirmationModal
                isOpen={showConfirmClear}
                onClose={() => setShowConfirmClear(false)}
                onConfirm={handleClearLogs}
                title="Clear Activity Logs"
                message="Are you sure you want to permanently delete all recent activity history? This action cannot be undone."
                confirmText="Clear All"
                type="danger"
            />
        </header>
    );
};
