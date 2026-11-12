import React, { useState, useRef, useEffect } from 'react';
import { RefreshCcw, LogOut, Bell, Menu, Volume2, VolumeX, Radio, CheckCircle2 } from 'lucide-react';
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
    const [showSystemStatus, setShowSystemStatus] = useState(false);
    const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const statusPopoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (statusPopoverRef.current && !statusPopoverRef.current.contains(event.target as Node)) {
                setShowSystemStatus(false);
            }
        };
        if (showSystemStatus) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showSystemStatus]);

    // Determine if user is commandant (sees all) or course officer (sees only own)
    const isCommandant = currentUser?.role === UserRole.COMMANDANT;
    const officerNameFilter = !isCommandant ? currentUser?.fullName : undefined;

    // Filter notifications for display - course officers see notifications matching their name or assigned course
    const displayNotifications = isCommandant
        ? notifications
        : notifications.filter(n =>
            n.officerName?.toLowerCase() === currentUser?.fullName?.toLowerCase() ||
            (currentUser?.courseNumber && n.courseNumber && Number(n.courseNumber) === Number(currentUser.courseNumber)) ||
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
        if (isAudioArmed) {
            setIsAudioArmed(false);
        } else {
            audioService.unlock().then(() => {
                setIsAudioArmed(true);
                audioService.play('success');
            });
        }
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
            <div className="flex items-center gap-2 md:gap-4 min-w-0">
                {onMenuClick && (
                    <button
                        onClick={onMenuClick}
                        className="p-2 md:hidden text-blue-200 hover:bg-white/5 rounded-md transition-colors shrink-0 border border-transparent hover:border-white/5"
                    >
                        <Menu size={24} />
                    </button>
                )}
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex w-8 h-8 sm:w-9 sm:h-9 bg-white/10 rounded-lg border border-white/10 items-center justify-center shrink-0 shadow-sm overflow-hidden">
                        <img src="/logo.png" alt="POLAC Logo" className="w-[82%] h-[82%] object-contain block" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] leading-none mb-1">Command Control</p>
                        <h2 className="text-sm sm:text-base md:text-xl font-black text-white uppercase tracking-tight leading-tight truncate">{title}</h2>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
                {/* Collapsed System Status Popover (Relocated Live Auto-Sync & Audio State) */}
                <div className="relative" ref={statusPopoverRef}>
                    <button
                        type="button"
                        onClick={() => setShowSystemStatus(prev => !prev)}
                        className="p-2.5 rounded-xl transition-all relative text-blue-200 hover:text-white hover:bg-white/10 border border-white/5 bg-white/5 flex items-center justify-center"
                        title="System Telemetry & Audio Status"
                        aria-label="System Telemetry & Audio Status"
                    >
                        <Radio size={18} />
                        <span
                            className={`absolute top-2 right-2 w-2 h-2 rounded-full border border-blue-900 ${
                                isAudioArmed ? 'bg-emerald-400' : 'bg-blue-400'
                            }`}
                        />
                    </button>

                    <AnimatePresence>
                        {showSystemStatus && (
                            <motion.div
                                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                                transition={{ duration: 0.15 }}
                                className="fixed inset-x-3 top-[5.25rem] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2.5 sm:w-72 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700/80 p-4 z-50 space-y-3.5"
                            >
                                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                        System Telemetry
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-black rounded-full border border-emerald-500/20 uppercase tracking-widest">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        Live Auto-Sync
                                    </span>
                                </div>

                                <div className="space-y-2.5">
                                    <div className="flex items-center justify-between bg-slate-800/70 px-3 py-2.5 rounded-xl border border-slate-700/60">
                                        <div className="flex items-center gap-2.5">
                                            <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                                            <div>
                                                <p className="text-[11px] font-bold text-slate-200 leading-none">
                                                    Realtime Stream
                                                </p>
                                                <p className="text-[9px] text-slate-400 mt-1">
                                                    WebSocket + 20s resilient sync
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase">
                                            Active
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between bg-slate-800/70 px-3 py-2.5 rounded-xl border border-slate-700/60">
                                        <div className="flex items-center gap-2.5">
                                            {isAudioArmed ? (
                                                <Volume2 size={15} className="text-emerald-400 shrink-0" />
                                            ) : (
                                                <VolumeX size={15} className="text-slate-400 shrink-0" />
                                            )}
                                            <div>
                                                <p className="text-[11px] font-bold text-slate-200 leading-none">
                                                    Acoustic Alerts
                                                </p>
                                                <p className="text-[9px] text-slate-400 mt-1">
                                                    {isAudioArmed ? 'Tactical chimes armed' : 'Audio chimes muted'}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={toggleAudio}
                                            className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
                                                isAudioArmed
                                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                                                    : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                                            }`}
                                        >
                                            {isAudioArmed ? 'Armed' : 'Muted'}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

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
