import React, { useMemo, useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
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
import { dbService } from '../../services/dbService';

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

    // Count remarks needing review for Commandant / Senior Officers
    const commandantNeedsReviewCount = useMemo(() => {
        return remarks.filter(
            r => r.status !== 'resolved' && (Boolean(r.officerResponse) || r.status === 'addressed')
        ).length;
    }, [remarks]);

    const commandantActiveCount = useMemo(() => {
        return remarks.filter(r => r.status !== 'resolved').length;
    }, [remarks]);

    // Count pending remarks for the logged-in Course Officer
    const officerPendingRemarksCount = useMemo(() => {
        if (!currentUser || currentUser.role !== UserRole.COURSE_OFFICER) return 0;
        return remarks.filter(r => {
            const matchesOfficer =
                (r.courseOfficerId && String(r.courseOfficerId) === String(currentUser.id)) ||
                (r.courseNumber &&
                    currentUser.courseNumber &&
                    Number(r.courseNumber) === Number(currentUser.courseNumber)) ||
                (r.courseOfficerName &&
                    currentUser.fullName &&
                    r.courseOfficerName.toLowerCase() === currentUser.fullName.toLowerCase());
            return matchesOfficer && r.status === 'pending' && !r.officerResponse;
        }).length;
    }, [remarks, currentUser]);

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
            const cmdBadge =
                commandantNeedsReviewCount > 0
                    ? commandantNeedsReviewCount
                    : commandantActiveCount > 0
                    ? commandantActiveCount
                    : undefined;
            return [
                { path: '/commandant', label: 'Parades', icon: LayoutDashboard, end: true },
                {
                    path: '/commandant/remarks',
                    label: 'Remarks',
                    icon: MessageSquare,
                    badge: cmdBadge,
                    badgeTone: commandantNeedsReviewCount > 0 ? 'amber' : 'blue'
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
                badge: officerPendingRemarksCount > 0 ? officerPendingRemarksCount : undefined,
                badgeTone: 'amber'
            },
            { path: '/officer/history', label: 'History', icon: History }
        ];
    }, [currentUser, commandantNeedsReviewCount, commandantActiveCount, officerPendingRemarksCount]);

    if (!currentUser || navItems.length === 0) return null;

    return (
        <nav
            aria-label="Mobile Primary Navigation"
            className={
                isIOS
                    ? 'fixed inset-x-3 bottom-[max(0.65rem,env(safe-area-inset-bottom))] z-40 md:hidden rounded-full ios-liquid-glass px-2 py-1.5'
                    : 'fixed bottom-0 inset-x-0 z-40 md:hidden bg-blue-900/95 backdrop-blur-xl border-t border-white/10 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.3)]'
            }
        >
            <div className="flex items-stretch justify-around w-full max-w-lg mx-auto px-1">
                {navItems.map(item => {
                    const IconComponent = item.icon;
                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.end}
                            className={({ isActive }) =>
                                `relative flex-1 min-w-[48px] ${
                                    isIOS ? 'min-h-[50px] py-1 px-1 rounded-full' : 'min-h-[56px] py-1.5 px-1'
                                } flex flex-col items-center justify-center gap-1 select-none active:scale-95 transition-all duration-150 ${
                                    isActive
                                        ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]'
                                        : isIOS
                                        ? 'text-white/75 hover:text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]'
                                        : 'text-blue-200/60 hover:text-white'
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    {/* iOS Liquid Glass Spring Pill vs Standard Top Bar Indicator */}
                                    {isActive &&
                                        (isIOS ? (
                                            <motion.div
                                                layoutId="ios-liquid-pill"
                                                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                                                className="absolute inset-0 rounded-full bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] pointer-events-none"
                                            />
                                        ) : (
                                            <span className="absolute top-0 inset-x-3 mx-auto w-8 h-1 rounded-b-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.7)] animate-in fade-in duration-150" />
                                        ))}

                                    {/* Icon Container with Optional Unread/Count Badge */}
                                    <div
                                        className={`relative z-10 flex items-center justify-center px-3.5 py-0.5 rounded-full transition-colors ${
                                            isActive && !isIOS
                                                ? 'bg-white/15 border border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.06)]'
                                                : ''
                                        }`}
                                    >
                                        <IconComponent
                                            size={20}
                                            strokeWidth={isActive ? 2.5 : 2}
                                            className="shrink-0"
                                        />
                                        {item.badge !== undefined && item.badge > 0 && (
                                            <span
                                                className={`absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-mono font-black flex items-center justify-center leading-none border border-blue-900 shadow-2xs ${
                                                    item.badgeTone === 'amber'
                                                        ? 'bg-amber-400 text-slate-950 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                                                        : item.badgeTone === 'rose'
                                                        ? 'bg-rose-500 text-white'
                                                        : 'bg-blue-400 text-slate-950'
                                                }`}
                                            >
                                                {item.badge > 99 ? '99+' : item.badge}
                                            </span>
                                        )}
                                    </div>

                                    {/* Single-Line Concise Label */}
                                    <span
                                        className={`relative z-10 text-[10px] leading-none uppercase tracking-wider truncate max-w-full ${
                                            isActive
                                                ? 'font-black text-white'
                                                : isIOS
                                                ? 'font-bold text-white/75'
                                                : 'font-bold text-blue-200/60'
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

