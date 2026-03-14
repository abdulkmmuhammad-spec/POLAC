
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole } from '../types';
import { dbService } from '../services/dbService';

interface AuthContextType {
  currentUser: User | null;
  isLoading: boolean;
  login: (username: string, password: string, requiredRole: UserRole) => Promise<void>;
  logout: () => void;
  setCurrentUser: (user: User | null) => void;
  lockoutTime: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutTime, setLockoutTime] = useState(0);

  useEffect(() => {
    // Legacy session initialization from localStorage
    const savedUser = localStorage.getItem('polac_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (err) {
        console.error('Failed to parse saved user:', err);
        localStorage.removeItem('polac_user');
      }
    }

    const storedLockout = localStorage.getItem('polac_lockout_until');
    if (storedLockout) {
      const until = parseInt(storedLockout, 10);
      if (until > Date.now()) {
        setLockoutUntil(until);
      }
    }
  }, []);

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

  const login = async (username: string, password: string, requiredRole: UserRole) => {
    if (lockoutUntil && Date.now() < lockoutUntil) {
      throw new Error(`Too many failed attempts. Try again in ${lockoutTime} seconds.`);
    }

    setIsLoading(true);
    try {
      const user = await dbService.loginWithCredentials(username, password);

      if (!user) {
        handleFailedAttempt();
        throw new Error('Invalid credentials');
      }

      if (user.role !== requiredRole) {
        handleFailedAttempt();
        throw new Error(`Unauthorized: This account does not have ${requiredRole === UserRole.COMMANDANT ? 'Commandant' : 'Course Officer'} privileges.`);
      }

      setFailedAttempts(0);
      setLockoutUntil(null);
      localStorage.removeItem('polac_lockout_until');

      // Save to localStorage (Legacy behavior)
      localStorage.setItem('polac_user', JSON.stringify(user));
      setCurrentUser(user);

      // Log successful login as audit notification
      await dbService.addNotification({
        type: 'login',
        title: 'User Logged In',
        content: `${user.fullName} (${user.role === UserRole.COMMANDANT ? 'Commandant' : 'Course Officer'}) logged in successfully`,
        timestamp: new Date().toISOString(),
        read: false,
        officerName: user.fullName,
        yearGroup: user.yearGroup || 1,
        courseNumber: user.courseNumber
      });
    } catch (err: any) {
      console.error('Login Error:', err.message);
      throw err;
    } finally {
      setIsLoading(false);
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

  const logout = async () => {
    const user = currentUser;
    localStorage.removeItem('polac_user');
    setCurrentUser(null);

    // Log logout as audit notification
    if (user) {
      await dbService.addNotification({
        type: 'logout',
        title: 'User Logged Out',
        content: `${user.fullName} logged out`,
        timestamp: new Date().toISOString(),
        read: false,
        officerName: user.fullName,
        yearGroup: user.yearGroup || 1,
        courseNumber: user.courseNumber
      });
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, login, logout, setCurrentUser, lockoutTime }}>
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
