/** Centralized API configuration — single source for all frontend services */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || 'http://127.0.0.1:8000';

export const API_URL = `${API_BASE}/api`;

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://127.0.0.1:8081';

export const ENHANCE_API =
  process.env.NEXT_PUBLIC_ENHANCE_API || 'http://127.0.0.1:5006';

export const CV_GENERATOR_API =
  process.env.NEXT_PUBLIC_AI_API_BASE_URL || 'http://127.0.0.1:5007';

export function getStoredUser<T = Record<string, unknown>>(): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('cvmaster_user');
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function requireAuth(router: { push: (path: string) => void }): boolean {
  if (getStoredUser()) return true;
  router.push('/login');
  return false;
}
