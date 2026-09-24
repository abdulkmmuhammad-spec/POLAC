import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Bell, AlertTriangle, Settings, User, ArrowRight,
    Activity, Clock, CheckCheck
} from 'lucide-react';
import { Notification } from '../../types';
import { inferSeverity, getSeverityStyles, parseNotificationTarget } from '../../utils/notificationUtils';
import { formatRC } from '../../utils/rcHelpers';

interface NotificationPreviewModalProps {
    notification: Notification | null;
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (targetRoute: string, state?: any) => void;
    onAcknowledge: (id: string) => void;
}

const formatDateTime = (timestamp: string): string => {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return 'Unknown time';
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${dateStr} at ${timeStr}`;
};

export const NotificationPreviewModal: React.FC<NotificationPreviewModalProps> = ({
    notification,
    isOpen,
    onClose,
    onNavigate,
    onAcknowledge
}) => {
    if (!notification) return null;

    const severity = inferSeverity(notification);
    const styles = getSeverityStyles(severity);
    const target = parseNotificationTarget(notification);
    const counts = notification.metadata?.counts || target.counts;
    const courseNum = notification.courseNumber || notification.metadata?.courseNumber || (notification.yearGroup > 0 ? notification.yearGroup : undefined);

    const handleActionClick = () => {
        onAcknowledge(notification.id);
        onClose();
        onNavigate(target.route, {
            courseNumber: target.courseNumber,
            paradeType: target.paradeType,
            searchTerm: target.cadetName,
            notificationId: notification.id
        });
    };

    const handleMarkAndClose = () => {
        onAcknowledge(notification.id);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-slate-950/60 backdrop-blur-md"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 15 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10"
                        role="dialog"
                        aria-modal="true"
                    >
                        {/* ── 1. Top Header Bar (Spacious, Uncrowded Layout) ── */}
                        <div className="bg-gradient-to-br from-blue-900 via-blue-950 to-slate-900 text-white px-6 pt-6 pb-5 relative">
                            {/* Top Badge & Action Strip */}
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`text-[10px] font-black uppercase tracking-[0.18em] px-2.5 py-1 rounded-md border ${styles.badge}`}>
                                        {styles.label} Intel
                                    </span>
                                    {courseNum && (
                                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-200 border border-blue-400/30">
                                            {formatRC(courseNum)}
                                        </span>
                                    )}
                                    {target.paradeType && (
                                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md bg-slate-800 text-slate-200 border border-slate-700">
                                            {target.paradeType}
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                                    aria-label="Close modal"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Title & Icon Header */}
                            <div className="flex items-start gap-3.5">
                                <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/15 shrink-0 shadow-inner mt-0.5">
                                    {severity === 'critical' ? (
                                        <AlertTriangle className="text-rose-400" size={20} />
                                    ) : severity === 'system' ? (
                                        <Settings className="text-blue-300" size={20} />
                                    ) : (
                                        <Bell className="text-emerald-300" size={20} />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-base sm:text-lg font-black tracking-tight text-white leading-snug">
                                        {notification.title}
                                    </h3>
                                </div>
                            </div>
                        </div>

                        {/* ── 2. Modal Body (Clean Hierarchy & Balanced Padding) ── */}
                        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                            {/* Metadata Summary Line */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-2.5 px-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                    <User size={14} className="text-blue-600 shrink-0" />
                                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Officer:</span>
                                    <span className="font-black text-slate-800 truncate">{notification.officerName || 'System'}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <Clock size={14} className="text-slate-400 shrink-0" />
                                    <span className="font-mono text-xs font-semibold text-slate-600 whitespace-nowrap">
                                        {formatDateTime(notification.timestamp)}
                                    </span>
                                </div>
                            </div>

                            {/* Content Description */}
                            <div className="text-slate-700 text-sm leading-relaxed px-1 font-medium">
                                {notification.content}
                            </div>

                            {/* Tactical Metrics Grid */}
                            {counts && (
                                <div className="pt-2 border-t border-slate-100 space-y-3">
                                    <div className="flex items-center justify-between px-1">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-1.5">
                                            <Activity size={14} className="text-blue-600" />
                                            Parade Metrics Breakdown
                                        </h4>
                                        {counts.grandTotal !== undefined && (
                                            <span className="text-[11px] font-mono font-black text-slate-700">
                                                Total Cadets: {counts.grandTotal}
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                        {counts.present !== undefined && (
                                            <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-emerald-700">Present</p>
                                                <p className="text-lg font-black font-mono text-emerald-900">{counts.present}</p>
                                            </div>
                                        )}
                                        {counts.absent !== undefined && (
                                            <div className="p-2.5 rounded-xl bg-rose-50/80 border border-rose-200/80 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-rose-700">Absent</p>
                                                <p className="text-lg font-black font-mono text-rose-900">{counts.absent}</p>
                                            </div>
                                        )}
                                        {counts.sick !== undefined && (
                                            <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-amber-700">Medical</p>
                                                <p className="text-lg font-black font-mono text-amber-900">{counts.sick}</p>
                                            </div>
                                        )}
                                        {counts.detention !== undefined && counts.detention > 0 && (
                                            <div className="p-2.5 rounded-xl bg-purple-50/80 border border-purple-200/80 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-purple-700">Detention</p>
                                                <p className="text-lg font-black font-mono text-purple-900">{counts.detention}</p>
                                            </div>
                                        )}
                                        {counts.pass !== undefined && counts.pass > 0 && (
                                            <div className="p-2.5 rounded-xl bg-sky-50/80 border border-sky-200/80 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-sky-700">Pass</p>
                                                <p className="text-lg font-black font-mono text-sky-900">{counts.pass}</p>
                                            </div>
                                        )}
                                        {counts.suspension !== undefined && counts.suspension > 0 && (
                                            <div className="p-2.5 rounded-xl bg-red-50/80 border border-red-200/80 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-red-700">Suspension</p>
                                                <p className="text-lg font-black font-mono text-red-900">{counts.suspension}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── 3. Action Footer ── */}
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                            <button
                                onClick={handleMarkAndClose}
                                className="w-full sm:w-auto px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCheck size={16} />
                                {notification.read ? 'Close' : 'Acknowledge'}
                            </button>
                            <button
                                onClick={handleActionClick}
                                className="w-full sm:w-auto px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-blue-900/20 flex items-center justify-center gap-2"
                            >
                                {target.actionLabel}
                                <ArrowRight size={14} />
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

