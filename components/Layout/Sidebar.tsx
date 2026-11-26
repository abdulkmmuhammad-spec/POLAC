import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    Shield,
    LayoutDashboard,
    FileText,
    MessageSquare,
    LogOut,
    Users,
    Activity,
    X,
    Settings,
    Stethoscope
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useParade } from '../../context/ParadeContext';
import { UserRole } from '../../types';
import { dbService, supabase } from '../../services/dbService';
import { isExecutiveCommand, isDeputyCommandant, isDFS } from '../../utils/commandHierarchy';
import { getUnreadExecutiveCount, getUnreadRemarkCount } from '../../utils/executiveChatState';

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
    const { currentUser, logout } = useAuth();
    const { remarks } = useParade();
    const isAdmin = currentUser?.role === UserRole.ADMIN;
    const isMedical = currentUser?.role === UserRole.MEDICAL_OFFICER;
    const isMatron = currentUser?.role === UserRole.MATRON;
    const isExecutiveCmd = isExecutiveCommand(currentUser);
    const userIsDfs = isDFS(currentUser);

    const [unreadBriefsCount, setUnreadBriefsCount] = React.useState(0);

    React.useEffect(() => {
        if (!currentUser || (!isExecutiveCmd && !userIsDfs)) {
            setUnreadBriefsCount(0);
            return;
        }
        const myRole = isDeputyCommandant(currentUser) ? 'deputy_commandant' : 'commandant';
        const refreshBriefsCount = () => {
            dbService
                .fetchCommandReports()
                .then(reports => {
                    if (isExecutiveCmd) {
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
            .channel('sidebar-command-reports')
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
    }, [currentUser, isExecutiveCmd]);

    const [remarkReadTick, setRemarkReadTick] = React.useState(0);

    React.useEffect(() => {
        const bump = () => setRemarkReadTick(t => t + 1);
        window.addEventListener('remarks-read-updated', bump);
        return () => window.removeEventListener('remarks-read-updated', bump);
    }, []);

    const unreadRemarkCount = React.useMemo(() => {
        void remarkReadTick;
        return getUnreadRemarkCount(remarks, currentUser);
    }, [remarks, currentUser, remarkReadTick]);

    const activeUnresolvedCount = React.useMemo(() => {
        return remarks.filter(r => r.status !== 'resolved').length;
    }, [remarks]);

    const navItems: Array<{
        path: string;
        icon: any;
        label: string;
        end?: boolean;
        badge?: number;
        badgeTone?: 'amber' | 'blue';
    }> = isAdmin
        ? [
              { path: '/admin', icon: LayoutDashboard, label: 'Overview', end: true },
              {
                  path: '/admin/remarks',
                  icon: MessageSquare,
                  label: 'Remarks Log',
                  badge: activeUnresolvedCount > 0 ? activeUnresolvedCount : undefined,
                  badgeTone: 'blue'
              },
              { path: '/admin/audit', icon: FileText, label: 'Attendance Audit' },
              { path: '/admin/cadet_registry', icon: Users, label: 'Cadet Registry' },
              { path: '/admin/analytics', icon: Activity, label: 'Command Analytics' },
              { path: '/admin/settings', icon: Settings, label: 'System Settings' }
          ]
        : isMatron
        ? [
              { path: '/matron', icon: LayoutDashboard, label: 'Parade', end: true }
          ]
        : isMedical
        ? [
              { path: '/medical', icon: Stethoscope, label: 'Sickbay Triage', end: true },
              { path: '/medical/remarks', icon: MessageSquare, label: 'Medical Remarks' }
          ]
        : [
              { path: '/commandant', icon: LayoutDashboard, label: 'Parade States', end: true },
              {
                  path: '/commandant/remarks',
                  icon: MessageSquare,
                  label: isExecutiveCmd ? 'Executive Briefs' : 'Remarks & Directives',
                  badge: isExecutiveCmd
                      ? unreadBriefsCount > 0
                          ? unreadBriefsCount
                          : undefined
                      : unreadRemarkCount + unreadBriefsCount > 0
                      ? unreadRemarkCount + unreadBriefsCount
                      : undefined,
                  badgeTone: 'blue'
              },
              { path: '/commandant/audit', icon: FileText, label: 'Attendance Audit' }
          ];

    return (
        <aside className="hidden md:flex md:relative w-64 bg-blue-900/95 backdrop-blur-xl border-r border-white/10 flex-col h-full shrink-0">
            {/* Tactical Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/10">
                <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 bg-blue-500/10 rounded-lg flex items-center justify-center border border-blue-400/20 shadow-[0_0_15px_rgba(59,130,246,0.1)] overflow-hidden shrink-0">
                        <img src="/logo.png" alt="POLAC Logo" className="w-[82%] h-[82%] object-contain block" />
                    </div>
                    <h2 className="font-black text-white tracking-tighter text-lg uppercase">
                        POLAC <span className={isMatron ? 'text-violet-300' : isMedical ? 'text-rose-400' : 'text-blue-400'}>{isMatron ? 'MATRON' : isMedical ? 'MED' : isAdmin ? 'ADMIN' : 'CMD'}</span>
                    </h2>
                </div>
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto mt-2">
                {navItems.map(item => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        end={item.end}
                        className={({ isActive }) =>
                            `w-full flex items-center justify-between px-4 py-3 rounded-md transition-all duration-200 border border-transparent ${isActive
                                ? 'bg-white/10 text-white border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]'
                                : 'text-blue-100/60 hover:text-white hover:bg-white/5 hover:border-white/5'}`
                        }
                    >
                        <div className="flex items-center space-x-3 min-w-0">
                            <item.icon size={18} className="shrink-0" />
                            <span className="text-xs font-semibold tracking-wide truncate">{item.label}</span>
                        </div>
                        {item.badge !== undefined && item.badge > 0 && (
                            <span
                                className={`ml-2 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold shrink-0 ${
                                    item.badgeTone === 'amber'
                                        ? 'bg-amber-400 text-slate-950 shadow-[0_0_10px_rgba(251,191,36,0.4)]'
                                        : 'bg-blue-500/30 text-blue-200 border border-blue-400/30'
                                }`}
                            >
                                {item.badge}
                            </span>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* System Status & Sign Out */}
            <div className="mt-auto border-t border-white/5">
                <div className="p-4 bg-black/20 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        <span className="text-[11px] font-mono font-semibold text-emerald-400">
                            System: Active
                        </span>
                    </div>
                    <span className="text-[11px] font-mono text-white/40">V2.4.0</span>
                </div>
                <div className="p-4">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            logout();
                        }}
                        className="w-full min-h-[44px] flex items-center space-x-3 px-4 py-2.5 text-blue-100/70 hover:text-rose-400 hover:bg-rose-500/5 rounded-md transition-all group"
                    >
                        <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="text-xs font-semibold">Sign Out</span>
                    </button>
                </div>
            </div>
        </aside>
    );
};
