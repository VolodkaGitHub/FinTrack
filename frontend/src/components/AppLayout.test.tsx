import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fx from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import { AppLayout } from './AppLayout';

const { logout, lock, syncStatus } = vi.hoisted(() => ({
  logout: vi.fn(),
  lock: { enabled: true, lock: vi.fn() },
  syncStatus: vi.fn(() => 'online'),
}));

vi.mock('../api/endpoints', async () => (await import('../test/apiMock')).endpoints);
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: fx.user, logout }), useCurrency: () => 'UAH' }));
vi.mock('../lock/LockProvider', () => ({ useLock: () => lock }));
vi.mock('../sync/SyncProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sync/SyncProvider')>()),
  useSyncStatus: syncStatus,
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lock.enabled = true;
    syncStatus.mockReturnValue('online');
  });

  it('shows navigation for all modules and sync status', () => {
    renderWithProviders(<AppLayout />);
    for (const item of ['Огляд', 'Операції', 'Рахунки', 'Регулярні платежі', 'Бюджети', 'Категорії', 'Аналітика і звіти', 'Налаштування']) {
      expect(screen.getByRole('link', { name: item })).toBeInTheDocument();
    }
    expect(screen.getByText('Синхронізовано')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Огляд' })).toHaveAttribute('data-active', 'true');
  });

  it.each([
    ['offline', 'Офлайн'],
    ['connecting', 'Підключення…'],
  ])('shows %s sync status', (status, label) => {
    syncStatus.mockReturnValue(status);
    renderWithProviders(<AppLayout />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('opens the operation form, locks the app and logs out', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppLayout />);

    await user.click(screen.getByRole('button', { name: 'Операція' }));
    expect(await screen.findByText('Нова операція')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Скасувати' }));

    await user.click(screen.getByRole('button', { name: 'Заблокувати' }));
    expect(lock.lock).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Перемкнути тему' }));
    await user.click(screen.getByRole('button', { name: 'Меню' }));

    await user.click(screen.getByRole('button', { name: 'Меню користувача' }));
    expect(screen.getByText(fx.user.email)).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Вийти' }));
    expect(logout).toHaveBeenCalled();
  });

  it('hides the lock button when PIN protection is off', () => {
    lock.enabled = false;
    renderWithProviders(<AppLayout />);
    expect(screen.queryByRole('button', { name: 'Заблокувати' })).toBeNull();
  });
});
