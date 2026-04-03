import axios from 'axios';

// Same-origin in production (Vercel proxy rewrites /api/* to App Runner).
// In dev, hits local server directly.
const API_BASE = process.env.REACT_APP_API_URL ?? 'http://localhost:3001';

// ── Session token helpers ──────────────────────────────────────────────────
const TOKEN_KEY = 'tendr_session';

export function getSessionToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // sessionStorage unavailable (e.g. private browsing in some browsers)
  }
}

export function clearSessionToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

// ── Axios instance ─────────────────────────────────────────────────────────
export const api = axios.create({
  baseURL: API_BASE,
});

// Attach Authorization header to every request
api.interceptors.request.use((config) => {
  const token = getSessionToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — clear token and reload (shows login screen)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearSessionToken();
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

/**
 * Fetch wrapper that includes the session token as an Authorization header.
 * Drop-in replacement for window.fetch for streaming endpoints.
 */
export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getSessionToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

export const API_URL = API_BASE;
