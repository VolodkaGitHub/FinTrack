import { notifications } from '@mantine/notifications';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../api/types';
import { endpoints } from '../test/apiMock';
import * as fx from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import SettingsPage from './SettingsPage';

interface LockMock {
  enabled: boolean;
  config: { pin: { length: number }; timeoutMinutes: number; biometricCredentialId?: string } | null;
  lock: ReturnType<typeof vi.fn>;
  setPin: ReturnType<typeof vi.fn>;
  checkPin: ReturnType<typeof vi.fn>;
  disable: ReturnType<typeof vi.fn>;
  enableBiometric: ReturnType<typeof vi.fn>;
  disableBiometric: ReturnType<typeof vi.fn>;
  setTimeoutMinutes: ReturnType<typeof vi.fn>;
}

const { auth, setUser, lock, environment } = vi.hoisted(() => ({
  auth: { user: null as unknown },
  setUser: vi.fn(),
  lock: {} as LockMock,
  environment: { crypto: true },
}));

vi.mock('../api/endpoints', async () => (await import('../test/apiMock')).endpoints);
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: auth.user, setUser }), useCurrency: () => 'UAH' }));
vi.mock('../lock/LockProvider', () => ({ useLock: () => lock }));
vi.mock('../lock/biometric', () => ({ isBiometricAvailable: vi.fn(async () => true) }));
vi.mock('../lock/pin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lock/pin')>()),
  isCryptoAvailable: () => environment.crypto,
}));
vi.mock('../utils/download', () => ({
  saveResponse: vi.fn(async (request: Promise<unknown>) => {
    await request;
  }),
  blobErrorMessage: vi.fn(async () => 'Не вдалося експортувати дані'),
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

const pinInputs = () => Array.from(document.querySelectorAll<HTMLInputElement>('.mantine-PinInput-input'));

async function typePin(user: ReturnType<typeof userEvent.setup>, input: HTMLInputElement, pin: string) {
  await user.click(input);
  await user.keyboard(pin);
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = fx.user;
    environment.crypto = true;
    Object.assign(lock, {
      enabled: false,
      config: null,
      lock: vi.fn(),
      setPin: vi.fn(async () => undefined),
      checkPin: vi.fn(async () => true),
      disable: vi.fn(),
      enableBiometric: vi.fn(async () => undefined),
      disableBiometric: vi.fn(),
      setTimeoutMinutes: vi.fn(),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'Notification');
  });

  it('updates the profile and accounting currency (REQ-4.1)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    const name = screen.getByLabelText('Ім’я');
    await user.clear(name);
    await user.type(name, 'Олена Петрівна');
    await user.click(screen.getByLabelText('Валюта обліку', { selector: 'input' }));
    await user.click(screen.getByRole('option', { name: 'USD — долар США ($)' }));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(setUser).toHaveBeenCalled());
    expect(endpoints.userApi.update.mock.calls[0][0]).toEqual({ displayName: 'Олена Петрівна', currency: 'USD' });
  });

  it('changes the password and reports errors', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    await user.type(screen.getByLabelText('Поточний пароль'), 'secret123');
    await user.type(screen.getByLabelText('Новий пароль'), 'newpass123');
    await user.type(screen.getByLabelText('Повторіть новий пароль'), 'newpass124');
    await user.click(screen.getByRole('button', { name: 'Змінити пароль' }));
    expect(screen.getByText('Паролі не збігаються')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Повторіть новий пароль'));
    await user.type(screen.getByLabelText('Повторіть новий пароль'), 'newpass123');
    await user.click(screen.getByRole('button', { name: 'Змінити пароль' }));
    await waitFor(() =>
      expect(endpoints.userApi.changePassword).toHaveBeenCalledWith({ currentPassword: 'secret123', newPassword: 'newpass123' }),
    );
    expect(notifications.show).toHaveBeenCalledWith({ color: 'teal', message: 'Пароль змінено' });

    endpoints.userApi.changePassword.mockRejectedValueOnce(
      new AxiosError('bad', 'ERR_BAD_REQUEST', undefined, null, {
        status: 400,
        data: { detail: 'Поточний пароль введено неправильно', code: 'BAD_CREDENTIALS' },
      } as AxiosResponse),
    );
    await user.type(screen.getByLabelText('Поточний пароль'), 'wrong1234');
    await user.type(screen.getByLabelText('Новий пароль'), 'another123');
    await user.type(screen.getByLabelText('Повторіть новий пароль'), 'another123');
    await user.click(screen.getByRole('button', { name: 'Змінити пароль' }));
    await waitFor(() =>
      expect(notifications.show).toHaveBeenLastCalledWith({ color: 'red', message: 'Поточний пароль введено неправильно' }),
    );
  });

  it('lets an account without password set one', async () => {
    const user = userEvent.setup();
    auth.user = { ...fx.user, authProvider: 'GOOGLE', hasPassword: false } satisfies User;
    renderWithProviders(<SettingsPage />);
    expect(screen.getByText('Встановити пароль')).toBeInTheDocument();
    expect(screen.queryByLabelText('Поточний пароль')).toBeNull();
    expect(screen.getByText('Вхід через Google')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Новий пароль'), 'newpass123');
    await user.type(screen.getByLabelText('Повторіть новий пароль'), 'newpass123');
    await user.click(screen.getByRole('button', { name: 'Змінити пароль' }));
    await waitFor(() => expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ hasPassword: true })));
  });

  it('lists device sessions and revokes another device (REQ-4.2)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText('Safari · iOS')).toBeInTheDocument();
    expect(screen.getByText('цей пристрій')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Завершити' }));
    await waitFor(() => expect(endpoints.userApi.revokeSession).toHaveBeenCalled());
    expect(endpoints.userApi.revokeSession.mock.calls[0][0]).toBe(2);
  });

  it('sets up a PIN and validates confirmation (REQ-4.4)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    expect(screen.getByText('вимкнено')).toBeInTheDocument();

    await typePin(user, pinInputs()[0], '1234');
    await typePin(user, pinInputs()[4], '4321');
    await user.click(screen.getByRole('button', { name: 'Зберегти PIN' }));
    expect(lock.setPin).not.toHaveBeenCalled();
    expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' }));

    await typePin(user, pinInputs()[4], '1234');
    await user.click(screen.getByRole('button', { name: 'Зберегти PIN' }));
    await waitFor(() => expect(lock.setPin).toHaveBeenCalledWith('1234'));
  });

  it('manages an enabled lock: timeout, biometrics, PIN change and disabling', async () => {
    const user = userEvent.setup();
    Object.assign(lock, { enabled: true, config: { pin: { length: 4 }, timeoutMinutes: 5 } });
    renderWithProviders(<SettingsPage />);
    expect(screen.getByText('увімкнено')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Блокувати після бездіяльності', { selector: 'input' }));
    await user.click(screen.getByRole('option', { name: '15 хвилин' }));
    expect(lock.setTimeoutMinutes).toHaveBeenCalledWith(15);

    await user.click(await screen.findByRole('button', { name: 'Увімкнути відбиток / Face ID / Windows Hello' }));
    await waitFor(() => expect(lock.enableBiometric).toHaveBeenCalled());
    lock.enableBiometric.mockRejectedValueOnce(new Error('cancelled'));
    await user.click(screen.getByRole('button', { name: 'Увімкнути відбиток / Face ID / Windows Hello' }));
    await waitFor(() => expect(notifications.show).toHaveBeenLastCalledWith(expect.objectContaining({ color: 'red' })));

    await user.click(screen.getByRole('button', { name: 'Заблокувати зараз' }));
    expect(lock.lock).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Змінити PIN' }));
    lock.checkPin.mockResolvedValueOnce(false);
    await typePin(user, pinInputs()[0], '0000');
    await typePin(user, pinInputs()[4], '5678');
    await typePin(user, pinInputs()[8], '5678');
    await user.click(screen.getByRole('button', { name: 'Зберегти PIN' }));
    await waitFor(() =>
      expect(notifications.show).toHaveBeenLastCalledWith({ color: 'red', message: 'Поточний PIN-код неправильний' }),
    );
    expect(lock.setPin).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Скасувати' }));

    await user.click(screen.getByRole('button', { name: 'Вимкнути захист' }));
    expect(lock.disable).toHaveBeenCalled();
  });

  it('turns biometric unlock off and asks for system notification permission', async () => {
    const user = userEvent.setup();
    const requestPermission = vi.fn(async () => 'granted');
    Object.defineProperty(globalThis, 'Notification', { value: { permission: 'default', requestPermission }, configurable: true });
    Object.assign(lock, { enabled: true, config: { pin: { length: 4 }, timeoutMinutes: 5, biometricCredentialId: 'cred' } });
    renderWithProviders(<SettingsPage />);

    expect(await screen.findByText('Розблокування біометрією увімкнено')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Вимкнути' }));
    expect(lock.disableBiometric).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Дозволити системні сповіщення браузера' }));
    expect(requestPermission).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Дозволити системні сповіщення браузера' })).toBeNull());
  });

  it('explains that PIN protection needs a secure connection', () => {
    environment.crypto = false;
    renderWithProviders(<SettingsPage />);
    expect(screen.getByText(/доступні лише через захищене з’єднання/)).toBeInTheDocument();
  });

  it('exports history to CSV (REQ-4.3)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    await user.click(screen.getByRole('button', { name: 'Завантажити CSV' }));
    await waitFor(() => expect(endpoints.dataApi.exportCsv).toHaveBeenCalledWith({ delimiter: 'comma' }));

    await user.click(screen.getByLabelText('Роздільник', { selector: 'input' }));
    await user.click(screen.getByRole('option', { name: /Крапка з комою/ }));
    await user.click(screen.getByLabelText('Період', { selector: 'input' }));
    await user.click(screen.getByRole('option', { name: 'Цей місяць' }));
    await user.click(screen.getByRole('button', { name: 'Завантажити CSV' }));
    await waitFor(() =>
      expect(endpoints.dataApi.exportCsv).toHaveBeenLastCalledWith({ from: fx.summary.from, to: fx.summary.to, delimiter: 'semicolon' }),
    );

    endpoints.dataApi.exportCsv.mockRejectedValueOnce(new Error('500'));
    await user.click(screen.getByRole('button', { name: 'Завантажити CSV' }));
    await waitFor(() =>
      expect(notifications.show).toHaveBeenLastCalledWith({ color: 'red', message: 'Не вдалося експортувати дані' }),
    );
  });

  it('previews and imports a CSV file (REQ-4.3)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    const file = new File(['Дата;Сума;Опис'], 'bank.csv', { type: 'text/csv' });
    await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, file);
    await user.click(screen.getByLabelText('Створювати відсутні рахунки й категорії'));
    await user.click(screen.getByLabelText('Пропускати дублікати'));
    await user.click(await screen.findByRole('button', { name: 'Перевірити файл' }));

    await waitFor(() =>
      expect(endpoints.dataApi.importCsv).toHaveBeenCalledWith(file, {
        dryRun: true,
        createMissing: false,
        skipDuplicates: false,
        defaultAccountId: null,
      }),
    );
    expect(await screen.findByText(/У файлі немає колонки рахунку/)).toBeInTheDocument();
    expect(screen.getByText(/Розпізнані колонки: date ← «Дата», amount ← «Сума», note ← «Опис»/)).toBeInTheDocument();
    expect(screen.getByText(/Буде створено: рахунок «Скарбничка», категорію «Витрата: Подорожі»/)).toBeInTheDocument();
    expect(screen.getAllByText('буде додано')).toHaveLength(2);
    expect(screen.getByText('Порожня дата')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Рахунок за замовчуванням', { exact: false, selector: 'input' }));
    await user.click(screen.getByRole('option', { name: 'Готівка' }));
    await user.click(await screen.findByRole('button', { name: 'Перевірити файл' }));
    await user.click(await screen.findByRole('button', { name: 'Імпортувати 2 операцій' }));
    await waitFor(() =>
      expect(endpoints.dataApi.importCsv).toHaveBeenLastCalledWith(file, expect.objectContaining({ dryRun: false, defaultAccountId: 1 })),
    );
    expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ title: 'Імпорт завершено', message: 'Додано операцій: 2' }));

    endpoints.dataApi.importCsv.mockRejectedValueOnce(new Error('broken'));
    await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, file);
    await user.click(screen.getByRole('button', { name: 'Перевірити файл' }));
    await waitFor(() => expect(notifications.show).toHaveBeenLastCalledWith(expect.objectContaining({ color: 'red' })));
  });
});
