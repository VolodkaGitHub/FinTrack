import axios, { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  currentSessionId,
  decodeJwt,
  getAccessToken,
  isExpiringSoon,
  refreshAccessToken,
  SESSION_EXPIRED_EVENT,
  SessionExpiredError,
  tokenStore,
} from './tokens';

const base64url = (value: object) => {
  let binary = '';
  new TextEncoder().encode(JSON.stringify(value)).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const jwt = (payload: object) => `${base64url({ alg: 'HS256' })}.${base64url(payload)}.signature`;
const expiresIn = (seconds: number) => Math.floor(Date.now() / 1000) + seconds;

describe('JWT helpers', () => {
  it('decodes UTF-8 payload and reports session id', () => {
    const token = jwt({ sub: '7', name: 'Олена', sid: 42, exp: expiresIn(600) });
    expect(decodeJwt(token)).toMatchObject({ sub: '7', name: 'Олена', sid: 42 });
    tokenStore.set({ accessToken: token, refreshToken: 'r' });
    expect(currentSessionId()).toBe(42);
  });

  it('treats tokens without expiry or close to expiry as expiring', () => {
    expect(isExpiringSoon(jwt({ exp: expiresIn(600) }))).toBe(false);
    expect(isExpiringSoon(jwt({ exp: expiresIn(10) }))).toBe(true);
    expect(isExpiringSoon(jwt({ sub: '1' }))).toBe(true);
    expect(decodeJwt('not-a-jwt')).toBeNull();
    expect(currentSessionId()).toBeUndefined();
  });

  it('stores and clears tokens', () => {
    tokenStore.set({ accessToken: 'a', refreshToken: 'b' });
    expect(tokenStore.get()).toEqual({ accessToken: 'a', refreshToken: 'b' });
    tokenStore.clear();
    expect(tokenStore.get()).toBeNull();
  });
});

describe('token refresh', () => {
  const post = vi.spyOn(axios, 'post');

  // фігурні дужки важливі: функцію, повернуту з beforeEach, Vitest викликає як очищення після тесту
  beforeEach(() => {
    post.mockReset();
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'locks');
  });

  const refreshed = (accessToken: string, refreshToken = 'new-refresh') =>
    ({ data: { accessToken, refreshToken, expiresIn: 900 } }) as AxiosResponse;

  it('returns a valid stored token without calling the server', async () => {
    const token = jwt({ exp: expiresIn(600) });
    tokenStore.set({ accessToken: token, refreshToken: 'r' });
    await expect(getAccessToken()).resolves.toBe(token);
    expect(post).not.toHaveBeenCalled();
  });

  it('returns null when the user is not signed in', async () => {
    await expect(getAccessToken()).resolves.toBeNull();
    await expect(refreshAccessToken()).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('refreshes an expiring token once even for concurrent requests', async () => {
    tokenStore.set({ accessToken: jwt({ exp: expiresIn(5) }), refreshToken: 'old-refresh' });
    const fresh = jwt({ exp: expiresIn(900) });
    post.mockResolvedValue(refreshed(fresh));

    const [first, second] = await Promise.all([getAccessToken(), getAccessToken()]);

    expect(first).toBe(fresh);
    expect(second).toBe(fresh);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/auth/refresh', { refreshToken: 'old-refresh' });
    expect(tokenStore.get()).toEqual({ accessToken: fresh, refreshToken: 'new-refresh' });
  });

  it('reuses a token already refreshed by another tab', async () => {
    const current = jwt({ exp: expiresIn(900), n: 2 });
    tokenStore.set({ accessToken: current, refreshToken: 'r' });
    await expect(refreshAccessToken(jwt({ exp: expiresIn(900), n: 1 }))).resolves.toBe(current);
    expect(post).not.toHaveBeenCalled();
  });

  it('forces refresh when the server rejected the current token', async () => {
    const current = jwt({ exp: expiresIn(900) });
    tokenStore.set({ accessToken: current, refreshToken: 'r' });
    post.mockResolvedValue(refreshed('next'));
    await expect(refreshAccessToken(current)).resolves.toBe('next');
  });

  it('uses Web Locks to coordinate refresh between tabs', async () => {
    const request = vi.fn((_name: string, task: () => Promise<unknown>) => task());
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
    tokenStore.set({ accessToken: jwt({ exp: expiresIn(1) }), refreshToken: 'r' });
    post.mockResolvedValue(refreshed('locked'));
    await expect(refreshAccessToken()).resolves.toBe('locked');
    expect(request).toHaveBeenCalledWith('fintrack-token-refresh', expect.any(Function));
  });

  it('ends the session when the refresh token is rejected', async () => {
    tokenStore.set({ accessToken: jwt({ exp: expiresIn(1) }), refreshToken: 'revoked' });
    post.mockRejectedValue(new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, null, { status: 401 } as AxiosResponse));
    const expired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);

    await expect(refreshAccessToken()).rejects.toBeInstanceOf(SessionExpiredError);
    await expect(getAccessToken()).resolves.toBeNull();

    expect(tokenStore.get()).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  });

  it('keeps the session on network errors', async () => {
    tokenStore.set({ accessToken: jwt({ exp: expiresIn(1) }), refreshToken: 'r' });
    post.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    await expect(refreshAccessToken()).rejects.toBeInstanceOf(AxiosError);
    expect(tokenStore.get()).not.toBeNull();
  });
});
