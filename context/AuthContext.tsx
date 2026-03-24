
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole } from '../types';
import { dbService, supabase } from '../services/dbService';

interface RegistrationStatus {
  canRegisterCommandant: boolean;
  canRegisterOfficer: boolean;
  commandantCount: number;
  officerCount: number;
}

interface AuthContextType {
  currentUser: User | null;
  isLoading: boolean;
  initializing: boolean;
  registrationStatus: RegistrationStatus;
  login: (email: string, password: string, requiredRole: UserRole) => Promise<void>;
  signUp: (email: string, password: string, username: string, role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  setCurrentUser: (user: User | null) => void;
  lockoutTime: number;
  refreshRegistrationStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [initializing, setInitializing] = useState(true); // Prevents login-flicker on page refresh
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutTime, setLockoutTime] = useState(0);
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus>({
    canRegisterCommandant: false,
    canRegisterOfficer: false,
    commandantCount: 0,
    officerCount: 0,
  });

  // ── Registration Status Check ─────────────────────────────────────────────
  const refreshRegistrationStatus = async () => {
    const [cmdResult, offResult] = await Promise.all([
      dbService.getRegistrationStatus('commandant'),
      dbService.getRegistrationStatus('course_officer'),
    ]);
    setRegistrationStatus({
      canRegisterCommandant: cmdResult.canRegister,
      canRegisterOfficer: offResult.canRegister,
      commandantCount: cmdResult.count,
      officerCount: offResult.count,
    });
  };

  // ── Supabase Auth Session Listener ────────────────────────────────────────
  useEffect(() => {
    // Restore lockout from localStorage
    const storedLockout = localStorage.getItem('polac_lockout_until');
    if (storedLockout) {
      const until = parseInt(storedLockout, 10);
      if (until > Date.now()) setLockoutUntil(until);
    }

    // Listen to Supabase Auth state changes (handles refresh, signIn, signOut)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const profile = await dbService.getUserProfile(session.user.id);
        setCurrentUser(profile);
      } else {
        setCurrentUser(null);
      }
      setInitializing(false);
    });

    // Load registration status on mount
    refreshRegistrationStatus();

    return () => subscription.unsubscribe();
  }, []);

  // ── Lockout Countdown Timer ───────────────────────────────────────────────
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (lockoutUntil) {
      interval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
        setLockoutTime(remaining);
        if (remaining === 0) {
          setLockoutUntil(null);
          setFailedAttempts(0);
          localStorage.removeItem('polac_lockout_until');
        }
      }, 1000);
    } else {
      setLockoutTime(0);
    }
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  // ── Secure Login ──────────────────────────────────────────────────────────
  const login = async (email: string, password: string, requiredRole: UserRole) => {
    if (lockoutUntil && Date.now() < lockoutUntil) {
      throw new Error(`Too many failed attempts. Try again in ${lockoutTime} seconds.`);
    }

    setIsLoading(true);
    try {
      const { data, error } = await dbService.signInUser(email, password);

      if (error || !data.user) {
        handleFailedAttempt();
        throw new Error('Invalid credentials');
      }

      // Fetch the profile to check role
      const profile = await dbService.getUserProfile(data.user.id);

      if (!profile) {
        handleFailedAttempt();
        throw new Error('Account profile not found. Please contact your administrator.');
      }

      if (profile.role !== requiredRole) {
        await supabase.auth.signOut();
        handleFailedAttempt();
        throw new Error(`Unauthorized: This account does not have ${requiredRole === UserRole.COMMANDANT ? 'Commandant' : 'Course Officer'} privileges.`);
      }

      setFailedAttempts(0);
      setLockoutUntil(null);
      localStorage.removeItem('polac_lockout_until');
      setCurrentUser(profile);

      // Audit log
      try {
        await dbService.addNotification({
          type: 'login',
          title: 'User Logged In',
          content: `${profile.fullName || profile.username} (${profile.role === UserRole.COMMANDANT ? 'Commandant' : 'Course Officer'}) logged in successfully`,
          timestamp: new Date().toISOString(),
          read: false,
          officerName: profile.fullName || profile.username,
          yearGroup: profile.yearGroup || 1,
          courseNumber: profile.courseNumber
        });
      } catch (auditErr) {
        console.error('Auth context: Failed to log audit notification for login', auditErr);
      }
    } catch (err: any) {
      console.error('Login Error:', err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // ── Secure Signup ─────────────────────────────────────────────────────────
  const signUp = async (email: string, password: string, username: string, role: UserRole) => {
    setIsLoading(true);
    try {
      const roleString = role === UserRole.COMMANDANT ? 'commandant' : 'course_officer';
      const { data, error } = await dbService.signUpUser(email, password, username, roleString);

      if (error) throw new Error(error.message);

      // Profile is created automatically by the `on_auth_user_created` DB trigger.
      // Refresh the registration status to update the UI immediately.
      await refreshRegistrationStatus();
    } catch (err: any) {
      console.error('Signup Error:', err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = async () => {
    const user = currentUser;
    await supabase.auth.signOut();
    setCurrentUser(null);

    if (user) {
      try {
        await dbService.addNotification({
          type: 'logout',
          title: 'User Logged Out',
          content: `${user.fullName || user.username} logged out`,
          timestamp: new Date().toISOString(),
          read: false,
          officerName: user.fullName || user.username,
          yearGroup: user.yearGroup || 1,
          courseNumber: user.courseNumber
        });
      } catch (auditErr) {
        console.error('Auth context: Failed to log audit notification for logout', auditErr);
      }
    }
  };

  const handleFailedAttempt = () => {
    const newCount = failedAttempts + 1;
    setFailedAttempts(newCount);
    if (newCount >= 5) {
      const until = Date.now() + 60000;
      setLockoutUntil(until);
      localStorage.setItem('polac_lockout_until', until.toString());
    }
  };

  return (
    <AuthContext.Provider value={{
      currentUser, isLoading, initializing, registrationStatus,
      login, signUp, logout, setCurrentUser, lockoutTime, refreshRegistrationStatus
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
