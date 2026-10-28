import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../test/apiMock';
import * as fx from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import DashboardPage from './DashboardPage';

vi.mock('../api/endpoints', async () => (await import('../test/apiMock')).endpoints);
vi.mock('../auth/AuthContext', async () => {
  const fixtures = await import('../test/fixtures');
  return { useAuth: () => ({ user: fixtures.user }), useCurrency: () => 'UAH' };
});
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('summarises balances, month totals, forecast, budgets and recent operations', async () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText('Вітаємо, Олена!')).toBeInTheDocument();
    expect(await screen.findByText(/33\s500,50\s₴/)).toBeInTheDocument();
    expect(screen.getByText('2 активних рахунків')).toBeInTheDocument();
    expect(screen.getByText(/^30\s000,00\s₴$/)).toBeInTheDocument();
    expect(screen.getByText(/Сальдо: \+29\s250,50/)).toBeInTheDocument();
    expect(await screen.findByText(/29\s001,50\s₴/)).toBeInTheDocument();
    expect(screen.getByText(/120,00\s₴ витрат на день/)).toBeInTheDocument();

    expect(await screen.findByText('60.1%')).toBeInTheDocument();
    expect(await screen.findByText(/3\s000,00\s₴ \/ 3\s500,00\s₴/)).toBeInTheDocument();
    expect(screen.getByText('Банківська картка')).toBeInTheDocument();
    expect(screen.queryByText('Стара картка')).toBeNull();

    expect(await screen.findByText('Продукти › Супермаркет')).toBeInTheDocument();
    expect(screen.getByText('Банківська картка → Готівка')).toBeInTheDocument();
    expect(endpoints.transactionsApi.search).toHaveBeenCalledWith({ page: 0, size: 7, sort: 'date', direction: 'desc' });
  });

  it('pays a manual recurring payment in one click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText(/Прострочено/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сплатити' }));
    await waitFor(() => expect(endpoints.recurringApi.apply).toHaveBeenCalled());
    expect(endpoints.recurringApi.apply.mock.calls[0][0]).toBe(301);
  });

  it('shows hints when there is no data yet', async () => {
    endpoints.analyticsApi.categories.mockResolvedValueOnce([]);
    endpoints.budgetsApi.list.mockResolvedValueOnce([]);
    endpoints.recurringApi.upcoming.mockResolvedValueOnce([]);
    endpoints.transactionsApi.search.mockResolvedValueOnce({ ...fx.transactionPage, content: [], totalElements: 0 });
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText('Цього місяця витрат ще немає')).toBeInTheDocument();
    expect(await screen.findByText('Бюджетів ще немає')).toBeInTheDocument();
    expect(await screen.findByText('На найближчі 2 тижні регулярних платежів немає')).toBeInTheDocument();
    expect(await screen.findByText('Операцій ще немає')).toBeInTheDocument();
  });
});
