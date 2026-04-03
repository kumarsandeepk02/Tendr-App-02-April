import { useState, useEffect, useCallback } from 'react';

// In production: empty string → same-origin (Vercel proxies /api/* to App Runner).
// In dev: hit local server directly.
const API_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:3001';

// Direct URL to App Runner for cookie-setting requests.
// Vercel proxy strips Set-Cookie headers, so auth exchange + session
// calls must go directly to the backend.
const DIRECT_API_URL = process.env.REACT_APP_DIRECT_API_URL || API_URL;

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

  // Handle auth callback — exchange code for session cookie
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const exchangeCode = params.get('exchange_code');
    const path = window.location.pathname;

    if (path === '/auth/callback' && exchangeCode) {
      window.history.replaceState({}, '', '/');
      // Exchange the one-time code for a session cookie (direct to backend)
      fetch(`${DIRECT_API_URL}/api/auth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ exchange_code: exchangeCode }),
      })
        .then((res) => {
          if (res.ok) {
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
    try {
      const res = await fetch(`${DIRECT_API_URL}/api/auth/me`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setAuth({
          isAuthenticated: true,
          isLoading: false,
          profile: data.profile,
        });
      } else {
        setAuth({ isAuthenticated: false, isLoading: false, profile: null });
      }
    } catch {
      setAuth({ isAuthenticated: false, isLoading: false, profile: null });
    }
  }

  const login = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        credentials: 'include',
      });
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
      await fetch(`${DIRECT_API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Best-effort
    }
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
 * Returns empty headers — auth is now handled by session cookies.
 */
export function getAuthHeaders(): Record<string, string> {
  return {};
}
