/** Centralized API configuration — all requests go through the Node API (`api/`) */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || 'http://127.0.0.1:8000';

export const API_URL = `${API_BASE}/api`;

/** Realtime voice interview WebSocket (Node `api` WS server) */
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || 'ws://127.0.0.1:8081';

/** CV enhance endpoints (`/api/cv/enhance/*`) */
export const ENHANCE_API =
  process.env.NEXT_PUBLIC_ENHANCE_API?.replace(/\/$/, '') || `${API_URL}/cv/enhance`;

/** Conversational CV builder (`/api/cv/builder/*`) */
export const CV_GENERATOR_API =
  process.env.NEXT_PUBLIC_CV_BUILDER_API?.replace(/\/$/, '') || `${API_URL}/cv/builder`;

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

/** Fetch API without sending browser cookies (avoids 431 header overflow). */
export async function apiFetch(
  url: string,
  options: RequestInit = {},
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      credentials: 'omit',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body?.message && typeof body.message === 'string') return body.message;
    if (body?.error && typeof body.error === 'string') return body.error;
  } catch {
    // ignore non-JSON bodies
  }
  if (res.statusText) return `${res.status} ${res.statusText}`;
  return fallback;
}
