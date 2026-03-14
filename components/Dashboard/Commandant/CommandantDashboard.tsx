import React, { useState } from 'react';
import { Settings, Radio, ChevronRight } from 'lucide-react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';

import { Sidebar } from '../../Layout/Sidebar';
import { Header } from '../../Layout/Header';
import { DashboardOverview } from '../DashboardOverview';
import { AttendanceAudit } from './AttendanceAudit';
import { DefaulterAnalysis } from './DefaulterAnalysis';
import { CadetManager } from '../../CadetRegistry/CadetManager';
import { CommandAnalytics } from './CommandAnalytics';
import { OfficerManager } from './OfficerManager';
import { useParade } from '../../../context/ParadeContext';
import { useAuth } from '../../../context/AuthContext';
import { dbService } from '../../../services/dbService';
import { toast } from 'react-hot-toast';

const ActiveRCSettings: React.FC = () => {
    const { activeRC, refreshActiveRC } = useParade();
    const [newRC, setNewRC] = useState<number>(activeRC);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleSave = async () => {
        if (newRC < 1) return;
        setIsSaving(true);
        try {
            const oldRC = activeRC;
            await dbService.setActiveRC(newRC);
            await refreshActiveRC();
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);

            // Log settings change as audit notification
            await dbService.addNotification({
                type: 'settings_change',
                title: 'Active RC Changed',
                content: `Active Regular Course changed from RC${oldRC} to RC${newRC}`,
                timestamp: new Date().toISOString(),
                read: false,
                officerName: 'System',
                yearGroup: 1,
                courseNumber: 0
            });
        } catch (err) {
            toast.error('Failed to update Active RC. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-blue-100 overflow-hidden">
            <div className="p-5 border-b bg-blue-900 text-white flex items-center gap-3">
                <Radio size={18} />
                <div>
                    <h3 className="font-bold text-sm">Active Regular Course Setting</h3>
                    <p className="text-blue-200 text-xs">Controls year level calculation for all cadets</p>
                </div>
            </div>
            <div className="p-6">
                <div className="flex items-start gap-4 mb-5">
                    <div className="flex-1">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Current Active Regular Course</p>
                        <p className="text-3xl font-black text-blue-700">Regular Course {activeRC}</p>
                        <p className="text-[11px] text-slate-500 mt-1">
                            This is the newest/highest course. All year levels are calculated from this value.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="space-y-1 flex-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">New Active Regular Course</label>
                        <input
                            type="number"
                            min={1}
                            className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-blue-500 outline-none font-bold text-slate-800 text-lg"
                            value={newRC}
                            onChange={(e) => setNewRC(parseInt(e.target.value) || activeRC)}
                        />
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || newRC === activeRC}
                        className={`mt-5 flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all shadow-sm ${saved
                            ? 'bg-emerald-600 text-white'
                            : 'bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                    >
                        {isSaving ? 'Saving...' : saved ? '✓ Saved!' : (
                            <>Update <ChevronRight size={16} /></>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

const SubmissionTimeSettings: React.FC = () => {
    const { submissionSettings, updateSubmissionSetting } = useParade();
    const [isSaving, setIsSaving] = useState<string | null>(null);

    const handleUpdate = async (key: 'muster_start_hour' | 'muster_end_hour' | 'tattoo_start_hour', value: number) => {
        setIsSaving(key);
        try {
            const oldValue = submissionSettings[key];
            await updateSubmissionSetting(key, value);

            // Log settings change as audit notification
            const settingLabels: Record<string, string> = {
                muster_start_hour: 'Muster Start Hour',
                muster_end_hour: 'Muster End Hour',
                tattoo_start_hour: 'Tattoo Start Hour'
            };
            await dbService.addNotification({
                type: 'settings_change',
                title: 'Submission Time Changed',
                content: `${settingLabels[key]} changed from ${oldValue}:00 to ${value}:00`,
                timestamp: new Date().toISOString(),
                read: false,
                officerName: 'System',
                yearGroup: 1,
                courseNumber: 0
            });
        } finally {
            setIsSaving(null);
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-blue-100 overflow-hidden mt-6 text-slate-800">
            <div className="p-5 border-b bg-slate-800 text-white flex items-center gap-3">
                <Settings size={18} />
                <div>
                    <h3 className="font-bold text-sm">Parade Submission Time Windows</h3>
                    <p className="text-slate-300 text-xs">Configure when officers can submit records</p>
                </div>
            </div>
            <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Morning Muster Window</label>
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <p className="text-[10px] text-slate-500 mb-1">Start Hour (24h)</p>
                                <input
                                    type="number"
                                    min={0}
                                    max={23}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-blue-500 outline-none font-bold"
                                    value={submissionSettings.musterStartHour}
                                    onChange={(e) => handleUpdate('muster_start_hour', parseInt(e.target.value) || 0)}
                                    disabled={isSaving === 'muster_start_hour'}
                                />
                            </div>
                            <div className="pt-4 text-slate-300">to</div>
                            <div className="flex-1">
                                <p className="text-[10px] text-slate-500 mb-1">End Hour (24h)</p>
                                <input
                                    type="number"
                                    min={0}
                                    max={23}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-blue-500 outline-none font-bold"
                                    value={submissionSettings.musterEndHour}
                                    onChange={(e) => handleUpdate('muster_end_hour', parseInt(e.target.value) || 0)}
                                    disabled={isSaving === 'muster_end_hour'}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Night Tattoo Window</label>
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <p className="text-[10px] text-slate-500 mb-1">Start Hour (24h)</p>
                                <input
                                    type="number"
                                    min={0}
                                    max={23}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-blue-500 outline-none font-bold"
                                    value={submissionSettings.tattooStartHour}
                                    onChange={(e) => handleUpdate('tattoo_start_hour', parseInt(e.target.value) || 0)}
                                    disabled={isSaving === 'tattoo_start_hour'}
                                />
                            </div>
                            <div className="pt-4 text-slate-300">onwards</div>
                            <div className="flex-1" />
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                    <p className="text-xs text-amber-700 leading-relaxed font-medium">
                        <strong>Note:</strong> These settings take effect immediately for all officers across the academy.
                        Ensure the windows provide sufficient time for accurate reporting.
                    </p>
                </div>
            </div>
        </div>
    );
};

export const CommandantDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const getTitle = () => {
        const path = location.pathname;
        if (path.includes('audit')) return 'Attendance Audit Ledger';
        if (path.includes('cadet_registry')) return 'Master Cadet Registry';
        if (path.includes('analytics')) return 'Advanced Command Analytics';
        if (path.includes('settings')) return 'System Settings';
        return 'Command Overview';
    };

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden relative">
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            <div className="flex-1 flex flex-col overflow-hidden">
                <Header
                    title={getTitle()}
                    onProfileClick={() => navigate('/commandant/settings')}
                    onMenuClick={() => setIsSidebarOpen(true)}
                />

                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <Routes>
                            <Route index element={<DashboardOverview />} />
                            <Route path="audit" element={<AttendanceAudit />} />
                            <Route path="cadet_registry" element={<CadetManager />} />
                            <Route path="analytics" element={<CommandAnalytics />} />
                            <Route path="settings" element={
                                <div className="max-w-2xl mx-auto py-8">
                                    <ActiveRCSettings />
                                    <SubmissionTimeSettings />
                                </div>
                            } />
                        </Routes>
                    </div>
                </main>
            </div>
        </div>
    );
};
