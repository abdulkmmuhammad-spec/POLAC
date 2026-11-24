import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from '../../Layout/Sidebar';
import { Header } from '../../Layout/Header';
import { BottomNav } from '../../Layout/BottomNav';
import { PageTransitionWrapper } from '../../Layout/PageTransitionWrapper';
import { SickbayTriageBoard } from './SickbayTriageBoard';
import { MedicalRemarksCenter } from './MedicalRemarksCenter';
import { useAuth } from '../../../context/AuthContext';

/**
 * MedicalDashboard — Root layout for the MEDICAL_OFFICER role.
 * Reuses the shared Sidebar, Header, PageTransitionWrapper, and BottomNav
 * for consistent SPA navigation and Apple HIG safe-area compliance.
 */
export const MedicalDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const location = useLocation();

  const getTitle = () => {
    const officeTitle = currentUser?.designation || 'Medical Officer';
    if (location.pathname.includes('remarks')) {
      return `${officeTitle} • Remarks`;
    }
    return `${officeTitle} • Sickbay Triage`;
  };

  return (
    <div className="flex h-full flex-1 bg-slate-50 overflow-hidden relative">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={getTitle()} />

        <main className="flex-1 overflow-y-auto p-4 pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:p-8 md:pb-8">
          <div className="max-w-4xl mx-auto">
            <PageTransitionWrapper>
              <Routes location={location}>
                <Route index element={<SickbayTriageBoard />} />
                <Route path="remarks" element={<MedicalRemarksCenter />} />
                <Route path="*" element={<Navigate to="/medical" replace />} />
              </Routes>
            </PageTransitionWrapper>
          </div>
        </main>

        <BottomNav />
      </div>
    </div>
  );
};
