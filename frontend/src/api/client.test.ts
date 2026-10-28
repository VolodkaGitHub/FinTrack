import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, clientId, errorCode, errorMessage, fieldErrors } from './client';

const { getAccessToken, refreshAccessToken } = vi.hoisted(() => ({
  getAccessToken: vi.fn(async (): Promise<string | null> => 'current-token'),
  refreshAccessToken: vi.fn(async (_failed?: string) => 'fresh-token'),
}));
vi.mock('../auth/tokens', () => ({ getAccessToken, refreshAccessToken }));

const response = (config: InternalAxiosRequestConfig, status: number, data: unknown = {}): AxiosResponse => ({
  data,
  status,
  statusText: String(status),
  headers: {},
  config,
});

describe('api client', () => {
  const adapter = vi.fn();

  beforeEach(() => {
    adapter.mockReset();
    getAccessToken.mockReset().mockImplementation(async () => 'current-token');
    refreshAccessToken.mockReset().mockImplementation(async () => 'fresh-token');
    api.defaults.adapter = adapter;
  });

  it('adds client id and bearer token to API requests', async () => {
    adapter.mockImplementation(async (config: InternalAxiosRequestConfig) => response(config, 200, [1]));
    const result = await api.get('/accounts');
    const headers = adapter.mock.calls[0][0].headers as AxiosHeaders;
    expect(result.data).toEqual([1]);
    expect(headers.get('X-Client-Id')).toBe(clientId);
    expect(headers.get('Authorization')).toBe('Bearer current-token');
  });

  it('does not send the access token to public auth endpoints', async () => {
    adapter.mockImplementation(async (config: InternalAxiosRequestConfig) => response(config, 200));
    await api.post('/auth/login', {});
    expect((adapter.mock.calls[0][0].headers as AxiosHeaders).get('Authorization')).toBeUndefined();
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it('refreshes the token and retries once after 401', async () => {
    adapter
      .mockImplementationOnce(async (config: InternalAxiosRequestConfig) => {
        throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, response(config, 401));
      })
      .mockImplementationOnce(async (config: InternalAxiosRequestConfig) => response(config, 200, 'ok'));
    // після оновлення сховище вже містить новий токен
    getAccessToken.mockResolvedValueOnce('current-token').mockResolvedValueOnce('fresh-token');

    const result = await api.get('/transactions');

    expect(result.data).toBe('ok');
    expect(refreshAccessToken).toHaveBeenCalledWith('current-token');
    expect((adapter.mock.calls[1][0].headers as AxiosHeaders).get('Authorization')).toBe('Bearer fresh-token');
  });

  it('gives up when the retried request is unauthorized again or refresh fails', async () => {
    adapter.mockImplementation(async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, response(config, 401));
    });
    await expect(api.get('/budgets')).rejects.toBeInstanceOf(AxiosError);
    expect(adapter).toHaveBeenCalledTimes(2);

    refreshAccessToken.mockRejectedValueOnce(new Error('session expired'));
    await expect(api.get('/budgets')).rejects.toBeInstanceOf(AxiosError);
  });

  it('passes other errors through', async () => {
    adapter.mockImplementation(async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('Server error', 'ERR_BAD_RESPONSE', config, null, response(config, 500));
    });
    await expect(api.get('/accounts')).rejects.toMatchObject({ response: { status: 500 } });
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});

describe('error helpers', () => {
  const problem = (data: unknown, status = 400) =>
    new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, null, { status, data } as AxiosResponse);

  it('prefers the first field error, then detail', () => {
    const error = problem({ detail: 'Перевірте поля', code: 'VALIDATION_ERROR', errors: { amount: 'Вкажіть суму' } });
    expect(errorMessage(error)).toBe('Вкажіть суму');
    expect(errorCode(error)).toBe('VALIDATION_ERROR');
    expect(fieldErrors(error)).toEqual({ amount: 'Вкажіть суму' });
    expect(errorMessage(problem({ detail: 'Рахунок не знайдено' }, 404))).toBe('Рахунок не знайдено');
  });

  it('describes network failures and falls back for unknown errors', () => {
    expect(errorMessage(new AxiosError('Network Error', 'ERR_NETWORK'))).toContain('Немає зв’язку');
    expect(errorMessage(new Error('x'), 'Запасне повідомлення')).toBe('Запасне повідомлення');
    expect(errorMessage(problem(new Blob(['{}'])))).toBe('Сталася помилка. Спробуйте ще раз.');
    expect(fieldErrors(new Error('x'))).toEqual({});
    expect(errorCode(problem('plain text'))).toBeUndefined();
  });
});
