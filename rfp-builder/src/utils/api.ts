import axios from 'axios';

// Direct URL to App Runner — cookies (session auth) must go directly
// to the backend, not through Vercel's proxy which strips Set-Cookie.
const DIRECT_API_URL = process.env.REACT_APP_DIRECT_API_URL
  || process.env.REACT_APP_API_URL
  || 'http://localhost:3001';

/**
 * Pre-configured axios instance.
 * Auth is handled by HttpOnly session cookies sent directly to App Runner.
 */
export const api = axios.create({
  baseURL: DIRECT_API_URL,
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

export const API_URL = DIRECT_API_URL;
