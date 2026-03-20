import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    Shield,
    LayoutDashboard,
    FileText,
    LogOut,
    Users,
    Activity,
    X,
    ShieldAlert
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
    const { logout } = useAuth();

    const navItems = [
        { path: '/commandant', icon: LayoutDashboard, label: 'Overview', end: true },
        { path: '/commandant/audit', icon: FileText, label: 'Attendance Audit' },
        { path: '/commandant/cadet_registry', icon: Users, label: 'Cadet Registry' },
        { path: '/commandant/analytics', icon: Activity, label: 'Command Analytics' },
    ];

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-40 md:hidden transition-opacity animate-in fade-in"
                    onClick={onClose}
                />
            )}

            <div className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-blue-900/95 backdrop-blur-xl border-r border-white/10 flex flex-col h-full transform transition-transform duration-300 ease-in-out
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                md:relative md:translate-x-0
            `}>
                {/* Tactical Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/10">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-500/10 rounded flex items-center justify-center border border-blue-400/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                            <Shield size={18} className="text-blue-400" />
                        </div>
                        <h2 className="font-black text-white tracking-tighter text-lg uppercase">
                            POLAC <span className="text-blue-400">CMD</span>
                        </h2>
                    </div>
                    {onClose && (
                        <button onClick={onClose} className="p-2 md:hidden text-white/40 hover:text-white">
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto mt-2">
                    {navItems.map(item => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.end}
                            onClick={onClose}
                            className={({ isActive }) =>
                                `w-full flex items-center space-x-3 px-4 py-3 rounded-md transition-all duration-200 border border-transparent ${isActive
                                    ? 'bg-white/10 text-white border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]'
                                    : 'text-blue-100/60 hover:text-white hover:bg-white/5 hover:border-white/5'}`
                            }
                        >
                            <item.icon size={18} className="shrink-0" />
                            <span className="text-[11px] font-black uppercase tracking-widest">{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                {/* System Status & Sign Out */}
                <div className="mt-auto border-t border-white/5">
                    <div className="p-4 bg-black/20 flex items-center justify-between border-b border-white/5">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                            <span className="text-[8px] font-mono font-bold text-emerald-500/80 uppercase tracking-widest">
                                System: Active
                            </span>
                        </div>
                        <span className="text-[8px] font-mono text-white/20">V2.4.0</span>
                    </div>
                    <div className="p-4">
                        <button
                            onClick={logout}
                            className="w-full flex items-center space-x-3 px-4 py-3 text-blue-100/40 hover:text-rose-400 hover:bg-rose-500/5 rounded-md transition-all group"
                        >
                            <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Secure Sign Out</span>
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};
