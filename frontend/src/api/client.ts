import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, refreshAccessToken } from '../auth/tokens';

/** Ідентифікатор вкладки: сервер повертає його в подіях синхронізації, щоб вкладка не обробляла власні зміни. */
export const clientId: string =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(async (config) => {
  config.headers.set('X-Client-Id', clientId);
  if (!config.url?.startsWith('/auth/')) {
    const token = await getAccessToken();
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
  }
  return config;
});

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
  if (error.response?.status === 401 && original && !original._retried && !original.url?.startsWith('/auth/')) {
    original._retried = true;
    const failedToken = String(original.headers.get('Authorization') ?? '').replace('Bearer ', '');
    try {
      const token = await refreshAccessToken(failedToken);
      original.headers.set('Authorization', `Bearer ${token}`);
      return api(original);
    } catch {
      return Promise.reject(error);
    }
  }
  return Promise.reject(error);
});

interface ProblemBody {
  detail?: string;
  code?: string;
  errors?: Record<string, string>;
}

function problem(error: unknown): ProblemBody | undefined {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data && typeof data === 'object' && !(data instanceof Blob)) {
      return data as ProblemBody;
    }
  }
  return undefined;
}

export function errorMessage(error: unknown, fallback = 'Сталася помилка. Спробуйте ще раз.'): string {
  const body = problem(error);
  if (body?.errors) {
    const first = Object.values(body.errors)[0];
    if (first) {
      return first;
    }
  }
  if (body?.detail) {
    return body.detail;
  }
  if (axios.isAxiosError(error) && !error.response) {
    return 'Немає зв’язку із сервером. Перевірте підключення до мережі.';
  }
  return fallback;
}

export function errorCode(error: unknown): string | undefined {
  return problem(error)?.code;
}

export function fieldErrors(error: unknown): Record<string, string> {
  return problem(error)?.errors ?? {};
}
