import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ParadeProvider } from './context/ParadeContext';
import { UserRole } from './types';
import { LoginScreen } from './components/Auth/LoginScreen';
import { CommandantDashboard } from './components/Dashboard/Commandant/CommandantDashboard';
import { OfficerDashboard } from './components/Dashboard/Officer/OfficerDashboard';
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from './components/Layout/ErrorBoundary';

// ─── Full-screen loading spinner ────────────────────────────────
const FullScreenSpinner: React.FC = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 gap-4">
    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
      Verifying Session...
    </p>
  </div>
);

// ─── Protected Route ────────────────────────────────────────────
// Protects routes that require authentication and a specific role.
const ProtectedRoute: React.FC<{ allowedRoles: UserRole[] }> = ({ allowedRoles }) => {
  const { authState } = useAuth();

  if (authState.status !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(authState.user.role)) {
    // User is authenticated but wrong role — redirect to root
    // Root will then redirect to the appropriate dashboard for their role
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

// ─── Public Route ───────────────────────────────────────────────
// Redirects already-authenticated users away from /login.
const PublicRoute: React.FC = () => {
  const { authState } = useAuth();

  if (authState.status === 'authenticated') {
    // Already logged in — redirect to appropriate dashboard
    const destination = authState.user.role === UserRole.COMMANDANT
      ? '/commandant'
      : '/officer';
    return <Navigate to={destination} replace />;
  }

  return <Outlet />;
};

// ─── Root Route ─────────────────────────────────────────────────
// Smart redirect based on auth state.
const RootRoute: React.FC = () => {
  const { authState } = useAuth();

  if (authState.status !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }

  // Authenticated — send to role-appropriate dashboard
  return <Navigate
    to={authState.user.role === UserRole.COMMANDANT ? '/commandant' : '/officer'}
    replace
  />;
};

// ─── App Content ────────────────────────────────────────────────
const AppContent: React.FC = () => {
  return (
    <ParadeProvider>
      <Toaster
        position="top-center"
        containerStyle={{
          top: 10,
          position: 'fixed',
          zIndex: 99999,
        }}
      />
      <Routes>
        <Route element={<PublicRoute />}>
          <Route path="/login" element={<LoginScreen />} />
        </Route>

        {/* Protected commandant routes */}
        <Route element={<ProtectedRoute allowedRoles={[UserRole.COMMANDANT]} />}>
          <Route path="/commandant/*" element={<CommandantDashboard />} />
        </Route>

        {/* Protected officer routes */}
        <Route element={<ProtectedRoute allowedRoles={[UserRole.COURSE_OFFICER]} />}>
          <Route path="/officer/*" element={<OfficerDashboard />} />
        </Route>

        {/* Root — smart redirect */}
        <Route path="/" element={<RootRoute />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ParadeProvider>
  );
};

// ─── App Root ───────────────────────────────────────────────────
const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
};

export default App;
