import React, { useState } from 'react';
import { LayoutDashboard, Plus, History, LogOut } from 'lucide-react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { Header } from '../../Layout/Header';
import { OfficerProfile } from './OfficerProfile';
import { ParadeForm } from '../../Parade/ParadeForm';
import { SubmissionHistory } from './SubmissionHistory';

export const OfficerDashboard: React.FC = () => {
    const { logout } = useAuth();
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const getTitle = () => {
        const path = location.pathname;
        if (path.includes('submit')) return 'Submit Parade State';
        if (path.includes('history')) return 'Submission History';
        return 'Officer Dashboard';
    };

    const tabs = [
        { path: '/officer', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { path: '/officer/submit', label: 'Submit Parade', icon: Plus },
        { path: '/officer/history', label: 'Submission History', icon: History },
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
                                        `flex items-center space-x-3 px-4 py-4 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`
                                    }
                                >
                                    <tab.icon size={20} />
                                    <span>{tab.label}</span>
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

            <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-10 w-full flex-1 relative">
                {/* Unified Navigation */}
                <div className="hidden md:flex items-center space-x-2 border-b border-slate-200 pb-6 mb-8 w-full">
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
                        </NavLink>
                    ))}
                </div>

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
