import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCcw, LogOut, Bell, Volume2, VolumeX, Radio, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useParade } from '../../context/ParadeContext';
import { UserRole, Notification } from '../../types';
import { isExecutiveCommand } from '../../utils/commandHierarchy';
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

export const Header: React.FC<HeaderProps> = ({ title, showRefresh = true, onProfileClick }) => {
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

    // Determine if user is commandant/admin (sees global) or course officer (sees only own)
    const isGlobalViewer =
        currentUser?.role === UserRole.COMMANDANT || currentUser?.role === UserRole.ADMIN;
    const officerNameFilter = !isGlobalViewer ? currentUser?.fullName : undefined;

    // Filter notifications for display
    const displayNotifications = isGlobalViewer
        ? notifications.filter(n => {
              if (currentUser?.role === UserRole.ADMIN) {
                  return !['commandant_remark', 'remark_response', 'remark_resolved'].includes(n.type);
              }
              if (currentUser?.role === UserRole.COMMANDANT) {
                  if (isExecutiveCommand(currentUser)) {
                      return ['command_report', 'parade_submission', 'parade_update'].includes(n.type);
                  }
                  return [
                      'parade_submission',
                      'parade_update',
                      'commandant_remark',
                      'remark_response',
                      'remark_resolved',
                      'sickbay_verification',
                      'command_report'
                  ].includes(n.type);
              }
              return true;
          })
        : notifications.filter(
              n =>
                  n.officerName?.toLowerCase() === currentUser?.fullName?.toLowerCase() ||
                  (currentUser?.courseNumber &&
                      n.courseNumber &&
                      Number(n.courseNumber) === Number(currentUser.courseNumber)) ||
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
        <header className="sticky top-0 z-30 shrink-0 bg-blue-900/95 backdrop-blur-md border-b border-white/10 pt-[env(safe-area-inset-top)] shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
            <div className="h-16 md:h-20 flex items-center justify-between px-3.5 sm:px-5 md:px-8">
            <div className="flex items-center gap-2.5 md:gap-4 min-w-0">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div className="flex w-8 h-8 sm:w-9 sm:h-9 bg-white/10 rounded-lg border border-white/10 items-center justify-center shrink-0 shadow-sm overflow-hidden">
                        <img src="/logo.png" alt="POLAC Logo" className="w-[82%] h-[82%] object-contain block" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <p className="text-[11px] font-bold text-blue-300 tracking-wide leading-none mb-0.5 sm:mb-1">Command Control</p>
                        <h2 className="text-xs sm:text-base md:text-xl font-black text-white uppercase tracking-tight leading-tight truncate">{title}</h2>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3 shrink-0">
                {/* Collapsed System Status Popover (Hidden on mobile for spacious header) */}
                <div className="relative hidden md:block" ref={statusPopoverRef}>
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

                    {typeof document !== 'undefined' &&
                        createPortal(
                            <AnimatePresence>
                                {showSystemStatus && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-[120]"
                                            onClick={() => setShowSystemStatus(false)}
                                        />
                                        <motion.div
                                            initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 8, scale: 0.96 }}
                                            transition={{ duration: 0.15 }}
                                            className="fixed inset-x-3 top-[max(4.75rem,calc(env(safe-area-inset-top)+4rem))] sm:inset-x-auto sm:right-6 sm:w-72 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700/80 p-4 z-[125] space-y-3.5"
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
                                    </>
                                )}
                            </AnimatePresence>,
                            document.body
                        )}
                </div>

                {/* Notification Bell */}
                <button
                    onClick={handleOpenDrawer}
                    aria-label="Open notifications"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-all relative text-blue-200 hover:bg-white/10 hover:border-white/20 border border-white/5 bg-white/5 group"
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
                        className={`hidden sm:inline-flex p-2.5 text-blue-200 hover:bg-white/5 rounded-md transition-colors border border-transparent hover:border-white/10 ${isDataLoading ? 'animate-spin' : ''}`}
                    >
                        <RefreshCcw size={18} />
                    </button>
                )}

                <div className="h-8 md:h-10 w-[1px] bg-white/10 mx-0.5 md:mx-2"></div>

                <div
                    onClick={onProfileClick}
                    className={`flex items-center gap-1 md:gap-4 ${onProfileClick ? 'cursor-pointer group hover:bg-white/5 p-1 md:px-3 md:py-2 rounded-md border border-transparent hover:border-white/10 transition-all' : ''}`}
                >
                    <div className="text-right hidden md:block">
                        <p className="text-[11px] font-bold text-white tracking-wide">{currentUser?.fullName}</p>
                        <p className="text-[11px] text-blue-300/80 font-mono leading-none mt-0.5">
                            {currentUser?.designation ||
                                (currentUser?.role === UserRole.ADMIN
                                    ? 'System Administrator'
                                    : currentUser?.role === UserRole.COMMANDANT
                                    ? 'Commandant'
                                    : currentUser?.role === UserRole.MEDICAL_OFFICER
                                    ? 'Medical Officer'
                                    : 'Course Officer')}
                        </p>
                    </div>
                    <div className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 bg-blue-600/20 rounded-xl border border-blue-400/30 flex items-center justify-center text-blue-400 font-black shadow-[inset_0_0_15px_rgba(59,130,246,0.1)] text-xs sm:text-sm">
                        {(currentUser?.fullName || 'U').charAt(0)}
                    </div>
                </div>
                <button
                    onClick={logout}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-blue-200/70 hover:text-rose-400 hover:bg-white/5 transition-colors"
                    title="Sign Out"
                    aria-label="Sign Out"
                >
                    <LogOut size={17} />
                </button>
            </div>
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
