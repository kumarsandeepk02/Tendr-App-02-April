import { useState, useEffect, useCallback } from 'react';
import { getSessionToken, setSessionToken, clearSessionToken } from '../utils/api';

// In production, Vercel proxy rewrites /api/* — use relative paths (empty string).
// In dev, REACT_APP_API_URL=http://localhost:3001 from .env.
const API_URL = process.env.REACT_APP_API_URL || '';

interface UserProfile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: string;
  industry: string;
  onboarded: boolean;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  profile: UserProfile | null;
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    profile: null,
  });

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
  }, []);

  // Handle auth callback — exchange code for session token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const exchangeCode = params.get('exchange_code');
    const path = window.location.pathname;

    if (path === '/auth/callback' && exchangeCode) {
      window.history.replaceState({}, '', '/');
      // Exchange the one-time code for a session token (through Vercel proxy)
      fetch(`${API_URL}/api/auth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exchange_code: exchangeCode }),
      })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            if (data.token) {
              setSessionToken(data.token);
            }
            checkSession();
          } else {
            setAuth({ isAuthenticated: false, isLoading: false, profile: null });
          }
        })
        .catch(() => {
          setAuth({ isAuthenticated: false, isLoading: false, profile: null });
        });
    } else if (path === '/auth/callback') {
      // Dev mode callback — no exchange code needed
      window.history.replaceState({}, '', '/');
      checkSession();
    }
  }, []);

  async function checkSession() {
    const token = getSessionToken();
    if (!token) {
      setAuth({ isAuthenticated: false, isLoading: false, profile: null });
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAuth({
          isAuthenticated: true,
          isLoading: false,
          profile: data.profile,
        });
      } else {
        clearSessionToken();
        setAuth({ isAuthenticated: false, isLoading: false, profile: null });
      }
    } catch {
      setAuth({ isAuthenticated: false, isLoading: false, profile: null });
    }
  }

  const login = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/login`);
      const data = await res.json();

      if (data.dev) {
        await checkSession();
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Login error:', error);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const token = getSessionToken();
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // Best-effort
    }
    clearSessionToken();
    localStorage.removeItem('tendr_token');
    localStorage.removeItem('tendr_profile');
    localStorage.removeItem('tendr_user');
    setAuth({ isAuthenticated: false, isLoading: false, profile: null });
  }, []);

  return {
    ...auth,
    login,
    logout,
  };
}

/**
 * Returns empty headers — auth is handled by the api.ts interceptor.
 */
export function getAuthHeaders(): Record<string, string> {
  return {};
}
