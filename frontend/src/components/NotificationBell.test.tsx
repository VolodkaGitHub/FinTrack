import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../test/apiMock';
import { renderWithProviders } from '../test/render';
import { NotificationBell } from './NotificationBell';

vi.mock('../api/endpoints', async () => (await import('../test/apiMock')).endpoints);
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

describe('NotificationBell (REQ-2.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows unread count and lets the user read and delete notifications', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    expect(await screen.findByText('1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Сповіщення' }));
    expect(screen.getByText('Бюджет «Продукти» майже вичерпано')).toBeInTheDocument();
    expect(screen.getByText('Регулярна операція: Netflix')).toBeInTheDocument();

    await user.click(screen.getByText('Бюджет «Продукти» майже вичерпано'));
    await waitFor(() => expect(endpoints.notificationsApi.markRead).toHaveBeenCalledWith(500));
    await user.click(screen.getByText('Регулярна операція: Netflix'));
    expect(endpoints.notificationsApi.markRead).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Позначити всі прочитаними' }));
    await waitFor(() => expect(endpoints.notificationsApi.markAllRead).toHaveBeenCalled());

    await user.click(screen.getAllByRole('button', { name: 'Видалити сповіщення' })[0]);
    await waitFor(() => expect(endpoints.notificationsApi.remove).toHaveBeenCalledWith(500));
  });

  it('shows an empty state', async () => {
    const user = userEvent.setup();
    endpoints.notificationsApi.list.mockResolvedValueOnce({ items: [], unreadCount: 0 });
    renderWithProviders(<NotificationBell />);
    await user.click(screen.getByRole('button', { name: 'Сповіщення' }));
    expect(await screen.findByText('Сповіщень поки немає')).toBeInTheDocument();
  });
});
