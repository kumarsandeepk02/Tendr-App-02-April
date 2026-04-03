import axios from 'axios';

// In production: empty string → same-origin (Vercel proxies /api/* to App Runner).
// In dev: hit local server directly.
const API_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:3001';

/**
 * Pre-configured axios instance.
 * Auth is handled by HttpOnly session cookies — no header injection needed.
 */
export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Handle 401 — redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

/**
 * Fetch wrapper that includes credentials for session cookies.
 * Drop-in replacement for window.fetch for streaming endpoints.
 */
export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...options, credentials: 'include' });
}

export { API_URL };
