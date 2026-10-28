import { notifications } from '@mantine/notifications';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../test/apiMock';
import * as fx from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import { saveResponse } from '../utils/download';
import AnalyticsPage from './AnalyticsPage';

vi.mock('../api/endpoints', async () => (await import('../test/apiMock')).endpoints);
vi.mock('../auth/AuthContext', () => ({ useCurrency: () => 'UAH' }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
vi.mock('../utils/download', () => ({
  saveResponse: vi.fn(async (request: Promise<unknown>) => {
    await request;
  }),
  blobErrorMessage: vi.fn(async () => 'Звіт можна сформувати максимум за 5 років'),
}));

const openTab = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(screen.getByRole('tab', { name }));
};

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows expense structure and drills down into subcategories (REQ-3.1)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnalyticsPage />);
    expect(await screen.findByText(/^749,50\s₴$/)).toBeInTheDocument();
    expect(screen.getByText('60.1% · деталізувати ›')).toBeInTheDocument();

    await user.click(screen.getByText('Продукти'));
    await waitFor(() => expect(endpoints.analyticsApi.categories).toHaveBeenLastCalledWith(fx.summary.from, fx.summary.to, 'EXPENSE', 10));
    expect(screen.getByRole('button', { name: 'Усі категорії' })).toBeInTheDocument();
    // повернення до верхнього рівня бере дані з кешу
    await user.click(screen.getByRole('button', { name: 'Усі категорії' }));
    expect(screen.queryByRole('button', { name: 'Усі категорії' })).toBeNull();
    expect(screen.getByText('60.1% · деталізувати ›')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Доходи' }));
    await waitFor(() => expect(endpoints.analyticsApi.categories).toHaveBeenLastCalledWith(fx.summary.from, fx.summary.to, 'INCOME', null));
  });

  it('shows an empty structure', async () => {
    endpoints.analyticsApi.categories.mockResolvedValueOnce([]);
    renderWithProviders(<AnalyticsPage />);
    expect(await screen.findByText('Немає даних за обраний період')).toBeInTheDocument();
  });

  it('compares income and expenses by month with trends (REQ-3.2)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnalyticsPage />);
    await openTab(user, 'Динаміка');
    expect(await screen.findByText(/зростають на 1\s200,50\s₴ \/ міс\./)).toBeInTheDocument();
    expect(screen.getByText(/спадають на 150,00\s₴ \/ міс\./)).toBeInTheDocument();
    expect(screen.getByText(/^8\s950,00\s₴$/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '24 міс.' }));
    await waitFor(() =>
      expect(endpoints.analyticsApi.monthly).toHaveBeenLastCalledWith(dayjs().subtract(23, 'month').format('YYYY-MM'), dayjs().format('YYYY-MM')),
    );
  });

  it('describes a stable trend', async () => {
    const user = userEvent.setup();
    endpoints.analyticsApi.monthly.mockResolvedValueOnce({ ...fx.monthly, incomeSlope: 0.4, expenseSlope: -0.2 });
    renderWithProviders(<AnalyticsPage />);
    await openTab(user, 'Динаміка');
    expect(await screen.findAllByText('стабільно')).toHaveLength(2);
  });

  it('forecasts the balance and warns about a possible deficit (REQ-3.4)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnalyticsPage />);
    await openTab(user, 'Прогноз');
    expect(await screen.findByText('Як рахується прогноз')).toBeInTheDocument();
    expect(screen.getByText(/^29\s001,50\s₴$/)).toBeInTheDocument();
    // очікувані регулярні платежі: у картці та в списку
    expect(screen.getAllByText(/−1\s800,00\s₴/)).toHaveLength(2);
    expect(screen.getByText(/Комуналка/)).toBeInTheDocument();
    expect(screen.queryByText('Можливий дефіцит коштів')).toBeNull();
  });

  it('warns when the forecast is negative', async () => {
    const user = userEvent.setup();
    endpoints.analyticsApi.forecast.mockResolvedValueOnce({ ...fx.forecast, projectedEndBalance: -500, upcoming: [] });
    renderWithProviders(<AnalyticsPage />);
    await openTab(user, 'Прогноз');
    expect(await screen.findByText('Можливий дефіцит коштів')).toBeInTheDocument();
  });

  it('downloads PDF and Excel reports and shows errors (REQ-3.3)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnalyticsPage />);
    await openTab(user, 'Звіти');

    await user.click(screen.getByRole('button', { name: 'Завантажити PDF' }));
    await waitFor(() => expect(endpoints.reportsApi.summary).toHaveBeenCalledWith(fx.summary.from, fx.summary.to, 'pdf'));
    expect(saveResponse).toHaveBeenCalledWith(expect.any(Promise), 'fintrack-report.pdf');

    await user.click(screen.getByLabelText('Період', { selector: 'input' }));
    await user.click(screen.getByRole('option', { name: 'Весь час' }));
    await user.click(screen.getByRole('button', { name: 'Завантажити Excel' }));
    await waitFor(() =>
      expect(endpoints.reportsApi.summary).toHaveBeenLastCalledWith(
        dayjs().subtract(5, 'year').format('YYYY-MM-DD'),
        dayjs().format('YYYY-MM-DD'),
        'xlsx',
      ),
    );

    endpoints.reportsApi.summary.mockRejectedValueOnce(new Error('400'));
    await user.click(screen.getByRole('button', { name: 'Завантажити PDF' }));
    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith({ color: 'red', message: 'Звіт можна сформувати максимум за 5 років' }),
    );
  });
});
