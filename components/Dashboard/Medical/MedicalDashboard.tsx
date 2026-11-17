import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Header } from '../../Layout/Header';
import { BottomNav } from '../../Layout/BottomNav';
import { SickbayTriageBoard } from './SickbayTriageBoard';
import { MedicalRemarksCenter } from './MedicalRemarksCenter';
import { useAuth } from '../../../context/AuthContext';

/**
 * MedicalDashboard — Root layout for the MEDICAL_OFFICER role.
 *
 * Clean 2-tab architecture:
 *   /medical          → SickbayTriageBoard (binary verification)
 *   /medical/remarks  → MedicalRemarksCenter (sent remarks history)
 */
export const MedicalDashboard: React.FC = () => {
  const { currentUser } = useAuth();

  const headerTitle = currentUser?.designation || 'Medical Officer';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Desktop sidebar placeholder — Medical Officer has a minimal layout */}
      <div className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-slate-200 md:bg-blue-900/95 md:backdrop-blur-xl shrink-0">
        {/* Sidebar header */}
        <div className="p-6 border-b border-white/5 bg-black/10">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-rose-500/10 rounded-lg flex items-center justify-center border border-rose-400/20 overflow-hidden shrink-0">
              <img src="/logo.png" alt="POLAC Logo" className="w-[82%] h-[82%] object-contain block" />
            </div>
            <h2 className="font-black text-white tracking-tighter text-lg uppercase">
              POLAC <span className="text-rose-400">MED</span>
            </h2>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-4 space-y-1 mt-2">
          <a
            href="/medical"
            className="w-full flex items-center px-4 py-3 rounded-md text-blue-100/60 hover:text-white hover:bg-white/5 transition-all text-[11px] font-black uppercase tracking-widest"
          >
            Sickbay Triage
          </a>
          <a
            href="/medical/remarks"
            className="w-full flex items-center px-4 py-3 rounded-md text-blue-100/60 hover:text-white hover:bg-white/5 transition-all text-[11px] font-black uppercase tracking-widest"
          >
            Medical Remarks
          </a>
        </nav>

        {/* System status */}
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
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-screen md:min-h-0">
        <Header title={headerTitle} />

        <main className="flex-1 overflow-y-auto pb-28 md:pb-6">
          <Routes>
            <Route index element={<SickbayTriageBoard />} />
            <Route path="remarks" element={<MedicalRemarksCenter />} />
            <Route path="*" element={<Navigate to="/medical" replace />} />
          </Routes>
        </main>

        <BottomNav />
      </div>
    </div>
  );
};

