import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion, PanInfo } from 'framer-motion';
import {
    X,
    Bell,
    CheckCircle,
    AlertTriangle,
    Settings,
    Trash2,
    CheckCheck,
    ChevronRight
} from 'lucide-react';
import { Notification } from '../../types';
import { inferSeverity, getSeverityStyles } from '../../utils/notificationUtils';
import { acquireScrollLock, releaseScrollLock } from '../../utils/scrollLock';

interface NotificationDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    notifications: Notification[];
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
    onClearAll: () => void;
    onSelectNotification?: (notification: Notification) => void;
}

type FilterTab = 'all' | 'unread';

const useIsMobileSheet = (): boolean => {
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth < 640 : false
    );

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 639px)');
        const update = () => setIsMobile(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);

    return isMobile;
};

const getIconForSeverity = (severity: 'critical' | 'info' | 'system') => {
    const styles = getSeverityStyles(severity);
    const Icon =
        severity === 'critical' ? AlertTriangle : severity === 'system' ? Settings : CheckCircle;

    return (
        <div
            className={`shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center ${styles.bg} ${styles.text} border border-slate-200/60`}
        >
            <Icon size={18} />
        </div>
    );
};

const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
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

const isWithinLast24Hours = (timestamp: string): boolean => {
    const ms = new Date(timestamp).getTime();
    if (isNaN(ms)) return false;
    return Date.now() - ms < 24 * 60 * 60 * 1000;
};

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
    isOpen,
    onClose,
    notifications,
    onMarkRead,
    onMarkAllRead,
    onClearAll,
    onSelectNotification
}) => {
    const shouldReduceMotion = useReducedMotion();
    const isMobile = useIsMobileSheet();
    const [activeTab, setActiveTab] = useState<FilterTab>('all');

    const visibleNotifications = useMemo(
        () =>
            notifications.filter(
                n => !(n.type === 'system' && n.title.includes('Modified'))
            ),
        [notifications]
    );

    const unreadCount = useMemo(
        () => visibleNotifications.filter(n => !n.read).length,
        [visibleNotifications]
    );

    const filteredNotifications = useMemo(
        () =>
            activeTab === 'unread'
                ? visibleNotifications.filter(n => !n.read)
                : visibleNotifications,
        [visibleNotifications, activeTab]
    );

    const { todayItems, earlierItems } = useMemo(() => {
        const today: Notification[] = [];
        const earlier: Notification[] = [];
        for (const n of filteredNotifications) {
            if (isWithinLast24Hours(n.timestamp)) {
                today.push(n);
            } else {
                earlier.push(n);
            }
        }
        return { todayItems: today, earlierItems: earlier };
    }, [filteredNotifications]);

    useEffect(() => {
        if (!isOpen) return;
        acquireScrollLock();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            releaseScrollLock();
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        if (info.offset.y > 90 || info.velocity.y > 500) {
            onClose();
        }
    };

    if (typeof document === 'undefined') return null;

    const renderRow = (n: Notification) => {
        const severity = inferSeverity(n);
        const isUnread = !n.read;

        return (
            <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                    if (isUnread) onMarkRead(n.id);
                    onSelectNotification?.(n);
                }}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (isUnread) onMarkRead(n.id);
                        onSelectNotification?.(n);
                    }
                }}
                className={`min-h-[64px] px-4 py-3.5 flex items-start gap-3 cursor-pointer transition-colors ${
                    isUnread
                        ? 'bg-blue-50/45 hover:bg-blue-50/75'
                        : 'bg-white hover:bg-slate-50'
                }`}
            >
                {getIconForSeverity(severity)}

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <p
                            className={`text-sm truncate ${
                                isUnread
                                    ? 'font-bold text-slate-900'
                                    : 'font-medium text-slate-700'
                            }`}
                        >
                            {n.title}
                        </p>
                        <span className="text-[11px] font-medium text-slate-400 shrink-0">
                            {formatTime(n.timestamp)}
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                        {n.content}
                    </p>
                </div>

                <div className="flex items-center gap-1.5 self-center shrink-0 pl-1">
                    {isUnread && (
                        <span
                            className="w-2 h-2 rounded-full bg-blue-600"
                            aria-label="Unread"
                        />
                    )}
                    <ChevronRight size={16} className="text-slate-300" />
                </div>
            </div>
        );
    };

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Dim Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
                        className="fixed inset-0 z-[115] bg-slate-950/50 backdrop-blur-xs"
                        onClick={onClose}
                    />

                    {/* Mobile Bottom Sheet / Desktop Right Sheet */}
                    <motion.div
                        initial={
                            shouldReduceMotion
                                ? { opacity: 0 }
                                : isMobile
                                ? { y: '100%' }
                                : { x: '100%' }
                        }
                        animate={{ x: 0, y: 0, opacity: 1 }}
                        exit={
                            shouldReduceMotion
                                ? { opacity: 0 }
                                : isMobile
                                ? { y: '100%' }
                                : { x: '100%' }
                        }
                        transition={
                            shouldReduceMotion
                                ? { duration: 0.12 }
                                : { type: 'spring', damping: 28, stiffness: 300 }
                        }
                        drag={isMobile && !shouldReduceMotion ? 'y' : false}
                        dragConstraints={{ top: 0 }}
                        dragElastic={{ top: 0, bottom: 0.3 }}
                        onDragEnd={handleDragEnd}
                        className="fixed inset-x-0 bottom-0 max-h-[88dvh] rounded-t-3xl sm:inset-y-0 sm:right-0 sm:left-auto sm:top-0 sm:max-h-none sm:w-[420px] sm:rounded-l-3xl sm:rounded-tr-none z-[120] bg-white shadow-2xl border-t sm:border-t-0 sm:border-l border-slate-200 flex flex-col overflow-hidden"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Notifications"
                    >
                        {/* Mobile Drag Pill */}
                        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
                            <div className="w-9 h-1 rounded-full bg-slate-300" />
                        </div>

                        {/* Header */}
                        <div className="px-5 pt-2 sm:pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-slate-200 bg-white space-y-3 shrink-0">
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-lg font-bold text-slate-900 tracking-tight truncate">
                                    Notifications
                                </h2>

                                <div className="flex items-center gap-1.5 shrink-0">
                                    {unreadCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={onMarkAllRead}
                                            className="min-h-[44px] px-3 rounded-full text-xs font-semibold text-blue-700 hover:bg-blue-50 inline-flex items-center gap-1.5 transition-colors"
                                        >
                                            <CheckCheck size={14} />
                                            <span>Mark all read</span>
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        aria-label="Close notifications"
                                        className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* 2-Segment Control: All | Unread */}
                            <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('all')}
                                    className={`min-h-[40px] px-3 rounded-lg text-xs font-semibold transition-all ${
                                        activeTab === 'all'
                                            ? 'bg-white text-slate-900 shadow-2xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    All ({visibleNotifications.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('unread')}
                                    className={`min-h-[40px] px-3 rounded-lg text-xs font-semibold transition-all ${
                                        activeTab === 'unread'
                                            ? 'bg-white text-slate-900 shadow-2xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    Unread ({unreadCount})
                                </button>
                            </div>
                        </div>

                        {/* Chronological Feed */}
                        <div className="flex-1 overflow-y-auto bg-white">
                            {filteredNotifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full px-8 text-center py-14">
                                    <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                                        <Bell size={24} className="text-slate-400" />
                                    </div>
                                    <p className="text-sm font-bold text-slate-800 mb-1">
                                        {activeTab === 'unread'
                                            ? 'You are all caught up'
                                            : 'No notifications yet'}
                                    </p>
                                    <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                                        {activeTab === 'unread'
                                            ? 'All alerts have been reviewed.'
                                            : 'Parade submissions, executive briefs, and sickbay updates will appear here.'}
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    {todayItems.length > 0 && (
                                        <div>
                                            <div className="sticky top-0 z-10 px-4 py-1.5 bg-slate-50/95 backdrop-blur-xs border-y border-slate-100 text-xs font-semibold text-slate-500">
                                                Today
                                            </div>
                                            <div className="divide-y divide-slate-100">
                                                {todayItems.map(renderRow)}
                                            </div>
                                        </div>
                                    )}
                                    {earlierItems.length > 0 && (
                                        <div>
                                            <div className="sticky top-0 z-10 px-4 py-1.5 bg-slate-50/95 backdrop-blur-xs border-y border-slate-100 text-xs font-semibold text-slate-500">
                                                Earlier
                                            </div>
                                            <div className="divide-y divide-slate-100">
                                                {earlierItems.map(renderRow)}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {visibleNotifications.length > 0 && (
                            <div className="px-5 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                                <span className="text-xs text-slate-500">
                                    {visibleNotifications.length} notification
                                    {visibleNotifications.length === 1 ? '' : 's'}
                                </span>
                                <button
                                    type="button"
                                    onClick={onClearAll}
                                    className="min-h-[44px] px-3 rounded-full text-xs font-semibold text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1.5 transition-colors"
                                >
                                    <Trash2 size={14} />
                                    <span>Clear all</span>
                                </button>
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
};
