import React, { useState, useEffect } from 'react';
import { RefreshCcw, LogOut, Bell, Menu, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useParade } from '../../context/ParadeContext';
import { UserRole, Notification } from '../../types';
import { dbService } from '../../services/dbService';
import { ConfirmationModal } from './ConfirmationModal';
import { NotificationDrawer } from './NotificationDrawer';
import { NotificationPreviewModal } from './NotificationPreviewModal';
import { audioService } from '../../services/audioService';

interface HeaderProps {
    title: string;
    showRefresh?: boolean;
    onProfileClick?: () => void;
    onMenuClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, showRefresh = true, onProfileClick, onMenuClick }) => {
    const navigate = useNavigate();
    const { currentUser, logout } = useAuth();
    const { isDataLoading, refreshData, notifications, markNotificationRead, markAllAsRead } = useParade();
    const [showDrawer, setShowDrawer] = useState(false);
    const [showConfirmClear, setShowConfirmClear] = useState(false);
    const [isAudioArmed, setIsAudioArmed] = useState(false);
    const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);

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
        // Unlock audio on first interaction if not already armed
        if (!isAudioArmed) {
            audioService.unlock().then(() => setIsAudioArmed(true));
        }
        setShowDrawer(true);
        refreshData(officerNameFilter);
    };

    const toggleAudio = (e: React.MouseEvent) => {
        e.stopPropagation();
        audioService.unlock().then(() => {
            setIsAudioArmed(true);
            audioService.play('success');
        });
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
        <header className="bg-blue-900 border-b border-white/10 h-20 flex items-center justify-between px-4 md:px-8 shrink-0 relative z-30 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
            <div className="flex items-center gap-1 md:gap-4 min-w-0">
                {onMenuClick && (
                    <button
                        onClick={onMenuClick}
                        className="p-2 md:hidden text-blue-200 hover:bg-white/5 rounded-md transition-colors shrink-0 border border-transparent hover:border-white/5"
                    >
                        <Menu size={24} />
                    </button>
                )}
                <div className="flex items-center gap-3">
                    <div className="flex w-8 h-8 sm:w-9 sm:h-9 bg-white/10 rounded-lg border border-white/10 flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
                        <img src="/logo.png" alt="POLAC Logo" className="w-[82%] h-[82%] object-contain block" />
                    </div>
                    <div className="flex flex-col">
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] leading-none mb-1">Command Control</p>
                        <h2 className="text-sm sm:text-base md:text-xl font-black text-white uppercase tracking-tight leading-tight">{title}</h2>
                    </div>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-[9px] font-black rounded-full border border-emerald-500/20 shrink-0 uppercase tracking-widest ml-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    LIVE AUTO-SYNC
                </span>
            </div>

            <div className="flex items-center gap-1 md:gap-4 shrink-0">
                {/* Audio Status Guard */}
                <button
                    onClick={toggleAudio}
                    className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full transition-all border ${
                        isAudioArmed 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-400 animate-pulse'
                    }`}
                    title={isAudioArmed ? 'Audio Alerts Armed' : 'Click to Arm Audio Alerts'}
                >
                    {isAudioArmed ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    <span className="text-[9px] font-black uppercase tracking-wider">
                        {isAudioArmed ? 'Armed' : 'Muted'}
                    </span>
                </button>

                {/* Notification Bell */}
                <button
                    onClick={handleOpenDrawer}
                    className="p-2.5 rounded-xl transition-all relative text-blue-200 hover:bg-white/10 hover:border-white/20 border border-white/5 bg-white/5 group"
                >
                    <motion.div
                        animate={{ 
                            rotate: unreadCount > 0 ? [0, -15, 15, -15, 15, 0] : 0,
                            scale: unreadCount > 0 ? [1, 1.1, 1] : 1
                        }}
                        transition={{ 
                            duration: 0.5, 
                            repeat: unreadCount > 0 ? Infinity : 0, 
                            repeatDelay: 4 
                        }}
                    >
                        <Bell size={20} className="group-hover:text-white transition-colors" />
                    </motion.div>
                    <AnimatePresence>
                        {unreadCount > 0 && (
                            <motion.span 
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0 }}
                                className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full shadow-[0_0_12px_rgba(244,63,94,0.8)] border-2 border-blue-900"
                            />
                        )}
                    </AnimatePresence>
                </button>

                {showRefresh && (
                    <button
                        onClick={() => refreshData(officerNameFilter)}
                        className={`p-2.5 text-blue-200 hover:bg-white/5 rounded-md transition-colors border border-transparent hover:border-white/10 ${isDataLoading ? 'animate-spin' : ''}`}
                    >
                        <RefreshCcw size={18} />
                    </button>
                )}

                <div className="h-10 w-[1px] bg-white/10 mx-1 md:mx-2"></div>

                <div
                    onClick={onProfileClick}
                    className={`flex items-center gap-1 md:gap-4 ${onProfileClick ? 'cursor-pointer group hover:bg-white/5 p-1 md:px-3 md:py-2 rounded-md border border-transparent hover:border-white/10 transition-all' : ''}`}
                >
                    <div className="text-right hidden md:block">
                        <p className="text-[11px] font-black text-white uppercase tracking-wider group-hover:text-blue-400 transition-colors">{currentUser?.fullName}</p>
                        <p className="text-[9px] text-blue-400/60 font-mono uppercase tracking-widest leading-none mt-0.5">{currentUser?.role === 'commandant' ? 'Commandant' : 'Course Officer'}</p>
                    </div>
                    <div className="w-9 h-9 shrink-0 bg-blue-600/20 rounded-xl border border-blue-400/30 flex items-center justify-center text-blue-400 font-black shadow-[inset_0_0_15px_rgba(59,130,246,0.1)] text-sm">
                        {(currentUser?.fullName || 'U').charAt(0)}
                    </div>
                </div>
                <button onClick={logout} className="hidden md:block p-2 text-white/20 hover:text-rose-400 transition-colors" title="Sign Out">
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
                onSelectNotification={(n) => {
                    setSelectedNotification(n);
                    markNotificationRead(n.id);
                    setShowDrawer(false);
                    setShowPreviewModal(true);
                }}
                onClearAll={() => {
                    setShowDrawer(false);
                    setShowConfirmClear(true);
                }}
            />

            {/* ── Actionable Intelligence Preview Modal ── */}
            <NotificationPreviewModal
                notification={selectedNotification}
                isOpen={showPreviewModal}
                onClose={() => setShowPreviewModal(false)}
                onAcknowledge={(id) => markNotificationRead(id)}
                onNavigate={(route, state) => {
                    navigate(route, { state });
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
