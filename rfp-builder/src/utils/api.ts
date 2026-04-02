import axios from 'axios';
import { getAuthHeaders } from '../hooks/useAuth';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

/**
 * Pre-configured axios instance that automatically includes auth headers.
 */
export const api = axios.create({
  baseURL: API_URL,
});

// Inject auth headers on every request
api.interceptors.request.use((config) => {
  const authHeaders = getAuthHeaders();
  Object.entries(authHeaders).forEach(([key, value]) => {
    config.headers.set(key, value);
  });
  return config;
});

// Handle 401 — redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('tendr_token');
      localStorage.removeItem('tendr_profile');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

/**
 * Fetch wrapper that includes auth headers.
 * Drop-in replacement for window.fetch for streaming endpoints.
 */
export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const authHeaders = getAuthHeaders();
  const headers = new Headers(options.headers || {});

  Object.entries(authHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return fetch(url, { ...options, headers });
}

export { API_URL };
