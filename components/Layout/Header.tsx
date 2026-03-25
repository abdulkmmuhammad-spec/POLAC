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
        <header className="bg-blue-900 border-b border-white/10 h-20 flex items-center justify-between px-4 md:px-8 shrink-0 relative z-30 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            <div className="flex items-center gap-1 md:gap-4 min-w-0">
                {onMenuClick && (
                    <button
                        onClick={onMenuClick}
                        className="p-2 md:hidden text-blue-200 hover:bg-white/5 rounded-md transition-colors shrink-0 border border-transparent hover:border-white/5"
                    >
                        <Menu size={24} />
                    </button>
                )}
                <div className="flex flex-col">
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] leading-none mb-1">Command Control</p>
                    <h2 className="text-sm sm:text-base md:text-xl font-black text-white uppercase tracking-tight leading-tight">{title}</h2>
                </div>
                <span className="hidden sm:inline-block px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[9px] font-black rounded border border-blue-400/20 shrink-0 uppercase tracking-widest ml-2">Secure</span>
            </div>

            <div className="flex items-center gap-1 md:gap-4 shrink-0">
                {/* Notification Bell */}
                <button
                    onClick={handleOpenDrawer}
                    className="p-2.5 rounded-md transition-all relative text-blue-200 hover:bg-white/5 hover:border-white/10 border border-transparent"
                >
                    <Bell size={18} />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.6)] animate-pulse" />
                    )}
                </button>

                {showRefresh && (
                    <button
                        onClick={() => refreshData()}
                        className={`p-2.5 text-blue-200 hover:bg-white/5 rounded-md transition-colors border border-transparent hover:border-white/10 ${isDataLoading ? 'animate-spin' : ''}`}
                    >
                        <RefreshCcw size={18} />
                    </button>
                )}

                <div className="h-10 w-[1px] bg-white/10 mx-1 md:mx-2"></div>

                <div
                    onClick={onProfileClick}
                    className={`flex items-center gap-1 md:gap-4 ${onProfileClick ? 'cursor-pointer group hover:bg-white/5 p-1 md:px-3 md:py-2 rounded-md border border-transparent hover:border-white/10 transition-all' : ''}`}
                    title={onProfileClick ? 'Open System Settings' : ''}
                >
                    <div className="text-right hidden md:block">
                        <p className="text-[11px] font-black text-white uppercase tracking-wider group-hover:text-blue-400 transition-colors uppercase">{currentUser?.fullName}</p>
                        <p className="text-[9px] text-blue-400/60 font-mono uppercase tracking-widest">{currentUser?.role === 'commandant' ? 'Administrative Lead' : 'Service Officer'}</p>
                    </div>
                    <div className="w-8 h-8 md:w-9 md:h-9 shrink-0 bg-blue-500/10 rounded border border-blue-400/30 flex items-center justify-center text-blue-400 font-black shadow-[inset_0_0_10px_rgba(59,130,246,0.1)] text-xs md:text-sm">
                        {(currentUser?.fullName || 'U').charAt(0)}
                    </div>
                </div>
                <button onClick={logout} className="hidden md:block p-2 text-blue-100/30 hover:text-rose-400 transition-colors" title="Sign Out">
                    <LogOut size={18} />
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
