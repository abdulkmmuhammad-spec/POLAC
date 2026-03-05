import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ParadeProvider } from './context/ParadeContext';
import { UserRole } from './types';
import { Login } from './components/Auth/Login';
import { CommandantDashboard } from './components/Dashboard/Commandant/CommandantDashboard';
import { OfficerDashboard } from './components/Dashboard/Officer/OfficerDashboard';
import { Toaster } from 'react-hot-toast';

const PrivateRoute: React.FC<{ children: React.ReactNode; allowedRole?: UserRole }> = ({ children, allowedRole }) => {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (allowedRole && currentUser.role !== allowedRole) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
};

const AppContent: React.FC = () => {
  const { currentUser } = useAuth();

  return (
    <ParadeProvider>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={!currentUser ? <Login /> : <Navigate to="/" />} />

        <Route path="/commandant/*" element={
          <PrivateRoute allowedRole={UserRole.COMMANDANT}>
            <CommandantDashboard />
          </PrivateRoute>
        } />

        <Route path="/officer/*" element={
          <PrivateRoute allowedRole={UserRole.COURSE_OFFICER}>
            <OfficerDashboard />
          </PrivateRoute>
        } />

        <Route path="/" element={
          currentUser ? (
            currentUser.role === UserRole.COMMANDANT ?
              <Navigate to="/commandant" /> :
              <Navigate to="/officer" />
          ) : <Navigate to="/login" />
        } />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </ParadeProvider>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;