import { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:3001';

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

  // Handle auth callback redirect (server already set the session cookie)
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/auth/callback') {
      // Clean the URL, then verify the session cookie
      window.history.replaceState({}, '', '/');
      checkSession();
    }
  }, []);

  async function checkSession() {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
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
        // Dev mode — server auto-authenticates via dev bypass
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
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Best-effort — clear local state regardless
    }
    // Clean up any legacy localStorage entries
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
 * Kept for backward compatibility with any remaining callers.
 */
export function getAuthHeaders(): Record<string, string> {
  return {};
}
