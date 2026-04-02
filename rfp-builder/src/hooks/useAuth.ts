import { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

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
  token: string | null;
  profile: UserProfile | null;
}

// Dev mode: no WorkOS client ID means we're in dev
const IS_DEV = !process.env.REACT_APP_WORKOS_CLIENT_ID;

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    token: null,
    profile: null,
  });

  // Check for existing session on mount
  useEffect(() => {
    const token = localStorage.getItem('tendr_token');
    const savedProfile = localStorage.getItem('tendr_profile');

    if (IS_DEV) {
      // Dev mode: auto-authenticate
      fetchProfile('dev-token').then((profile) => {
        setAuth({
          isAuthenticated: true,
          isLoading: false,
          token: 'dev-token',
          profile,
        });
      }).catch(() => {
        // Even if profile fetch fails in dev, authenticate
        setAuth({
          isAuthenticated: true,
          isLoading: false,
          token: 'dev-token',
          profile: {
            id: 'dev-user',
            fullName: 'Dev User',
            avatarUrl: null,
            role: 'procurement_manager',
            industry: 'General',
            onboarded: true,
          },
        });
      });
      return;
    }

    if (token && savedProfile) {
      // Verify token is still valid
      fetchProfile(token)
        .then((profile) => {
          setAuth({
            isAuthenticated: true,
            isLoading: false,
            token,
            profile,
          });
        })
        .catch(() => {
          // Token expired, clear and show login
          localStorage.removeItem('tendr_token');
          localStorage.removeItem('tendr_profile');
          setAuth({ isAuthenticated: false, isLoading: false, token: null, profile: null });
        });
    } else {
      setAuth((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Handle auth callback from WorkOS redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const userJson = params.get('user');

    if (token) {
      localStorage.setItem('tendr_token', token);

      if (userJson) {
        try {
          localStorage.setItem('tendr_user', userJson);
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);

      // Fetch full profile from backend
      fetchProfile(token).then((profile) => {
        localStorage.setItem('tendr_profile', JSON.stringify(profile));
        setAuth({
          isAuthenticated: true,
          isLoading: false,
          token,
          profile,
        });
      });
    }
  }, []);

  const login = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/login`);
      const data = await res.json();

      if (data.dev) {
        // Dev mode — auto login
        setAuth({
          isAuthenticated: true,
          isLoading: false,
          token: 'dev-token',
          profile: {
            id: 'dev-user',
            fullName: 'Dev User',
            avatarUrl: null,
            role: 'procurement_manager',
            industry: 'General',
            onboarded: true,
          },
        });
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Login error:', error);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('tendr_token');
    localStorage.removeItem('tendr_profile');
    localStorage.removeItem('tendr_user');
    setAuth({ isAuthenticated: false, isLoading: false, token: null, profile: null });

    fetch(`${API_URL}/api/auth/logout`, { method: 'POST' }).catch(() => {});
  }, []);

  return {
    ...auth,
    login,
    logout,
  };
}

async function fetchProfile(token: string): Promise<UserProfile> {
  const headers: Record<string, string> = {};

  if (token === 'dev-token') {
    headers['x-user-id'] = 'dev-user';
  } else {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}/api/auth/me`, { headers });
  if (!res.ok) throw new Error('Failed to fetch profile');
  const data = await res.json();
  return data.profile;
}

/**
 * Returns headers object with auth token for API calls.
 */
export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('tendr_token');

  if (IS_DEV || token === 'dev-token') {
    return { 'x-user-id': 'dev-user' };
  }

  if (token) {
    return { Authorization: `Bearer ${token}` };
  }

  return {};
}
