import React, { useMemo, useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
    LayoutDashboard,
    FileText,
    MessageSquare,
    Users,
    Activity,
    Settings,
    Plus,
    History,
    Stethoscope
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useParade } from '../../context/ParadeContext';
import { UserRole } from '../../types';
import { dbService, supabase } from '../../services/dbService';
import { isExecutiveCommand, isDeputyCommandant, isDFS } from '../../utils/commandHierarchy';
import { getUnreadExecutiveCount, getUnreadRemarkCount } from '../../utils/executiveChatState';

interface BottomNavItem {
    path: string;
    label: string;
    icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
    end?: boolean;
    badge?: number;
    badgeTone?: 'amber' | 'rose' | 'blue';
}

const useIsIOS = (): boolean => {
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        const detect = () => {
            if (typeof navigator === 'undefined') return false;
            return (
                /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
            );
        };
        setIsIOS(detect());
    }, []);

    return isIOS;
};

export const BottomNav: React.FC = () => {
    const { currentUser } = useAuth();
    const { remarks } = useParade();
    const isIOS = useIsIOS();
    const shouldReduceMotion = useReducedMotion();

    const [remarkReadTick, setRemarkReadTick] = useState(0);

    useEffect(() => {
        const bump = () => setRemarkReadTick(t => t + 1);
        window.addEventListener('remarks-read-updated', bump);
        return () => window.removeEventListener('remarks-read-updated', bump);
    }, []);

    // WhatsApp-style unread remark count (clears when user opens the chat)
    const unreadRemarkCount = useMemo(() => {
        void remarkReadTick;
        return getUnreadRemarkCount(remarks, currentUser);
    }, [remarks, currentUser, remarkReadTick]);

    // Live count of pending sickbay verifications for Medical Officer
    const [medicalPendingCount, setMedicalPendingCount] = React.useState(0);

    React.useEffect(() => {
        const updateMedicalCount = () => {
            if (currentUser?.role === UserRole.MEDICAL_OFFICER) {
                dbService.fetchSickbayVerifications({ status: 'pending_verification' })
                    .then(items => setMedicalPendingCount(items.length))
                    .catch(() => {});
            }
        };

        updateMedicalCount();
        window.addEventListener('sickbay-verifications-updated', updateMedicalCount);
        return () => window.removeEventListener('sickbay-verifications-updated', updateMedicalCount);
    }, [currentUser]);

    // Live count of unread Executive Briefs / Chats (Commandant, Deputy Commandant, and DFS)
    const [unreadBriefsCount, setUnreadBriefsCount] = React.useState(0);

    React.useEffect(() => {
        const isExec = isExecutiveCommand(currentUser);
        const userIsDfs = isDFS(currentUser);
        if (!currentUser || (!isExec && !userIsDfs)) {
            setUnreadBriefsCount(0);
            return;
        }
        const myRole = isDeputyCommandant(currentUser) ? 'deputy_commandant' : 'commandant';
        const refreshBriefsCount = () => {
            dbService
                .fetchCommandReports()
                .then(reports => {
                    if (isExec) {
                        const filtered = reports.filter(
                            r => r.recipientRole === 'both' || r.recipientRole === myRole
                        );
                        setUnreadBriefsCount(getUnreadExecutiveCount(filtered, currentUser, 'dfs'));
                    } else {
                        const cmdReports = reports.filter(
                            r => r.recipientRole === 'both' || r.recipientRole === 'commandant'
                        );
                        const dcmdReports = reports.filter(
                            r => r.recipientRole === 'both' || r.recipientRole === 'deputy_commandant'
                        );
                        setUnreadBriefsCount(
                            getUnreadExecutiveCount(cmdReports, currentUser, 'commandant') +
                                getUnreadExecutiveCount(dcmdReports, currentUser, 'deputy_commandant')
                        );
                    }
                })
                .catch(() => {});
        };

        refreshBriefsCount();
        window.addEventListener('command-reports-updated', refreshBriefsCount);

        const channel = supabase
            .channel('bottomnav-command-reports')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'command_reports' },
                refreshBriefsCount
            )
            .subscribe();

        return () => {
            window.removeEventListener('command-reports-updated', refreshBriefsCount);
            supabase.removeChannel(channel);
        };
    }, [currentUser]);

    const navItems: BottomNavItem[] = useMemo(() => {
        if (!currentUser) return [];

        if (currentUser.role === UserRole.MEDICAL_OFFICER) {
            return [
                {
                    path: '/medical',
                    label: 'Sickbay',
                    icon: Stethoscope,
                    end: true,
                    badge: medicalPendingCount > 0 ? medicalPendingCount : undefined,
                    badgeTone: 'amber'
                },
                { path: '/medical/remarks', label: 'Remarks', icon: MessageSquare }
            ];
        }

        if (currentUser.role === UserRole.ADMIN) {
            return [
                { path: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
                { path: '/admin/audit', label: 'Audit', icon: FileText },
                { path: '/admin/cadet_registry', label: 'Cadets', icon: Users },
                { path: '/admin/analytics', label: 'Analytics', icon: Activity },
                { path: '/admin/settings', label: 'Settings', icon: Settings }
            ];
        }

        if (currentUser.role === UserRole.COMMANDANT) {
            const isExec = isExecutiveCommand(currentUser);
            const totalDfsBadge = unreadRemarkCount + unreadBriefsCount;
            const cmdBadge = isExec
                ? unreadBriefsCount > 0
                    ? unreadBriefsCount
                    : undefined
                : totalDfsBadge > 0
                ? totalDfsBadge
                : undefined;
            return [
                { path: '/commandant', label: 'Parades', icon: LayoutDashboard, end: true },
                {
                    path: '/commandant/remarks',
                    label: isExec ? 'Briefs' : 'Remarks',
                    icon: MessageSquare,
                    badge: cmdBadge,
                    badgeTone: 'blue'
                },
                { path: '/commandant/audit', label: 'Audit', icon: FileText }
            ];
        }

        // Default: COURSE_OFFICER (PRD v1.0: 4-Tab Architecture with Dedicated Remarks Tab)
        return [
            { path: '/officer', label: 'Dashboard', icon: LayoutDashboard, end: true },
            { path: '/officer/submit', label: 'Submit', icon: Plus },
            {
                path: '/officer/remarks',
                label: 'Remarks',
                icon: MessageSquare,
                badge: unreadRemarkCount > 0 ? unreadRemarkCount : undefined,
                badgeTone: 'blue'
            },
            { path: '/officer/history', label: 'History', icon: History }
        ];
    }, [
        currentUser,
        unreadRemarkCount,
        medicalPendingCount,
        unreadBriefsCount
    ]);

    if (!currentUser || navItems.length === 0) return null;

    return (
        <nav
            aria-label="Mobile Primary Navigation"
            className={
                isIOS
                    ? 'fixed bottom-0 inset-x-0 z-50 md:hidden bg-white ios-liquid-glass pb-[env(safe-area-inset-bottom)]'
                    : 'fixed bottom-0 inset-x-0 z-50 md:hidden bg-blue-900 border-t border-white/10 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.2)]'
            }
        >
            {/* Apple HIG Scroll Edge Fade: content fades cleanly before meeting the bar */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-5 inset-x-0 h-5 bg-gradient-to-t from-slate-50/95 to-transparent"
            />
            <div className="flex items-stretch justify-around w-full max-w-lg mx-auto h-[52px] px-1">
                {navItems.map(item => {
                    const IconComponent = item.icon;
                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.end}
                            className={({ isActive }) =>
                                `relative flex-1 min-w-[48px] h-full py-1 px-1 flex flex-col items-center justify-center gap-0.5 select-none active:scale-95 transition-all duration-150 ${
                                    isIOS
                                        ? isActive
                                            ? 'text-blue-900'
                                            : 'text-slate-500 hover:text-blue-900'
                                        : isActive
                                        ? 'text-white'
                                        : 'text-blue-200/75 hover:text-white'
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    {/* Subtle Active Indicator (WhatsApp/Instagram 49-50px Bar Proportion) */}
                                    {isActive &&
                                        (isIOS ? (
                                            <motion.div
                                                layoutId={shouldReduceMotion ? undefined : 'ios-liquid-pill'}
                                                transition={
                                                    shouldReduceMotion
                                                        ? { duration: 0 }
                                                        : { type: 'spring', stiffness: 420, damping: 32 }
                                                }
                                                className="absolute inset-x-2 inset-y-1 rounded-xl bg-blue-900/10 pointer-events-none"
                                            />
                                        ) : (
                                            <span className="absolute top-0 inset-x-3 mx-auto w-8 h-0.5 rounded-b-full bg-blue-400" />
                                        ))}

                                    {/* Icon Container with Optional Unread/Count Badge */}
                                    <div className="relative z-10 flex items-center justify-center">
                                        <IconComponent
                                            size={22}
                                            strokeWidth={isActive ? 2.4 : 1.9}
                                            className="shrink-0"
                                        />
                                        {item.badge !== undefined && item.badge > 0 && (
                                            <span
                                                className={`absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-mono font-bold flex items-center justify-center leading-none border-2 ${
                                                    isIOS ? 'border-white' : 'border-blue-900'
                                                } shadow-xs ${
                                                    item.badgeTone === 'amber'
                                                        ? 'bg-amber-400 text-slate-950'
                                                        : item.badgeTone === 'rose'
                                                        ? 'bg-rose-500 text-white'
                                                        : 'bg-blue-600 text-white'
                                                }`}
                                            >
                                                {item.badge > 99 ? '99+' : item.badge}
                                            </span>
                                        )}
                                    </div>

                                    {/* Single-Line Concise Label */}
                                    <span
                                        className={`relative z-10 text-[10.5px] leading-tight truncate max-w-full ${
                                            isIOS
                                                ? isActive
                                                    ? 'font-bold text-blue-900'
                                                    : 'font-medium text-slate-500'
                                                : isActive
                                                ? 'font-bold text-white'
                                                : 'font-medium text-blue-200/75'
                                        }`}
                                    >
                                        {item.label}
                                    </span>
                                </>
                            )}
                        </NavLink>
                    );
                })}
            </div>
        </nav>
    );
};

