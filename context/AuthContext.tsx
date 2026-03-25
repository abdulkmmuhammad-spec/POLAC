import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase, dbService } from '../services/dbService';
import { User, UserRole } from '../types';

const SESSION_KEY = 'polac_session';

interface AuthState {
  status: 'initializing' | 'unauthenticated' | 'authenticated';
  user: User | null;
}

interface AuthContextType {
  authState: AuthState;
  currentUser: User | null;
  login: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string, role: UserRole) => Promise<void>;
  logout: () => void;
  setCurrentUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({ status: 'initializing', user: null });
  const currentUser = authState.user;

  useEffect(() => {
    const initializeSession = async () => {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        try {
          const user = JSON.parse(stored);
          
          // CRITICAL: Verify user still exists in DB to prevent 23503 FK errors
          const isValid = await dbService.verifySession(user.id);
          
          if (isValid) {
            setAuthState({ status: 'authenticated', user });
          } else {
            console.warn('[Auth] Stale session detected. Purging invalid user ID.');
            localStorage.removeItem(SESSION_KEY);
            setAuthState({ status: 'unauthenticated', user: null });
          }
        } catch {
          setAuthState({ status: 'unauthenticated', user: null });
        }
      } else {
        setAuthState({ status: 'unauthenticated', user: null });
      }
    };

    initializeSession();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, username, role, password, full_name, course_name, course_number, total_cadets, profile_image_url')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !user) {
      throw new Error('Invalid email or password.');
    }

    if (user.password !== password) {
      throw new Error('Invalid email or password.');
    }

    const sessionUser: User = { 
      id: user.id, 
      username: user.username, 
      role: user.role as UserRole,
      fullName: user.full_name || user.username,
      courseName: user.course_name,
      courseNumber: user.course_number ? parseInt(user.course_number) : undefined,
      totalCadets: user.total_cadets,
      profileImage: user.profile_image_url
    };
    setAuthState({ status: 'authenticated', user: sessionUser });
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
  }, []);

  const signUp = useCallback(async (email: string, password: string, username: string, role: UserRole) => {
    // Capacity Validation Block
    const { count, error: countError } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', role);

    if (countError) throw new Error('Failed to verify registry capacity.');

    const currentCount = count || 0;
    if (role === UserRole.COMMANDANT && currentCount >= 1) {
      throw new Error('Capacity limit reached: System permits max 1 Commandant.');
    }
    if (role === UserRole.COURSE_OFFICER && currentCount >= 5) {
      throw new Error('Capacity limit reached: System permits max 5 Course Officers.');
    }

    // Insert new user
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase().trim(),
        password: password, // Plaintext per phase 1 constraint
        username: username.trim(),
        role: role,
        full_name: username.trim(), // Initialize full_name with username
        total_cadets: 0
      })
      .select('id, email, username, role, full_name')
      .single();

    if (error) {
      if (error.code === '23505') throw new Error('Email already registered.');
      throw new Error(error.message);
    }

    const sessionUser: User = { 
      id: user.id, 
      username: user.username, 
      role: user.role as UserRole,
      fullName: user.full_name || user.username,
      totalCadets: 0
    };
    setAuthState({ status: 'authenticated', user: sessionUser });
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
  }, []);

  const logout = useCallback(() => {
    setAuthState({ status: 'unauthenticated', user: null });
    localStorage.removeItem(SESSION_KEY);
  }, []);

  const setCurrentUser = useCallback((user: User | null) => {
    if (user) {
      setAuthState({ status: 'authenticated', user });
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } else {
      setAuthState({ status: 'unauthenticated', user: null });
      localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ authState, currentUser, login, signUp, logout, setCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
