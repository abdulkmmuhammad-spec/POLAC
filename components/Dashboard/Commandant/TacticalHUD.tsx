import React from 'react';
import { Shield, AlertTriangle, ChevronRight, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Notification } from '../../../types';
import { inferSeverity } from '../../../utils/notificationUtils';

interface TacticalHUDProps {
    notifications: Notification[];
    onResolve: (id: string) => void;
    onView: (id: string) => void;
}

export const TacticalHUD: React.FC<TacticalHUDProps> = ({ notifications, onResolve, onView }) => {
    // Filter for non-archived critical alerts
    const priorityAlerts = notifications.filter(n => 
        !n.archivedAt && inferSeverity(n) === 'critical'
    );

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
                        className="group relative overflow-hidden bg-white/80 backdrop-blur-md rounded-2xl border-l-4 border-l-rose-500 border-y border-r border-slate-200 shadow-lg p-4 flex flex-col md:flex-row items-center gap-4 transition-all hover:bg-white hover:shadow-xl"
                    >
                        {/* Background Pulse Decor */}
                        <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-rose-500/5 to-transparent pointer-events-none"></div>

                        <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-600 shrink-0 border border-rose-500/20">
                            <AlertTriangle size={24} className="animate-bounce duration-1000" />
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[9px] font-black py-0.5 px-2 bg-rose-500 text-white rounded uppercase tracking-widest">Immediate Action Required</span>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight truncate">{alert.title}</h4>
                            <p className="text-xs text-slate-500 font-medium line-clamp-1">{alert.content}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 md:pl-4 md:border-l border-slate-100">
                            <button
                                onClick={() => onView(alert.id)}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all group/btn"
                            >
                                Investigate <ChevronRight size={14} className="group-hover/btn:translate-x-0.5 transition-transform" />
                            </button>
                            <button
                                onClick={() => onResolve(alert.id)}
                                className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all border border-emerald-100"
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
