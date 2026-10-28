import axios from 'axios';
import type { AuthTokens } from '../api/types';

const ACCESS_KEY = 'fintrack.accessToken';
const REFRESH_KEY = 'fintrack.refreshToken';
export const SESSION_EXPIRED_EVENT = 'fintrack:session-expired';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub?: string;
  exp?: number;
  sid?: number;
  name?: string;
  email?: string;
}

export const tokenStore = {
  get(): StoredTokens | null {
    try {
      const accessToken = localStorage.getItem(ACCESS_KEY);
      const refreshToken = localStorage.getItem(REFRESH_KEY);
      return accessToken && refreshToken ? { accessToken, refreshToken } : null;
    } catch {
      return null;
    }
  },
  set(tokens: StoredTokens) {
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as JwtPayload;
  } catch {
    return null;
  }
}

export function isExpiringSoon(token: string, seconds = 30): boolean {
  const payload = decodeJwt(token);
  return !payload?.exp || payload.exp * 1000 - Date.now() < seconds * 1000;
}

export function currentSessionId(): number | undefined {
  const tokens = tokenStore.get();
  return tokens ? decodeJwt(tokens.accessToken)?.sid : undefined;
}

export class SessionExpiredError extends Error {
  constructor() {
    super('Сесія завершилась');
  }
}

let refreshing: Promise<string> | null = null;

/** Блокування між вкладками: лише одна вкладка оновлює токен, решта бере вже оновлений. */
async function withCrossTabLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('fintrack-token-refresh', task);
  }
  return task();
}

/**
 * Оновлює access-токен через refresh-токен (з ротацією). Якщо передано failedToken, оновлення виконується лише тоді,
 * коли в сховищі досі той самий токен (інакше його вже оновила інша вкладка).
 */
export function refreshAccessToken(failedToken?: string): Promise<string> {
  if (!refreshing) {
    refreshing = withCrossTabLock(async () => {
      const current = tokenStore.get();
      if (!current) {
        throw new SessionExpiredError();
      }
      const stale = failedToken ? current.accessToken === failedToken : isExpiringSoon(current.accessToken);
      if (!stale) {
        return current.accessToken;
      }
      try {
        const { data } = await axios.post<AuthTokens>('/api/auth/refresh', { refreshToken: current.refreshToken });
        tokenStore.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        return data.accessToken;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          tokenStore.clear();
          window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
          throw new SessionExpiredError();
        }
        throw error;
      }
    }).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export async function getAccessToken(): Promise<string | null> {
  const tokens = tokenStore.get();
  if (!tokens) {
    return null;
  }
  if (isExpiringSoon(tokens.accessToken)) {
    try {
      return await refreshAccessToken();
    } catch {
      return null;
    }
  }
  return tokens.accessToken;
}
