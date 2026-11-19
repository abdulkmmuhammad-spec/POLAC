import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase, dbService } from '../services/dbService';
import { User, UserRole } from '../types';
import { toast } from 'react-hot-toast';

const SESSION_KEY = 'polac_session';

interface AuthState {
  status: 'initializing' | 'unauthenticated' | 'authenticated';
  user: User | null;
}

interface AuthContextType {
  authState: AuthState;
  currentUser: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setCurrentUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const resolveDefaultDesignation = (role: UserRole, rawDesignation?: string | null): string => {
  if (rawDesignation && rawDesignation.trim().length > 0) {
    return rawDesignation.trim();
  }
  if (role === UserRole.ADMIN) return 'System Administrator';
  if (role === UserRole.COMMANDANT) return 'Commandant';
  return 'Course Officer';
};

const normalizeCommandantIdentity = (user: User): User => {
  if (user.role !== UserRole.COMMANDANT) return user;
  const rawDesignation = (user.designation || '').trim();
  const rawFullName = (user.fullName || '').trim();
  const isLegacyDirectorFallback =
    rawFullName.toUpperCase() === 'DIRECTOR FIELD STUDIES' &&
    (!rawDesignation || rawDesignation.toLowerCase() === 'director field studies');

  if (isLegacyDirectorFallback) {
    return {
      ...user,
      fullName: 'COMMANDANT',
      designation: 'Commandant'
    };
  }
  return {
    ...user,
    designation: rawDesignation || 'Commandant'
  };
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(SESSION_KEY);
      if (!stored) {
        return { status: 'unauthenticated', user: null };
      }
    }
    return { status: 'initializing', user: null };
  });
  const currentUser = authState.user;

  const logout = useCallback((reasonMessage?: string) => {
    setAuthState({ status: 'unauthenticated', user: null });
    localStorage.removeItem(SESSION_KEY);
    if (reasonMessage) {
      toast.error(reasonMessage, { duration: 5000 });
    }
  }, []);

  useEffect(() => {
    const initializeSession = async () => {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored && authState.status === 'initializing') {
        try {
          const rawUser: User = JSON.parse(stored);
          const user = normalizeCommandantIdentity(rawUser);

          // Verify user still exists, is active, and session_version has not been invalidated
          const isValid = await dbService.verifySession(user.id, user.sessionVersion);

          if (isValid) {
            if (user.fullName !== rawUser.fullName || user.designation !== rawUser.designation) {
              localStorage.setItem(SESSION_KEY, JSON.stringify(user));
              supabase
                .from('users')
                .update({ full_name: user.fullName })
                .eq('id', user.id)
                .then(() => {});
            }
            setAuthState({ status: 'authenticated', user });
          } else {
            console.warn('[Auth] Invalidated or stale session detected. Purging session.');
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

  // Real-time & periodic session invalidation guard when Admin overrides credentials or deactivates account
  useEffect(() => {
    if (authState.status !== 'authenticated' || !currentUser?.id) return;

    let isCancelled = false;

    const checkSessionValidity = async () => {
      const valid = await dbService.verifySession(currentUser.id, currentUser.sessionVersion);
      if (!valid && !isCancelled) {
        logout('Session terminated: Your security credentials were updated by an Administrator.');
      }
    };

    const intervalId = setInterval(() => {
      if (!document.hidden) {
        checkSessionValidity();
      }
    }, 15000);

    const channel = supabase
      .channel(`user-session-guard-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${currentUser.id}`
        },
        (payload) => {
          const updated = payload.new as any;
          if (!updated) return;

          if (updated.is_active === false) {
            logout('Session terminated: Your account has been deactivated by an Administrator.');
            return;
          }

          if (
            currentUser.sessionVersion !== undefined &&
            updated.session_version !== undefined &&
            Number(updated.session_version) > Number(currentUser.sessionVersion)
          ) {
            logout('Session terminated: Your security credentials were updated by an Administrator.');
          }
        }
      )
      .subscribe();

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [authState.status, currentUser?.id, currentUser?.sessionVersion, logout]);

  const login = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.toLowerCase().trim();

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    // Seamless fallback if admin@gmail.com logs in before the SQL migration is executed in Supabase
    if (!user && normalizedEmail === 'admin@gmail.com') {
      if (password !== 'password') {
        throw new Error('Invalid email or password.');
      }

      const { data: fallbackHqUser } = await supabase
        .from('users')
        .select('id')
        .in('role', ['admin', 'commandant'])
        .limit(1)
        .maybeSingle();

      const adminUser: User = {
        id: fallbackHqUser?.id || '00000000-0000-0000-0000-000000000001',
        email: 'admin@gmail.com',
        username: 'admin',
        role: UserRole.ADMIN,
        fullName: 'SYSTEM ADMINISTRATOR',
        designation: 'System Administrator',
        courseName: 'Academy HQ',
        isActive: true,
        sessionVersion: undefined
      };

      setAuthState({ status: 'authenticated', user: adminUser });
      localStorage.setItem(SESSION_KEY, JSON.stringify(adminUser));
      return;
    }

    if (error || !user) {
      throw new Error('Invalid email or password.');
    }

    if (user.is_active === false) {
      throw new Error('This account has been deactivated.');
    }

    if (user.password !== password) {
      throw new Error('Invalid email or password.');
    }

    const resolvedRole = (
      user.email?.toLowerCase() === 'admin@gmail.com' ? UserRole.ADMIN : (user.role as UserRole)
    );

    const rawSessionUser: User = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: resolvedRole,
      fullName: user.full_name || user.username,
      designation: resolveDefaultDesignation(resolvedRole, user.designation),
      courseName: resolvedRole === UserRole.COURSE_OFFICER ? user.course_name : 'Academy HQ',
      courseNumber:
        resolvedRole === UserRole.COURSE_OFFICER && user.course_number
          ? parseInt(String(user.course_number), 10)
          : undefined,
      totalCadets: user.total_cadets,
      profileImage: user.profile_image_url,
      isActive: user.is_active !== false,
      sessionVersion: user.session_version !== undefined ? Number(user.session_version) : undefined
    };

    const sessionUser = normalizeCommandantIdentity(rawSessionUser);
    if (
      resolvedRole === UserRole.COMMANDANT &&
      String(user.full_name || '').trim().toUpperCase() === 'DIRECTOR FIELD STUDIES' &&
      !user.designation
    ) {
      supabase
        .from('users')
        .update({ full_name: 'COMMANDANT' })
        .eq('id', user.id)
        .then(() => {});
    }

    setAuthState({ status: 'authenticated', user: sessionUser });
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
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
    <AuthContext.Provider value={{ authState, currentUser, login, logout: () => logout(), setCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
