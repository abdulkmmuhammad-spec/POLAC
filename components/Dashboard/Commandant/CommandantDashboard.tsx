import React, { useState } from 'react';
import { Settings, Radio, ChevronRight, Shield } from 'lucide-react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';

import { Sidebar } from '../../Layout/Sidebar';
import { Header } from '../../Layout/Header';
import { DashboardOverview } from '../DashboardOverview';
import { AttendanceAudit } from './AttendanceAudit';
import { DefaulterAnalysis } from './DefaulterAnalysis';
import { CadetManager } from '../../CadetRegistry/CadetManager';
import { CommandAnalytics } from './CommandAnalytics';
import { OfficerManager } from './OfficerManager';
import { AuditLogView } from '../../Settings/AuditLogView';
import { useParade } from '../../../context/ParadeContext';
import { useAuth } from '../../../context/AuthContext';
import { dbService } from '../../../services/dbService';
import { toast } from 'react-hot-toast';

const ActiveRCSettings: React.FC = () => {
    const { activeRC, refreshActiveRC } = useParade();
const { currentUser } = useAuth();
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

            try {
                // Log settings change as audit notification
                await dbService.addNotification({
                    type: 'settings_change',
                    title: 'Active RC Changed',
                    content: `Active Regular Course changed from RC${oldRC} to RC${newRC}`,
                    timestamp: new Date().toISOString(),
                    read: false,
                    officerName: currentUser?.fullName || 'System',
                    yearGroup: 1,
                    courseNumber: 0
                });
            } catch (auditErr) {
                console.error('Failed to log audit notification for settings change:', auditErr);
                toast.error('Settings updated, but failed to securely log audit trail.');
            }
        } catch (err) {
            toast.error('Failed to update Active RC. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b bg-blue-900 text-white flex items-center gap-3">
                <Radio size={16} />
                <div>
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em]">Global Reference RC</h3>
                </div>
            </div>
            <div className="p-6">
                <div className="flex items-start gap-4 mb-6">
                    <div className="flex-1">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Active Configuration</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-blue-900 font-mono tracking-tighter">{activeRC}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase">Regular Course</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase tracking-tight">
                            Master value for dynamic year-group calculations across academy sectors.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="space-y-1.5 flex-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Update Parameter</label>
                        <input
                            type="number"
                            min={1}
                            className="w-full px-4 py-2.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-blue-900 outline-none font-black text-slate-900 text-lg font-mono bg-slate-50/50"
                            value={newRC}
                            onChange={(e) => setNewRC(parseInt(e.target.value) || activeRC)}
                        />
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || newRC === activeRC}
                        className={`mt-4 flex items-center justify-center gap-2 px-6 h-[46px] rounded-md font-black text-[10px] uppercase tracking-widest transition-all shadow-sm ${saved
                            ? 'bg-emerald-600 text-white'
                            : 'bg-blue-900 hover:bg-blue-800 text-white disabled:opacity-20 disabled:grayscale'
                            }`}
                    >
                        {isSaving ? 'Processing...' : saved ? 'Committed' : (
                            <>Update <ChevronRight size={14} /></>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

const SubmissionTimeSettings: React.FC = () => {
    const { submissionSettings, updateSubmissionSetting } = useParade();
const { currentUser } = useAuth();
    const [isSaving, setIsSaving] = useState<string | null>(null);

    const handleUpdate = async (key: 'muster_start_hour' | 'muster_end_hour' | 'tattoo_start_hour', value: number) => {
        setIsSaving(key);
        try {
            const oldValue = submissionSettings[key];
            await updateSubmissionSetting(key, value);

            try {
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
                    officerName: currentUser?.fullName || 'System',
                    yearGroup: 1,
                    courseNumber: 0
                });
            } catch (auditErr) {
                console.error('Failed to log audit notification for submission time settings:', auditErr);
                toast.error('Submission Time updated, but failed to securely log audit trail.');
            }
        } finally {
            setIsSaving(null);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mt-6 text-slate-800">
            <div className="p-4 border-b bg-blue-900 text-white flex items-center gap-3">
                <Settings size={16} />
                <div>
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em]">Reporting Windows</h3>
                </div>
            </div>
            <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Muster State Window</label>
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Start (0-23)</p>
                                <input
                                    type="number"
                                    min={0}
                                    max={23}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-blue-900 outline-none font-mono font-bold text-sm"
                                    value={submissionSettings.musterStartHour}
                                    onChange={(e) => handleUpdate('muster_start_hour', parseInt(e.target.value) || 0)}
                                    disabled={isSaving === 'muster_start_hour'}
                                />
                            </div>
                            <div className="pt-4 text-slate-200 font-black">—</div>
                            <div className="flex-1">
                                <p className="text-[8px] font-black text-slate-400 uppercase mb-1">End (0-23)</p>
                                <input
                                    type="number"
                                    min={0}
                                    max={23}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-blue-900 outline-none font-mono font-bold text-sm"
                                    value={submissionSettings.musterEndHour}
                                    onChange={(e) => handleUpdate('muster_end_hour', parseInt(e.target.value) || 0)}
                                    disabled={isSaving === 'muster_end_hour'}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Tattoo Phase Gate</label>
                        <div className="flex items-center gap-3">
                            <div className="flex-2">
                                <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Entry Threshold (24H)</p>
                                <input
                                    type="number"
                                    min={0}
                                    max={23}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-blue-900 outline-none font-mono font-bold text-sm"
                                    value={submissionSettings.tattooStartHour}
                                    onChange={(e) => handleUpdate('tattoo_start_hour', parseInt(e.target.value) || 0)}
                                    disabled={isSaving === 'tattoo_start_hour'}
                                />
                            </div>
                            <div className="pt-4 flex-1">
                                <span className="text-[9px] font-mono font-black text-slate-300 uppercase tracking-widest ml-2">Open End</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-blue-50/50 rounded-md border border-blue-100 flex items-start gap-3">
                    <Shield size={14} className="text-blue-900 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-blue-900/80 leading-relaxed font-bold uppercase tracking-tight">
                        Operational Note: Changes take immediate effect. Ensure reporting windows align with academy daily routine orders to avoid service lockout.
                    </p>
                </div>
            </div>
        </div>
    );
};

const SettingsContainer: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'general' | 'audit'>('general');

    return (
        <div className="space-y-8">
            <div className="flex p-1 bg-slate-100 rounded-xl w-fit border border-slate-200 shadow-inner">
                <button
                    onClick={() => setActiveTab('general')}
                    className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'general'
                            ? 'bg-blue-900 text-white shadow-md'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    Administrative Parameters
                </button>
                <button
                    onClick={() => setActiveTab('audit')}
                    className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'audit'
                            ? 'bg-blue-900 text-white shadow-md'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    Forensic Archive
                </button>
            </div>

            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                {activeTab === 'general' ? (
                    <div className="max-w-2xl">
                        <ActiveRCSettings />
                        <SubmissionTimeSettings />
                    </div>
                ) : (
                    <AuditLogView />
                )}
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
        if (path.includes('settings')) return 'System Settings & Forensics';
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
                                <div className="py-8">
                                    <div className="max-w-4xl mx-auto px-4">
                                        <SettingsContainer />
                                    </div>
                                </div>
                            } />
                        </Routes>
                    </div>
                </main>
            </div>
        </div>
    );
};
