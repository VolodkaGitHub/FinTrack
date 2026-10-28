import { notifications } from '@mantine/notifications';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../test/apiMock';
import * as fx from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import LoginPage from './LoginPage';
import OAuthCallbackPage from './OAuthCallbackPage';
import RegisterPage from './RegisterPage';
import VerifyEmailPage from './VerifyEmailPage';

const { login, acceptTokens } = vi.hoisted(() => ({ login: vi.fn(), acceptTokens: vi.fn() }));

vi.mock('../../api/endpoints', async () => (await import('../../test/apiMock')).endpoints);
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ login, acceptTokens }) }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

const problem = (status: number, data: object) =>
  new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, null, { status, data } as AxiosResponse);

describe('LoginPage (REQ-4.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    login.mockResolvedValue(undefined);
  });

  it('validates the form and logs in', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, { route: '/login', path: '/login' });
    await user.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(screen.getByText('Вкажіть коректний email')).toBeInTheDocument();
    expect(screen.getByText('Вкажіть пароль')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email'), 'olena@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(login).toHaveBeenCalledWith('olena@example.com', 'secret123');
    expect(await screen.findByText('Головна сторінка')).toBeInTheDocument();
  });

  it('offers to resend the confirmation e-mail when it is not verified', async () => {
    const user = userEvent.setup();
    login.mockRejectedValueOnce(problem(403, { code: 'EMAIL_NOT_VERIFIED', detail: 'Підтвердіть електронну пошту' }));
    renderWithProviders(<LoginPage />, { route: '/login', path: '/login' });
    await user.type(screen.getByLabelText('Email'), 'olena@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Увійти' }));

    expect(await screen.findByText('Підтвердіть електронну пошту')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Надіслати лист повторно' }));
    expect(endpoints.authApi.resendVerification).toHaveBeenCalledWith('olena@example.com');
    await waitFor(() => expect(notifications.show).toHaveBeenCalled());
  });

  it('shows Google login when it is configured and OAuth errors from the redirect', async () => {
    renderWithProviders(<LoginPage />, { route: '/login?error=oauth', path: '/login' });
    expect(screen.getByText('Не вдалося увійти через Google. Спробуйте ще раз.')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Увійти через Google' })).toHaveAttribute('href', '/oauth2/authorization/google');
    expect(screen.getByRole('link', { name: 'Зареєструватися' })).toHaveAttribute('href', '/register');
  });

  it('hides Google login when it is not configured', async () => {
    endpoints.authApi.providers.mockResolvedValueOnce({ google: false });
    renderWithProviders(<LoginPage />, { route: '/login?error=EMAIL_NOT_VERIFIED', path: '/login' });
    expect(screen.getByText('Google-акаунт не має підтвердженої пошти.')).toBeInTheDocument();
    await waitFor(() => expect(endpoints.authApi.providers).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Увійти через Google' })).toBeNull();
  });
});

describe('RegisterPage (REQ-4.1)', () => {
  beforeEach(() => vi.clearAllMocks());

  async function fill(user: ReturnType<typeof userEvent.setup>, password = 'secret123', confirm = password) {
    await user.type(screen.getByLabelText('Ім’я'), 'Олена');
    await user.type(screen.getByLabelText('Email'), 'olena@example.com');
    await user.type(screen.getByLabelText('Пароль'), password);
    await user.type(screen.getByLabelText('Повторіть пароль'), confirm);
    await user.click(screen.getByRole('button', { name: 'Зареєструватися' }));
  }

  it('validates password rules', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    expect(screen.getAllByText('Щонайменше 8 символів, літери та цифри')).toHaveLength(1);
    await fill(user, 'password', 'different');
    // підказка під полем + повідомлення про помилку
    expect(screen.getAllByText('Щонайменше 8 символів, літери та цифри')).toHaveLength(2);
    expect(screen.getByText('Паролі не збігаються')).toBeInTheDocument();
    expect(endpoints.authApi.register).not.toHaveBeenCalled();
  });

  it('registers and asks to confirm the e-mail', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fill(user);
    expect(endpoints.authApi.register).toHaveBeenCalledWith({ displayName: 'Олена', email: 'olena@example.com', password: 'secret123' });
    expect(await screen.findByText('Підтвердіть email')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'надішліть ще раз' }));
    expect(endpoints.authApi.resendVerification).toHaveBeenCalledWith('olena@example.com');
  });

  it('shows server-side errors', async () => {
    const user = userEvent.setup();
    endpoints.authApi.register.mockRejectedValueOnce(
      problem(409, { detail: 'Користувач з таким email уже зареєстрований' }),
    );
    renderWithProviders(<RegisterPage />);
    await fill(user);
    expect(await screen.findByText('Користувач з таким email уже зареєстрований')).toBeInTheDocument();
  });
});

describe('VerifyEmailPage (REQ-4.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acceptTokens.mockResolvedValue(undefined);
  });

  it('confirms the e-mail and signs the user in', async () => {
    renderWithProviders(<VerifyEmailPage />, { route: '/verify-email?token=abc', path: '/verify-email' });
    expect(screen.getByText('Підтверджуємо вашу пошту…')).toBeInTheDocument();
    expect(await screen.findByText('Головна сторінка')).toBeInTheDocument();
    expect(endpoints.authApi.verifyEmail).toHaveBeenCalledTimes(1);
    expect(endpoints.authApi.verifyEmail).toHaveBeenCalledWith('abc');
    expect(acceptTokens).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'access' }), fx.user);
  });

  it('explains invalid or missing links', async () => {
    endpoints.authApi.verifyEmail.mockRejectedValueOnce(problem(400, { detail: 'Термін дії посилання минув' }));
    renderWithProviders(<VerifyEmailPage />, { route: '/verify-email?token=old', path: '/verify-email' });
    expect(await screen.findByText('Термін дії посилання минув')).toBeInTheDocument();
  });

  it('handles a link without token', () => {
    renderWithProviders(<VerifyEmailPage />, { route: '/verify-email', path: '/verify-email' });
    expect(screen.getByText(/немає токена підтвердження/)).toBeInTheDocument();
  });
});

describe('OAuthCallbackPage (REQ-4.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acceptTokens.mockResolvedValue(undefined);
  });

  it('stores tokens from the URL fragment and removes them from the address bar', async () => {
    window.history.replaceState(null, '', '/auth/callback#access=acc&refresh=ref');
    renderWithProviders(<OAuthCallbackPage />, { route: '/auth/callback', path: '/auth/callback' });
    expect(await screen.findByText('Головна сторінка')).toBeInTheDocument();
    expect(acceptTokens).toHaveBeenCalledWith({ accessToken: 'acc', refreshToken: 'ref' });
    expect(window.location.hash).toBe('');
  });

  it('returns to the login page when tokens are missing or rejected', async () => {
    window.history.replaceState(null, '', '/auth/callback');
    renderWithProviders(<OAuthCallbackPage />, { route: '/auth/callback', path: '/auth/callback' });
    expect(await screen.findByText('Інша сторінка')).toBeInTheDocument();
    expect(acceptTokens).not.toHaveBeenCalled();

    acceptTokens.mockRejectedValueOnce(new Error('invalid'));
    window.history.replaceState(null, '', '/auth/callback#access=a&refresh=b');
    renderWithProviders(<OAuthCallbackPage />, { route: '/auth/callback', path: '/auth/callback' });
    await waitFor(() => expect(screen.getAllByText('Інша сторінка')).toHaveLength(2));
  });
});
