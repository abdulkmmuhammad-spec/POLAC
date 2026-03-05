import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    Shield,
    LayoutDashboard,
    FileText,
    LogOut,
    Users,
    Activity,
    X
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
        { path: '/commandant/cadet_registry', icon: Users, label: 'Master Registry' },
        { path: '/commandant/analytics', icon: Activity, label: 'Command Analytics' },
    ];

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden transition-opacity animate-in fade-in"
                    onClick={onClose}
                />
            )}

            <div className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col h-full transform transition-transform duration-300 ease-in-out
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                md:relative md:translate-x-0
            `}>
                <div className="p-6 border-b flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-900 rounded-lg flex items-center justify-center text-white">
                            <Shield size={24} />
                        </div>
                        <h2 className="font-bold text-blue-900 tracking-tight text-lg">POLAC CMS</h2>
                    </div>
                    {onClose && (
                        <button onClick={onClose} className="p-2 md:hidden text-slate-400 hover:text-slate-600">
                            <X size={20} />
                        </button>
                    )}
                </div>
                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    {navItems.map(item => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.end}
                            className={({ isActive }) =>
                                `w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`
                            }
                        >
                            <item.icon size={20} />
                            <span className="font-medium text-sm">{item.label}</span>
                        </NavLink>
                    ))}
                </nav>
                <div className="p-4 border-t">
                    <button
                        onClick={logout}
                        className="w-full flex items-center space-x-3 px-4 py-3 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all group"
                    >
                        <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="font-medium">Sign Out</span>
                    </button>
                </div>
            </div>
        </>
    );
};
