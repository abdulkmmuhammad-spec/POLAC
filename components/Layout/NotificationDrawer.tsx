import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Bell, CheckCircle, AlertTriangle, Settings, FileText,
    User as UserIcon, History, Trash2, CheckCheck, Sparkles
} from 'lucide-react';
import { Notification } from '../../types';

interface NotificationDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    notifications: Notification[];
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
    onClearAll: () => void;
}

const inferSeverity = (n: Notification): 'critical' | 'info' | 'system' => {
    // Audit logs are now in a separate table. We suppress "Modified" noise 
    // and elevate actual "Alerts".
    const type = n.type?.toLowerCase() || '';
    const content = n.content?.toLowerCase() || '';

    if (type === 'settings_change' || type === 'profile_update') return 'system';

    // Actionable Intel Elevation
    if (content.includes('absent') && content.includes('high')) return 'critical';
    if (content.includes('nil') || content.includes('detention') || content.includes('critical')) return 'critical';

    return 'info';
};

const getIconForSeverity = (severity: 'critical' | 'info' | 'system') => {
    switch (severity) {
        case 'critical':
            return (
                <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-rose-50 text-rose-500 shadow-sm">
                    <AlertTriangle size={18} />
                </div>
            );
        case 'system':
            return (
                <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-500 shadow-sm">
                    <Settings size={18} />
                </div>
            );
        case 'info':
        default:
            return (
                <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-500 shadow-sm">
                    <CheckCircle size={18} />
                </div>
            );
    }
};

const getSeverityBadge = (severity: 'critical' | 'info' | 'system') => {
    const styles = {
        critical: 'bg-rose-100 text-rose-600 border-rose-200',
        info: 'bg-emerald-100 text-emerald-600 border-emerald-200',
        system: 'bg-indigo-100 text-indigo-600 border-indigo-200',
    };
    const labels = {
        critical: 'Critical',
        info: 'Routine',
        system: 'System',
    };
    return (
        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${styles[severity]}`}>
            {labels[severity]}
        </span>
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
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
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
                        className="fixed inset-0 z-[60] bg-slate-900/30 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* ── Drawer Panel ── */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                        className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-white shadow-2xl z-[70] flex flex-col"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Notifications Drawer"
                    >
                        {/* ── Header Bar ── */}
                        <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-blue-900 to-blue-800 text-white shrink-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                                        <Bell size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black tracking-tight">Notifications</h2>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-blue-200 mt-0.5">
                                            {unreadCount > 0
                                                ? `${unreadCount} unread alert${unreadCount > 1 ? 's' : ''}`
                                                : 'All caught up'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    aria-label="Close Notifications"
                                    className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* ── Action Bar ── */}
                        {notifications.length > 0 && (
                            <div className="px-6 py-3 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between shrink-0">
                                <button
                                    onClick={onMarkAllRead}
                                    className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
                                >
                                    <CheckCheck size={14} />
                                    Mark all read
                                </button>
                                <button
                                    onClick={onClearAll}
                                    className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-rose-600 transition-colors"
                                >
                                    <Trash2 size={14} />
                                    Clear all
                                </button>
                            </div>
                        )}

                        {/* ── Notification List ── */}
                        <div className="flex-1 overflow-y-auto scrollbar-hide">
                            <AnimatePresence mode="popLayout">
                                {notifications.length === 0 ? (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex flex-col items-center justify-center h-full px-6"
                                    >
                                        <motion.div
                                            animate={{
                                                y: [0, -10, 0],
                                                rotate: [0, 5, -5, 0],
                                            }}
                                            transition={{
                                                duration: 4,
                                                repeat: Infinity,
                                                ease: 'easeInOut',
                                            }}
                                            className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-6 border border-slate-100 shadow-inner"
                                        >
                                            <Sparkles size={36} className="text-slate-300" />
                                        </motion.div>
                                        <p className="text-base font-black text-slate-400 tracking-tight">
                                            All caught up!
                                        </p>
                                        <p className="text-xs text-slate-300 font-medium mt-1 text-center">
                                            Your command activity log is focused on Actionable Intel.<br />
                                            Administrative logs are maintained in the Forensic Archive.
                                        </p>
                                    </motion.div>
                                ) : (
                                    <div className="divide-y divide-slate-50">
                                        {notifications
                                            .filter(n => {
                                                // Suppress noise: Hide generic "Modified" notifications if they are 'system' type
                                                // and don't contain critical keywords
                                                if (n.type === 'system' && n.title.includes('Modified')) return false;
                                                return true;
                                            })
                                            .map((n, idx) => {
                                                const severity = inferSeverity(n);
                                                return (
                                                    <motion.div
                                                        key={n.id}
                                                        initial={{ opacity: 0, x: 20 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        exit={{ opacity: 0, x: -20, height: 0 }}
                                                        transition={{ delay: idx * 0.03 }}
                                                        onClick={() => {
                                                            if (!n.read) onMarkRead(n.id);
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (!n.read && (e.key === 'Enter' || e.key === ' ')) {
                                                                e.preventDefault();
                                                                onMarkRead(n.id);
                                                            }
                                                        }}
                                                        tabIndex={0}
                                                        role="button"
                                                        aria-label={`${n.read ? 'Read' : 'Unread'} notification: ${n.title}`}
                                                        className={`px-6 py-4 transition-colors cursor-pointer group focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${n.read
                                                            ? 'bg-white hover:bg-slate-50/50'
                                                            : 'bg-blue-50/30 hover:bg-blue-50/50 border-l-[3px] border-l-blue-500'
                                                            }`}
                                                    >
                                                        <div className="flex gap-3">
                                                            <div className="transition-transform group-hover:scale-110">
                                                                {getIconForSeverity(severity)}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <p className={`text-sm font-bold truncate ${n.read ? 'text-slate-600' : 'text-slate-800'
                                                                        }`}>
                                                                        {n.title}
                                                                    </p>
                                                                    {!n.read && (
                                                                        <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                                                                    {n.content}
                                                                </p>
                                                                <div className="flex items-center gap-3 mt-2.5">
                                                                    {getSeverityBadge(severity)}
                                                                    <div className="flex items-center gap-1">
                                                                        <History size={10} className="text-slate-400" />
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
                        {notifications.length > 0 && (
                            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
                                <p className="text-[10px] text-center font-bold uppercase tracking-widest text-slate-300">
                                    Showing latest {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
                                </p>
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
