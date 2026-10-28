import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../test/apiMock';
import * as fx from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import BudgetsPage from './BudgetsPage';

vi.mock('../api/endpoints', async () => (await import('../test/apiMock')).endpoints);
vi.mock('../auth/AuthContext', () => ({ useCurrency: () => 'UAH' }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

const lookups: Array<[string[], unknown]> = [
  [['accounts'], fx.accounts],
  [['categories'], fx.categories],
];

describe('BudgetsPage (REQ-2.2, REQ-2.3, REQ-2.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows remaining amounts, states, carried-over sums and alert thresholds', async () => {
    renderWithProviders(<BudgetsPage />, { queryData: lookups });
    expect(await screen.findByText('Наближається до ліміту')).toBeInTheDocument();
    expect(screen.getByText(/^4\s200,00\s₴$/)).toBeInTheDocument();
    expect(screen.getByText(/Залишок 500,00\s₴/)).toBeInTheDocument();
    expect(screen.getByText(/Перевищено на 200,00\s₴/)).toBeInTheDocument();
    expect(screen.getByText(/\+500,00\s₴ перенесено/)).toBeInTheDocument();
    expect(screen.getByText('залишок переноситься')).toBeInTheDocument();
    expect(screen.getByText('скидається щомісяця')).toBeInTheDocument();
    expect(screen.getByText('сповіщення з 90%')).toBeInTheDocument();
    expect(endpoints.budgetsApi.list).toHaveBeenCalledWith(dayjs().format('YYYY-MM'));
  });

  it('creates a budget only for categories without one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BudgetsPage />, { queryData: lookups });
    await screen.findByText('Наближається до ліміту');
    await user.click(screen.getByRole('button', { name: 'Новий бюджет' }));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(screen.getByText('Оберіть категорію')).toBeInTheDocument();
    expect(screen.getByText('Вкажіть суму, більшу за нуль')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Категорія витрат', { exact: false, selector: 'input' }));
    expect(screen.queryByRole('option', { name: 'Продукти' })).toBeNull();
    await user.click(screen.getByRole('option', { name: 'Комунальні послуги' }));
    await user.type(screen.getByLabelText('Ліміт на місяць', { exact: false }), '2000');
    await user.click(screen.getByRole('radio', { name: 'Переносити' }));
    expect(screen.getByText('Залишок цього місяця додасться до ліміту наступного.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(endpoints.budgetsApi.create).toHaveBeenCalled());
    expect(endpoints.budgetsApi.create.mock.calls[0][0]).toEqual({
      categoryId: 13,
      amount: 2000,
      rollover: true,
      alertThreshold: 80,
      version: undefined,
    });
  });

  it('edits and deletes budgets', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BudgetsPage />, { queryData: lookups });
    await screen.findByText('Наближається до ліміту');

    await user.click(screen.getAllByRole('button', { name: 'Дії з бюджетом' })[1]);
    await user.click(screen.getByRole('menuitem', { name: 'Редагувати' }));
    expect(screen.getByText('Скидається', { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(endpoints.budgetsApi.update).toHaveBeenCalled());
    expect(endpoints.budgetsApi.update.mock.calls[0]).toEqual([
      401,
      { categoryId: 12, amount: 1000, rollover: false, alertThreshold: 90, version: 4 },
    ]);

    await user.click(screen.getAllByRole('button', { name: 'Дії з бюджетом' })[0]);
    await user.click(screen.getByRole('menuitem', { name: 'Видалити' }));
    const dialog = await screen.findByRole('dialog', { name: 'Видалити бюджет «Продукти»?' });
    await user.click(within(dialog).getByRole('button', { name: 'Видалити' }));
    await waitFor(() => expect(endpoints.budgetsApi.remove).toHaveBeenCalled());
    expect(endpoints.budgetsApi.remove.mock.calls[0][0]).toBe(400);
  });

  it('switches to another month', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BudgetsPage />, { queryData: lookups });
    await screen.findByText('Наближається до ліміту');
    const current = dayjs().month();
    const target = dayjs().month(current > 0 ? current - 1 : current + 1);
    await user.click(screen.getByRole('button', { name: 'Місяць' }));
    await user.click(screen.getByRole('button', { name: target.format('MMM') }));
    await waitFor(() => expect(endpoints.budgetsApi.list).toHaveBeenLastCalledWith(target.format('YYYY-MM')));
    expect(await screen.findByText(/Для минулих місяців/)).toBeInTheDocument();
  });

  it('suggests creating the first budget', async () => {
    endpoints.budgetsApi.list.mockResolvedValueOnce([]);
    renderWithProviders(<BudgetsPage />, { queryData: lookups });
    expect(await screen.findByText(/^Бюджетів на .+ немає$/)).toBeInTheDocument();
  });
});
