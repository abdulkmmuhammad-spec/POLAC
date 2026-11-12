import React, { useState, useEffect, useRef } from 'react';
import {
    LayoutDashboard,
    Plus,
    History,
    LogOut,
    AlertCircle,
    Flag,
    MessageSquare,
    ArrowRight,
    Send,
    X,
    Shield,
    Clock,
    CornerDownRight
} from 'lucide-react';
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { Header } from '../../Layout/Header';
import { OfficerProfile } from './OfficerProfile';
import { ParadeForm } from '../../Parade/ParadeForm';
import { SubmissionHistory } from './SubmissionHistory';
import { useParade } from '../../../context/ParadeContext';
import { CommandantRemark } from '../../../types';
import { dbService } from '../../../services/dbService';
import { formatRC } from '../../../utils/rcHelpers';
import { toast } from 'react-hot-toast';

export const OfficerDashboard: React.FC = () => {
    const { logout, currentUser } = useAuth();
    const { records, remarks, refreshRemarks } = useParade();
    const location = useLocation();
    const navigate = useNavigate();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Pop-up modal state for immediate Commandant Remark notification on login / new remark arrival
    const [popupRemark, setPopupRemark] = useState<CommandantRemark | null>(null);
    const [quickReplyText, setQuickReplyText] = useState('');
    const [isSubmittingQuickReply, setIsSubmittingQuickReply] = useState(false);
    const shownRemarkIdsRef = useRef<Set<string>>(new Set());

    const pendingRemarks = React.useMemo(() => {
        if (!currentUser) return [];
        return remarks.filter(r => {
            const matchesOfficer =
                (r.courseOfficerId && String(r.courseOfficerId) === String(currentUser.id)) ||
                (r.courseNumber && currentUser.courseNumber && Number(r.courseNumber) === Number(currentUser.courseNumber)) ||
                (r.courseOfficerName && currentUser.fullName && r.courseOfficerName.toLowerCase() === currentUser.fullName.toLowerCase());
            return matchesOfficer && r.status === 'pending' && !r.officerResponse;
        });
    }, [remarks, currentUser]);

    const resolvedRemarks = React.useMemo(() => {
        if (!currentUser) return [];
        return remarks.filter(r => {
            const matchesOfficer =
                (r.courseOfficerId && String(r.courseOfficerId) === String(currentUser.id)) ||
                (r.courseNumber && currentUser.courseNumber && Number(r.courseNumber) === Number(currentUser.courseNumber)) ||
                (r.courseOfficerName && currentUser.fullName && r.courseOfficerName.toLowerCase() === currentUser.fullName.toLowerCase());
            return matchesOfficer && r.status === 'resolved';
        });
    }, [remarks, currentUser]);

    const pendingRemarksCount = pendingRemarks.length;

    // Helper to navigate straight to Submission History and open the Remarks & Resolution Log drawer
    const handleJumpToReply = React.useCallback(
        (remark: CommandantRemark) => {
            setPopupRemark(null);
            navigate('/officer/history', {
                state: {
                    openRemarkSubmissionId: remark.submissionId,
                    remarkId: remark.id,
                    courseNumber: remark.courseNumber,
                    paradeType: remark.paradeType,
                    focusLog: true
                }
            });

            setTimeout(() => {
                window.dispatchEvent(
                    new CustomEvent('open-parade-remark-drawer', {
                        detail: {
                            submissionId: remark.submissionId,
                            remarkId: remark.id,
                            courseNumber: remark.courseNumber,
                            paradeType: remark.paradeType,
                            remark,
                            focusLog: true
                        }
                    })
                );
            }, 90);
        },
        [navigate]
    );

    // Automatically surface a mobile-friendly pop-up modal (and native phone notification) as soon as
    // the Course Officer logs in with a pending remark or receives a new/follow-up remark
    useEffect(() => {
        if (pendingRemarks.length === 0) {
            setPopupRemark(null);
            return;
        }

        const latestPending = pendingRemarks[0];
        const trackingKey = `${latestPending.id}-${latestPending.updatedAt || latestPending.createdAt}`;

        if (!shownRemarkIdsRef.current.has(trackingKey)) {
            shownRemarkIdsRef.current.add(trackingKey);
            setPopupRemark(latestPending);

            // Also trigger a native phone notification if browser permission is granted
            if (
                typeof window !== 'undefined' &&
                'Notification' in window &&
                window.Notification.permission === 'granted' &&
                'serviceWorker' in navigator
            ) {
                navigator.serviceWorker.ready
                    .then(reg => {
                        reg.showNotification(
                            `Commandant's Parade Remark — ${latestPending.courseNumber ? formatRC(latestPending.courseNumber) : 'Action Required'}`,
                            {
                                body: `"${latestPending.remarkText}" — Tap to submit your justification.`,
                                icon: '/logo.png',
                                badge: '/logo.png',
                                tag: `remark-${latestPending.id}`,
                                vibrate: [200, 100, 200, 100, 200],
                                requireInteraction: true,
                                data: {
                                    url: '/officer/history',
                                    remarkId: latestPending.id,
                                    submissionId: latestPending.submissionId,
                                    courseNumber: latestPending.courseNumber
                                }
                            } as any
                        );
                    })
                    .catch(() => {});
            }
        }
    }, [pendingRemarks]);

    // Alert Course Officer with a phone push notification & toast when a remark is marked as RESOLVED by the Commandant
    useEffect(() => {
        if (resolvedRemarks.length === 0 || typeof window === 'undefined') return;

        let notifiedIds: string[] = [];
        try {
            const raw = localStorage.getItem('polac_notified_resolved_remark_ids');
            notifiedIds = raw ? JSON.parse(raw) : [];
        } catch {}

        const notifiedSet = new Set(notifiedIds);
        let updated = false;

        for (const resRemark of resolvedRemarks) {
            const resKey = `${resRemark.id}-${resRemark.resolvedAt || resRemark.updatedAt}`;
            if (!notifiedSet.has(resKey)) {
                notifiedSet.add(resKey);
                updated = true;

                const notifTitle = `Parade Inquiry Resolved — ${resRemark.courseNumber ? formatRC(resRemark.courseNumber) : 'Acknowledged'}`;
                const notifBody = `Director Field Studies acknowledged your justification and resolved the ${String(resRemark.paradeType || 'Parade').toUpperCase()} (${resRemark.paradeDate}) inquiry.`;

                if (
                    'Notification' in window &&
                    window.Notification.permission === 'granted' &&
                    localStorage.getItem('polac_local_push_enabled') !== 'false'
                ) {
                    if ('serviceWorker' in navigator) {
                        navigator.serviceWorker.ready
                            .then(reg => {
                                reg.showNotification(notifTitle, {
                                    body: notifBody,
                                    icon: '/logo.png',
                                    badge: '/logo.png',
                                    tag: `remark-resolved-${resRemark.id}`,
                                    renotify: true,
                                    vibrate: [200, 100, 200],
                                    requireInteraction: true,
                                    data: {
                                        url: '/officer/history',
                                        remarkId: resRemark.id,
                                        submissionId: resRemark.submissionId,
                                        courseNumber: resRemark.courseNumber
                                    }
                                } as any);
                            })
                            .catch(() => {
                                try {
                                    new window.Notification(notifTitle, {
                                        body: notifBody,
                                        icon: '/logo.png',
                                        tag: `remark-resolved-${resRemark.id}`
                                    });
                                } catch {}
                            });
                    } else {
                        try {
                            new window.Notification(notifTitle, {
                                body: notifBody,
                                icon: '/logo.png',
                                tag: `remark-resolved-${resRemark.id}`
                            });
                        } catch {}
                    }
                }

                toast.success(notifBody, {
                    id: `resolved-toast-${resRemark.id}`,
                    duration: 6000
                });
            }
        }

        if (updated) {
            try {
                localStorage.setItem(
                    'polac_notified_resolved_remark_ids',
                    JSON.stringify(Array.from(notifiedSet).slice(-200))
                );
            } catch {}
        }
    }, [resolvedRemarks]);

    // Listen for clicks on in-app toast or Service Worker push notification
    useEffect(() => {
        const handleToastJump = (e: Event) => {
            const detail = (e as CustomEvent)?.detail;
            const targetRemark =
                (detail?.remarkId && remarks.find(r => String(r.id) === String(detail.remarkId))) ||
                pendingRemarks[0] ||
                resolvedRemarks[0] ||
                remarks[0];
            if (targetRemark) {
                handleJumpToReply(targetRemark);
            } else {
                navigate('/officer/history');
            }
        };

        const handleSwMessage = (event: MessageEvent) => {
            if (event.data && event.data.type === 'PUSH_NOTIFICATION_CLICK') {
                const targetRemark =
                    (event.data.remarkId && remarks.find(r => String(r.id) === String(event.data.remarkId))) ||
                    pendingRemarks[0] ||
                    remarks[0];
                if (targetRemark) {
                    handleJumpToReply(targetRemark);
                } else if (event.data.url) {
                    navigate(event.data.url);
                }
            }
        };

        window.addEventListener('open-officer-remark-reply', handleToastJump);
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', handleSwMessage);
        }
        return () => {
            window.removeEventListener('open-officer-remark-reply', handleToastJump);
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.removeEventListener('message', handleSwMessage);
            }
        };
    }, [pendingRemarks, remarks, handleJumpToReply, navigate]);

    const handleQuickReplySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!popupRemark || !quickReplyText.trim()) {
            toast.error('Please enter your justification before submitting.');
            return;
        }
        setIsSubmittingQuickReply(true);
        try {
            await dbService.respondToCommandantRemark({
                remarkId: popupRemark.id,
                officerResponse: quickReplyText.trim(),
                officerName: currentUser?.fullName || popupRemark.courseOfficerName || 'Course Officer',
                officerId: currentUser?.id
            });
            setQuickReplyText('');
            setPopupRemark(null);
            await refreshRemarks();
            toast.success('Justification submitted to the Commandant.');
        } catch (err: any) {
            toast.error(err?.message || 'Failed to submit justification.');
        } finally {
            setIsSubmittingQuickReply(false);
        }
    };

    const getTitle = () => {
        const path = location.pathname;
        if (path.includes('submit')) return 'Submit Parade State';
        if (path.includes('history')) return 'Submission History';
        return 'Officer Dashboard';
    };

    const tabs = [
        { path: '/officer', label: 'Dashboard', icon: LayoutDashboard, end: true, badge: 0 },
        { path: '/officer/submit', label: 'Submit Parade', icon: Plus, badge: 0 },
        { path: '/officer/history', label: 'Submission History', icon: History, badge: pendingRemarksCount },
    ];

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Mobile Hamburger Menu Overlay */}
            {isMenuOpen && (
                <>
                    <div
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] md:hidden transition-opacity"
                        onClick={() => setIsMenuOpen(false)}
                    ></div>
                    <div className="fixed inset-y-0 left-0 w-72 bg-white z-[110] md:hidden shadow-2xl flex flex-col">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="font-black text-blue-600 tracking-tighter text-xl">PARADE <span className="text-slate-400">V2</span></h3>
                            <button onClick={() => setIsMenuOpen(false)} className="p-2 text-slate-400 hover:text-slate-600">
                                <Plus className="rotate-45" size={24} />
                            </button>
                        </div>
                        <nav className="flex-1 p-4 space-y-2">
                            {tabs.map(tab => (
                                <NavLink
                                    key={tab.path}
                                    to={tab.path}
                                    end={tab.end}
                                    onClick={() => setIsMenuOpen(false)}
                                    className={({ isActive }) =>
                                        `flex items-center justify-between px-4 py-4 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`
                                    }
                                >
                                    <div className="flex items-center space-x-3">
                                        <tab.icon size={20} />
                                        <span>{tab.label}</span>
                                    </div>
                                    {tab.badge > 0 && (
                                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black uppercase tracking-wider">
                                            Action Required ({tab.badge})
                                        </span>
                                    )}
                                </NavLink>
                            ))}
                        </nav>

                        <div className="p-4 border-t border-slate-100 mt-auto">
                            <button
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    logout();
                                }}
                                className="w-full flex items-center space-x-3 px-4 py-4 text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all group font-bold"
                            >
                                <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
                                <span>Sign Out</span>
                            </button>
                        </div>

                        <div className="p-6 border-t border-slate-100 italic text-[10px] text-slate-400 text-center">
                            Nigerian Police Academy • Parade Management System
                        </div>
                    </div>
                </>
            )}

            <Header
                title={getTitle()}
                onMenuClick={() => setIsMenuOpen(true)}
            />

            <div className="max-w-6xl mx-auto p-4 sm:p-6 md:p-10 space-y-6 md:space-y-10 w-full flex-1 relative">
                {/* Desktop Navigation */}
                <div className="hidden md:flex items-center space-x-2 border-b border-slate-200 pb-6 mb-8">
                    {tabs.map(tab => (
                        <NavLink
                            key={tab.path}
                            to={tab.path}
                            end={tab.end}
                            className={({ isActive }) =>
                                `flex items-center space-x-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`
                            }
                        >
                            <tab.icon size={18} />
                            <span>{tab.label}</span>
                            {tab.badge > 0 && (
                                <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black uppercase tracking-wider animate-pulse">
                                    Action Required ({tab.badge})
                                </span>
                            )}
                        </NavLink>
                    ))}
                </div>

                {/* ── Mobile-First Instant Commandant Remark Alert Banner (Visible immediately on login without opening hamburger menu) ── */}
                {pendingRemarks.length > 0 && (
                    <div
                        onClick={() => handleJumpToReply(pendingRemarks[0])}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') handleJumpToReply(pendingRemarks[0]);
                        }}
                        className="cursor-pointer bg-gradient-to-r from-amber-50 via-amber-50/90 to-white border-2 border-amber-400/90 rounded-2xl md:rounded-3xl p-4 sm:p-5 shadow-lg shadow-amber-900/5 hover:shadow-xl transition-all flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-3 duration-300"
                    >
                        <div className="flex items-start gap-3.5 min-w-0">
                            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20">
                                <Flag size={20} className="animate-bounce" />
                            </div>
                            <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="px-2.5 py-0.5 rounded-full bg-amber-600 text-white text-[10px] font-black uppercase tracking-wider">
                                        Commandant's Remark • Action Required ({pendingRemarks.length})
                                    </span>
                                    {pendingRemarks[0].paradeType && (
                                        <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white text-[10px] font-mono font-bold uppercase">
                                            {pendingRemarks[0].paradeType}
                                        </span>
                                    )}
                                    {pendingRemarks[0].paradeDate && (
                                        <span className="text-[10px] font-mono font-bold text-slate-500">
                                            {new Date(pendingRemarks[0].paradeDate).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs sm:text-sm font-black text-slate-900 leading-snug break-words">
                                    "{pendingRemarks[0].remarkText}"
                                </p>
                                <p className="text-[11px] font-bold text-amber-800">
                                    Tap here to open the Remarks & Resolution Log and submit your justification.
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={e => {
                                e.stopPropagation();
                                handleJumpToReply(pendingRemarks[0]);
                            }}
                            className="w-full sm:w-auto min-h-[46px] px-5 py-3 bg-slate-900 hover:bg-blue-900 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shrink-0 shadow-md transition-all active:scale-95"
                        >
                            <MessageSquare size={15} />
                            <span>Tap to Reply Now</span>
                            <ArrowRight size={14} />
                        </button>
                    </div>
                )}

                {/* ── Automatic Mobile Pop-Up Modal on Login / New Commandant Remark ── */}
                {popupRemark && (
                    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
                        <div
                            className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white px-5 py-4 sm:px-6 sm:py-5 flex items-start justify-between gap-3 shrink-0">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-400 flex items-center justify-center shrink-0">
                                        <Flag size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="px-2 py-0.5 rounded bg-rose-500 text-white text-[9px] font-black uppercase tracking-widest">
                                                Immediate Action Required
                                            </span>
                                            {popupRemark.courseNumber && (
                                                <span className="px-2 py-0.5 rounded bg-blue-500/20 border border-blue-400/30 text-blue-200 text-[10px] font-mono font-black uppercase">
                                                    {formatRC(popupRemark.courseNumber)}
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-white mt-1 leading-snug">
                                            Commandant's Parade Remark
                                        </h3>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setPopupRemark(null)}
                                    className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                                    aria-label="Close alert"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 bg-slate-50/60">
                                {/* Metadata Strip */}
                                <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs">
                                    <span className="flex items-center gap-1.5 font-black text-slate-800">
                                        <Shield size={14} className="text-blue-900" />
                                        <span>From: {popupRemark.commandantName || 'COMMANDANT'}</span>
                                    </span>
                                    <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-500 uppercase">
                                        <Clock size={12} />
                                        <span>
                                            {String(popupRemark.paradeType || 'MUSTER').toUpperCase()} •{' '}
                                            {popupRemark.paradeDate
                                                ? new Date(popupRemark.paradeDate).toLocaleDateString()
                                                : 'Today'}
                                        </span>
                                    </span>
                                </div>

                                {/* Previous Thread History if Commandant followed up */}
                                {popupRemark.thread && popupRemark.thread.length > 0 && (
                                    <div className="space-y-2 pl-3 border-l-2 border-slate-300">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                            Previous Exchange History
                                        </p>
                                        {popupRemark.thread.map((item, idx) => (
                                            <div
                                                key={item.id || idx}
                                                className="bg-white p-2.5 rounded-xl border border-slate-200 text-xs space-y-0.5"
                                            >
                                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">
                                                    {item.senderRole === 'commandant'
                                                        ? `Commandant (${item.senderName})`
                                                        : `Your Previous Reply (${item.senderName})`}
                                                </span>
                                                <p className="text-slate-700 font-medium">"{item.message}"</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Commandant's Current Inquiry */}
                                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-1.5">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                                        <CornerDownRight size={12} />
                                        <span>
                                            {popupRemark.thread && popupRemark.thread.length > 0
                                                ? "Commandant's Follow-Up Inquiry"
                                                : "Commandant's Inquiry"}
                                        </span>
                                    </p>
                                    <p className="text-sm font-bold text-slate-900 leading-relaxed">
                                        "{popupRemark.remarkText}"
                                    </p>
                                </div>

                                {/* Quick Inline Reply Form */}
                                <form onSubmit={handleQuickReplySubmit} className="space-y-3 pt-1">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
                                            Quick Reply / Justification to Commandant
                                        </label>
                                        <textarea
                                            rows={3}
                                            value={quickReplyText}
                                            onChange={e => setQuickReplyText(e.target.value)}
                                            placeholder="Enter explanation for absentees or parade state (e.g., Cadets undergoing medical clearance at sick bay)..."
                                            className="w-full p-3.5 bg-white border border-slate-300 focus:border-blue-600 rounded-2xl text-xs sm:text-sm font-medium text-slate-800 outline-none resize-none shadow-2xs"
                                        />
                                    </div>

                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => handleJumpToReply(popupRemark)}
                                            className="w-full sm:w-auto min-h-[46px] px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                                        >
                                            <History size={15} />
                                            <span>Open Remarks & Resolution Log</span>
                                        </button>

                                        <button
                                            type="submit"
                                            disabled={isSubmittingQuickReply || !quickReplyText.trim()}
                                            className="w-full sm:w-auto min-h-[46px] px-5 py-3 bg-blue-900 hover:bg-blue-800 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 transition-all"
                                        >
                                            <Send size={14} />
                                            <span>{isSubmittingQuickReply ? 'Sending...' : 'Send Reply Now'}</span>
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                {/* Urgent Submission Empty State Hint */}
                {currentUser && (() => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    const hasSubmittedToday = records.some(r => r.officerId === currentUser.id && r.date === todayStr);

                    if (!hasSubmittedToday) {
                        return (
                            <div className="bg-gradient-to-r from-red-950 to-slate-900 mt-2 mb-8 p-6 md:p-8 rounded-2xl md:rounded-3xl shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 border-l-4 md:border-l-[6px] border-rose-600 animate-in fade-in slide-in-from-top-4 duration-500 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 rounded-full translate-x-1/3 -translate-y-1/2 blur-2xl group-hover:bg-rose-500/20 transition-colors"></div>
                                <div className="absolute bottom-0 left-0 w-40 h-40 bg-orange-500/10 rounded-full -translate-x-1/2 translate-y-1/2 blur-xl"></div>
                                
                                <div className="relative z-10 flex text-center md:text-left items-center flex-col md:flex-row gap-5 md:gap-6 w-full">
                                    <div className="w-14 h-14 md:w-16 md:h-16 bg-rose-950/50 rounded-full flex items-center justify-center backdrop-blur-md border border-rose-500/50 shadow-inner shrink-0 text-rose-500 ring-4 ring-rose-500/20">
                                        <AlertCircle className="w-8 h-8 md:w-9 md:h-9 animate-pulse" strokeWidth={2.5} />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-white text-lg md:text-xl font-black mb-1 md:mb-1.5 tracking-widest uppercase">URGENT COMMAND DIRECTIVE: PENDING PARADE RETURN</h3>
                                        <p className="text-rose-200/90 text-[13px] md:text-sm font-medium leading-relaxed max-w-2xl">Regimental standards require absolute compliance. You have not submitted the daily accountability state for your assigned squad. File your return immediately to maintain institutional readiness.</p>
                                    </div>
                                </div>
                            </div>
                        );
                    }
                    return null;
                })()}

                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
                    <Routes>
                        <Route index element={<OfficerProfile />} />
                        <Route path="submit" element={<ParadeForm />} />
                        <Route path="history" element={<SubmissionHistory />} />
                    </Routes>
                </div>
            </div>
        </div>
    );
};
