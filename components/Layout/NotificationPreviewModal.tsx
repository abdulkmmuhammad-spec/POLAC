import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Bell, AlertTriangle, Settings, CheckCircle2,
    Calendar, User, ArrowRight, Shield, Activity, Users,
    Clock, CheckCheck
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
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden z-10"
                        role="dialog"
                        aria-modal="true"
                    >
                        {/* Header Bar */}
                        <div className="bg-gradient-to-br from-blue-900 via-blue-950 to-slate-900 text-white p-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-48 h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />

                            <div className="flex items-start justify-between gap-4 relative z-10">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/15 shrink-0 shadow-inner">
                                        {severity === 'critical' ? (
                                            <AlertTriangle className="text-rose-400" size={24} />
                                        ) : severity === 'system' ? (
                                            <Settings className="text-blue-300" size={24} />
                                        ) : (
                                            <Bell className="text-emerald-300" size={24} />
                                        )}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-2.5 py-0.5 rounded-full border ${styles.badge}`}>
                                                {styles.label} INTEL
                                            </span>
                                            {courseNum && (
                                                <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30">
                                                    {formatRC(courseNum)}
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="text-lg font-black tracking-tight text-white line-clamp-1">
                                            {notification.title}
                                        </h3>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all border border-transparent hover:border-white/10"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Body Details */}
                        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                            {/* Officer & Timestamp Metadata */}
                            <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/60 text-xs">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-7 h-7 rounded-lg bg-blue-100/60 text-blue-800 flex items-center justify-center shrink-0">
                                        <User size={14} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Reporting Officer</p>
                                        <p className="font-black text-slate-800 truncate">{notification.officerName || 'System Generated'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-7 h-7 rounded-lg bg-blue-100/60 text-blue-800 flex items-center justify-center shrink-0">
                                        <Clock size={14} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Timestamp</p>
                                        <p className="font-black text-slate-800 truncate">{new Date(notification.timestamp).toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Message Content */}
                            <div className="p-4 bg-blue-50/40 rounded-2xl border border-blue-100 text-slate-700 text-sm leading-relaxed font-medium">
                                <p>{notification.content}</p>
                            </div>

                            {/* Optional Tactical Breakdown for Parade Submissions */}
                            {counts && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-1.5">
                                            <Activity size={14} className="text-blue-600" />
                                            Parade State Metrics
                                        </h4>
                                        {counts.grandTotal !== undefined && (
                                            <span className="text-[10px] font-mono font-black text-slate-600 uppercase">
                                                Total Cadets: {counts.grandTotal}
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                        {counts.present !== undefined && (
                                            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Present</p>
                                                <p className="text-lg font-black font-mono text-emerald-800">{counts.present}</p>
                                            </div>
                                        )}
                                        {counts.absent !== undefined && (
                                            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-rose-600">Absent</p>
                                                <p className="text-lg font-black font-mono text-rose-800">{counts.absent}</p>
                                            </div>
                                        )}
                                        {counts.sick !== undefined && (
                                            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-amber-600">Medical/Sick</p>
                                                <p className="text-lg font-black font-mono text-amber-800">{counts.sick}</p>
                                            </div>
                                        )}
                                        {counts.detention !== undefined && counts.detention > 0 && (
                                            <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-purple-600">Detention</p>
                                                <p className="text-lg font-black font-mono text-purple-800">{counts.detention}</p>
                                            </div>
                                        )}
                                        {counts.pass !== undefined && counts.pass > 0 && (
                                            <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-sky-600">Pass</p>
                                                <p className="text-lg font-black font-mono text-sky-800">{counts.pass}</p>
                                            </div>
                                        )}
                                        {counts.suspension !== undefined && counts.suspension > 0 && (
                                            <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-red-600">Suspension</p>
                                                <p className="text-lg font-black font-mono text-red-800">{counts.suspension}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Action Footer */}
                        <div className="p-6 bg-slate-50/80 border-t border-slate-200/60 flex flex-col sm:flex-row items-center justify-between gap-3">
                            <button
                                onClick={handleMarkAndClose}
                                className="w-full sm:w-auto px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-xl transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCheck size={16} />
                                {notification.read ? 'Close Preview' : 'Acknowledge & Close'}
                            </button>
                            <button
                                onClick={handleActionClick}
                                className="w-full sm:w-auto px-6 py-3 bg-blue-900 hover:bg-blue-800 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-blue-900/20 flex items-center justify-center gap-2"
                            >
                                {target.actionLabel}
                                <ArrowRight size={15} />
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
