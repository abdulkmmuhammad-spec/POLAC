import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Bell, CheckCircle, AlertTriangle, Settings,
    History, Trash2, CheckCheck, Sparkles, Check
} from 'lucide-react';
import { Notification } from '../../types';
import { inferSeverity, getSeverityStyles } from '../../utils/notificationUtils';

interface NotificationDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    notifications: Notification[];
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
    onClearAll: () => void;
}

const getIconForSeverity = (severity: 'critical' | 'info' | 'system') => {
    const styles = getSeverityStyles(severity);
    const Icon = severity === 'critical' ? AlertTriangle : (severity === 'system' ? Settings : CheckCircle);
    
    return (
        <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${styles.bg} ${styles.text} shadow-sm border ${styles.border.replace('border-', 'border-opacity-50 border-')}`}>
            <Icon size={18} />
        </div>
    );
};

const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Unknown time';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Just now';
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

// ─── Main Component ──────────────────────────────────────────────────
export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
    isOpen,
    onClose,
    notifications,
    onMarkRead,
    onMarkAllRead,
    onClearAll,
}) => {
    const unreadCount = notifications.filter(n => !n.read).length;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* ── Backdrop ── */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md"
                        onClick={onClose}
                    />

                    {/* ── Drawer Panel (Glassmorphic) ── */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed right-0 top-0 h-full w-full sm:w-[440px] bg-white/80 backdrop-blur-2xl border-l border-white/20 shadow-[-20px_0_50px_rgba(0,0,0,0.1)] z-[70] flex flex-col overflow-hidden"
                        role="dialog"
                        aria-modal="true"
                    >
                        {/* ── Header Bar ── */}
                        <div className="px-6 py-6 border-b border-slate-200/50 bg-gradient-to-br from-blue-900/90 to-blue-800/90 text-white shrink-0 shadow-lg">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <motion.div 
                                        animate={{ rotate: unreadCount > 0 ? [0, -10, 10, -10, 10, 0] : 0 }}
                                        transition={{ duration: 0.5, repeat: unreadCount > 0 ? Infinity : 0, repeatDelay: 3 }}
                                        className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10"
                                    >
                                        <Bell size={24} className="text-blue-200" />
                                    </motion.div>
                                    <div>
                                        <h2 className="text-xl font-black tracking-tight">Intelligence Feed</h2>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                                            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-200">
                                                {unreadCount > 0
                                                    ? `${unreadCount} unread mission alert${unreadCount > 1 ? 's' : ''}`
                                                    : 'Sector Clear'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2.5 hover:bg-white/10 rounded-xl transition-all border border-transparent hover:border-white/10"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* ── Action Bar ── */}
                        {notifications.length > 0 && (
                            <div className="px-6 py-3 border-b border-slate-200/30 bg-white/30 flex items-center justify-between shrink-0">
                                <button
                                    onClick={onMarkAllRead}
                                    className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-blue-600 hover:text-blue-700 transition-colors bg-blue-50/50 px-3 py-1.5 rounded-lg border border-blue-100/50"
                                >
                                    <CheckCheck size={14} />
                                    Acknowledge All
                                </button>
                                <button
                                    onClick={onClearAll}
                                    className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400 hover:text-rose-600 transition-colors px-2 py-1"
                                >
                                    <Trash2 size={14} />
                                    Purge Data
                                </button>
                            </div>
                        )}

                        {/* ── Notification List ── */}
                        <div className="flex-1 overflow-y-auto scrollbar-hide py-2">
                            <AnimatePresence mode="popLayout" initial={false}>
                                {notifications.length === 0 ? (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex flex-col items-center justify-center h-full px-10 text-center"
                                    >
                                        <div className="w-24 h-24 bg-slate-100/50 rounded-[2.5rem] flex items-center justify-center mb-8 border border-white shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)]">
                                            <Sparkles size={40} className="text-slate-300" />
                                        </div>
                                        <p className="text-lg font-black text-slate-400 tracking-tight leading-none mb-2">
                                            No New Intelligence
                                        </p>
                                        <p className="text-xs text-slate-400/70 font-medium leading-relaxed">
                                            The command cycle is optimal. Real-time alerts will populate here as they occur.
                                        </p>
                                    </motion.div>
                                ) : (
                                    <div className="space-y-1 px-3">
                                        {notifications.map((n, idx) => {
                                            const severity = inferSeverity(n);
                                            const styles = getSeverityStyles(severity);
                                            
                                            // Noise reduction: Hide generic "Modified" notifications
                                            if (n.type === 'system' && n.title.includes('Modified')) return null;

                                            return (
                                                <motion.div
                                                    key={n.id}
                                                    layout
                                                    initial={{ opacity: 0, x: 50 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                                                    transition={{ 
                                                        type: 'spring', 
                                                        damping: 20, 
                                                        stiffness: 150,
                                                        delay: idx < 10 ? idx * 0.05 : 0 
                                                    }}
                                                    className={`relative group rounded-2xl border transition-all duration-300 overflow-hidden ${
                                                        !n.read 
                                                        ? 'bg-blue-50/40 border-blue-200/50 shadow-sm' 
                                                        : 'bg-transparent border-transparent hover:bg-white/40 hover:border-slate-200/50'
                                                    } ${severity === 'critical' && !n.read ? 'ring-1 ring-rose-400/30' : ''}`}
                                                >
                                                    <div className="p-4 flex gap-4">
                                                        <div className="relative">
                                                            {getIconForSeverity(severity)}
                                                            {severity === 'critical' && !n.read && (
                                                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-white animate-pulse" />
                                                            )}
                                                        </div>
                                                        
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <p className={`text-sm font-black leading-tight mb-1 truncate ${n.read ? 'text-slate-500' : 'text-slate-900'}`}>
                                                                    {n.title}
                                                                </p>
                                                                {!n.read && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            onMarkRead(n.id);
                                                                        }}
                                                                        className="p-1.5 rounded-lg bg-white shadow-sm border border-slate-200 text-blue-500 hover:bg-blue-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
                                                                        title="Mark as read"
                                                                    >
                                                                        <Check size={14} strokeWidth={3} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <p className={`text-xs leading-relaxed ${n.read ? 'text-slate-400' : 'text-slate-600'}`}>
                                                                {n.content}
                                                            </p>
                                                            <div className="flex items-center gap-4 mt-3">
                                                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${styles.badge}`}>
                                                                    {styles.label}
                                                                </span>
                                                                <div className="flex items-center gap-1.5">
                                                                    <History size={12} className="text-slate-300" />
                                                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                                                        {formatTime(n.timestamp)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* ── Footer ── */}
                        <div className="px-6 py-4 border-t border-slate-200/30 bg-white/50 shrink-0 backdrop-blur-md">
                            <p className="text-[10px] text-center font-black uppercase tracking-[0.2em] text-slate-400">
                                Secured by Antigravity Command
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
