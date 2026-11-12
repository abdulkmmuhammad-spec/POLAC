import React from 'react';
import { Shield, AlertTriangle, ChevronRight, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Notification } from '../../../types';
import { inferSeverity } from '../../../utils/notificationUtils';
import { useParade } from '../../../context/ParadeContext';

interface TacticalHUDProps {
    notifications: Notification[];
    onResolve: (id: string) => void;
    onView: (notification: Notification) => void;
}

export const TacticalHUD: React.FC<TacticalHUDProps> = ({ notifications, onResolve, onView }) => {
    const { remarks } = useParade();

    // Filter for unread, non-archived critical alerts whose underlying remark/issue is not already resolved
    const priorityAlerts = notifications.filter(n => {
        if (n.archivedAt || n.read || inferSeverity(n) !== 'critical') {
            return false;
        }

        const lowerType = (n.type || '').toLowerCase();
        const lowerTitle = (n.title || '').toLowerCase();
        const isRemarkRelated =
            lowerType === 'commandant_remark' ||
            lowerType === 'remark_response' ||
            lowerType === 'remark_resolved' ||
            lowerTitle.includes("commandant's parade remark") ||
            lowerTitle.includes('commandant parade remark') ||
            lowerTitle.includes('officer justification') ||
            lowerTitle.includes('parade inquiry');

        if (isRemarkRelated) {
            if (lowerType === 'remark_resolved' || lowerTitle.includes('parade inquiry resolved')) {
                return false;
            }

            const rcMatch = (n.title || '').match(/RC\s*(\d+)/i);
            const targetCourse =
                n.courseNumber ||
                n.metadata?.courseNumber ||
                (rcMatch ? parseInt(rcMatch[1], 10) : undefined) ||
                (n.yearGroup > 0 ? n.yearGroup : undefined);

            const metaRemarkId = n.metadata?.remarkId;
            const metaRecordId = n.metadata?.recordId;

            const matched = remarks.filter(r => {
                if (metaRemarkId && String(r.id) === String(metaRemarkId)) return true;
                if (metaRecordId && String(r.submissionId) === String(metaRecordId)) return true;
                if (targetCourse && Number(r.courseNumber) === Number(targetCourse)) return true;
                return false;
            });

            if (matched.length > 0) {
                // If all remarks for this course/submission are resolved, or if the Commandant has already
                // responded and is waiting on the Course Officer (no unacknowledged officer reply), hide HUD
                const hasActionableForCommandant = matched.some(
                    r => r.status !== 'resolved' && Boolean(r.officerResponse)
                );
                if (!hasActionableForCommandant) {
                    return false;
                }
            }
        }

        return true;
    });

    if (priorityAlerts.length === 0) return null;

    return (
        <div className="mb-8 space-y-3 relative z-20">
            <div className="flex items-center gap-2 mb-2 px-1">
                <div className="flex items-center gap-2 bg-rose-500 text-white px-3 py-1 rounded-full shadow-[0_4px_12px_rgba(244,63,94,0.3)]">
                    <Shield size={14} className="animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Priority Command HUD</span>
                </div>
                <div className="h-[1px] flex-1 bg-gradient-to-r from-rose-500/30 to-transparent"></div>
            </div>

            <AnimatePresence mode="popLayout">
                {priorityAlerts.map((alert) => (
                    <motion.div
                        key={alert.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="group relative overflow-hidden bg-white/80 backdrop-blur-md rounded-2xl border-l-4 border-l-rose-500 border-y border-r border-slate-200 shadow-lg p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3.5 md:gap-4 transition-all hover:bg-white hover:shadow-xl"
                    >
                        {/* Background Pulse Decor */}
                        <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-rose-500/5 to-transparent pointer-events-none"></div>

                        <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
                            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-600 shrink-0 border border-rose-500/20">
                                <AlertTriangle size={22} className="animate-bounce duration-1000" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="text-[9px] font-black py-0.5 px-2 bg-rose-500 text-white rounded uppercase tracking-widest">Immediate Action Required</span>
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight break-words sm:truncate">{alert.title}</h4>
                                <p className="text-xs text-slate-500 font-medium line-clamp-2 sm:line-clamp-1 mt-0.5">{alert.content}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 pt-2.5 md:pt-0 md:pl-4 border-t md:border-t-0 md:border-l border-slate-100 w-full md:w-auto">
                            <button
                                onClick={() => onView(alert)}
                                className="flex-1 md:flex-initial min-h-[42px] flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all group/btn"
                            >
                                Investigate <ChevronRight size={14} className="group-hover/btn:translate-x-0.5 transition-transform" />
                            </button>
                            <button
                                onClick={() => onResolve(alert.id)}
                                className="min-h-[42px] min-w-[42px] p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all border border-emerald-100 flex items-center justify-center shrink-0"
                                title="Resolve Conflict"
                            >
                                <CheckCircle2 size={20} />
                            </button>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};
