import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { UserRole } from '../types';

export type Role = UserRole;

const ACTIVITY_STORAGE_KEY = 'auth_last_activity';

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  email_verified: boolean;
  otp_enabled: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string, otpCode?: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8080/api';
  const parsedIdleTimeout = Number(import.meta.env.VITE_SESSION_IDLE_TIMEOUT_MINUTES ?? '30');
  const idleTimeoutMinutes = Number.isFinite(parsedIdleTimeout) && parsedIdleTimeout > 0 ? parsedIdleTimeout : 30;
  const idleTimeoutMs = idleTimeoutMinutes * 60 * 1000;

  // Load token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken) {
      setToken(storedToken);
      // Ne pas bloquer le rendu initial - faire l'appel en arrière-plan
      // On assume temporairement que le token est valide pour permettre le rendu
      setIsLoading(false);
      // Fetch user info avec le token en arrière-plan (non-bloquant)
      fetchUserInfo(storedToken).catch((error) => {
        console.error('Failed to fetch user info in background:', error);
      });
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchUserInfo = async (authToken: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        // Token is invalid, clear it
        localStorage.removeItem('auth_token');
        setToken(null);
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      localStorage.removeItem('auth_token');
      setToken(null);
      setUser(null);
    }
  };

  const login = async (username: string, password: string, otpCode?: string) => {
    try {
      const payload: Record<string, string> = { username, password };
      if (otpCode) {
        payload.otp_code = otpCode;
      }
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Login failed');
      }

      const data = await response.json();
      const newToken = data.access_token;

      // Store token
      localStorage.setItem('auth_token', newToken);
      setToken(newToken);

      // Fetch user info
      await fetchUserInfo(newToken);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem(ACTIVITY_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = async () => {
    if (!token) {
      return;
    }
    await fetchUserInfo(token);
  };

  useEffect(() => {
    if (!token) {
      localStorage.removeItem(ACTIVITY_STORAGE_KEY);
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    let lastActivity = Number(localStorage.getItem(ACTIVITY_STORAGE_KEY)) || Date.now();
    const updateActivity = () => {
      lastActivity = Date.now();
      localStorage.setItem(ACTIVITY_STORAGE_KEY, String(lastActivity));
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        updateActivity();
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach((event) => window.addEventListener(event, updateActivity));
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Ensure we start from "now" when the token becomes available
    updateActivity();

    const intervalId = window.setInterval(() => {
      const reference = Number(localStorage.getItem(ACTIVITY_STORAGE_KEY)) || lastActivity;
      if (Date.now() - reference >= idleTimeoutMs) {
        logout();
      }
    }, 60 * 1000);

    return () => {
      activityEvents.forEach((event) => window.removeEventListener(event, updateActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [token, idleTimeoutMs, logout]);

  const value: AuthContextType = {
    user,
    token,
    login,
    logout,
    isAuthenticated: !!token && !!user,
    isLoading,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
