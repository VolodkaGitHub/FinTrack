import { notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../test/apiMock';
import { AuthProvider, useAuth, useCurrency } from './AuthContext';
import { SESSION_EXPIRED_EVENT, tokenStore } from './tokens';

vi.mock('../api/endpoints', async () => (await import('../test/apiMock')).endpoints);
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

function Probe() {
  const { status, user, login, logout, acceptTokens } = useAuth();
  const currency = useCurrency();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.displayName ?? '-'}</span>
      <span data-testid="currency">{currency}</span>
      <button onClick={() => void login('olena@example.com', 'secret123')}>login</button>
      <button onClick={() => void logout()}>logout</button>
      <button onClick={() => void logout(false)}>local-logout</button>
      <button onClick={() => void acceptTokens({ accessToken: 'google-access', refreshToken: 'google-refresh' })}>accept</button>
    </div>
  );
}

function renderAuth() {
  const client = new QueryClient();
  const clear = vi.spyOn(client, 'clear');
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { clear };
}

const status = () => screen.getByTestId('status').textContent;

describe('AuthProvider (REQ-4.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts anonymous without stored tokens', () => {
    renderAuth();
    expect(status()).toBe('anonymous');
    expect(screen.getByTestId('currency').textContent).toBe('UAH');
    expect(endpoints.userApi.me).not.toHaveBeenCalled();
  });

  it('restores a stored session and drops an invalid one', async () => {
    tokenStore.set({ accessToken: 'a', refreshToken: 'r' });
    renderAuth();
    expect(status()).toBe('loading');
    await waitFor(() => expect(status()).toBe('authenticated'));
    expect(screen.getByTestId('user').textContent).toBe('Олена');
  });

  it('clears tokens when the stored session is no longer valid', async () => {
    tokenStore.set({ accessToken: 'a', refreshToken: 'r' });
    endpoints.userApi.me.mockRejectedValueOnce(new Error('401'));
    renderAuth();
    await waitFor(() => expect(status()).toBe('anonymous'));
    expect(tokenStore.get()).toBeNull();
  });

  it('logs in, then logs out on the server and locally', async () => {
    const user = userEvent.setup();
    const { clear } = renderAuth();
    await user.click(screen.getByText('login'));
    await waitFor(() => expect(status()).toBe('authenticated'));
    expect(endpoints.authApi.login).toHaveBeenCalledWith('olena@example.com', 'secret123');
    expect(tokenStore.get()).toEqual({ accessToken: 'access', refreshToken: 'refresh' });

    await user.click(screen.getByText('logout'));
    await waitFor(() => expect(status()).toBe('anonymous'));
    expect(endpoints.authApi.logout).toHaveBeenCalledWith('refresh');
    expect(clear).toHaveBeenCalled();
    expect(tokenStore.get()).toBeNull();
  });

  it('accepts tokens from Google login and supports local logout', async () => {
    const user = userEvent.setup();
    renderAuth();
    await user.click(screen.getByText('accept'));
    await waitFor(() => expect(status()).toBe('authenticated'));
    expect(endpoints.userApi.me).toHaveBeenCalled();
    await user.click(screen.getByText('local-logout'));
    expect(status()).toBe('anonymous');
    expect(endpoints.authApi.logout).not.toHaveBeenCalled();
  });

  it('reacts to an expired session and to logout in another tab', async () => {
    tokenStore.set({ accessToken: 'a', refreshToken: 'r' });
    renderAuth();
    await waitFor(() => expect(status()).toBe('authenticated'));
    act(() => {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    });
    expect(status()).toBe('anonymous');
    expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ title: 'Сесія завершилась' }));

    tokenStore.set({ accessToken: 'a', refreshToken: 'r' });
    renderAuth();
    await waitFor(() => expect(screen.getAllByTestId('status')[1].textContent).toBe('authenticated'));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'fintrack.refreshToken', newValue: null }));
    });
    expect(screen.getAllByTestId('status')[1].textContent).toBe('anonymous');
  });

  it('requires the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used inside AuthProvider');
  });
});
