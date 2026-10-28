import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../test/apiMock';
import * as fx from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import TransactionsPage from './TransactionsPage';

vi.mock('../api/endpoints', async () => (await import('../test/apiMock')).endpoints);
vi.mock('../auth/AuthContext', () => ({ useCurrency: () => 'UAH' }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

const lastFilter = () => endpoints.transactionsApi.search.mock.lastCall?.[0] as Record<string, unknown>;

describe('TransactionsPage (REQ-1.1, REQ-1.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists operations with totals, planned and recurring markers', async () => {
    renderWithProviders(<TransactionsPage />);
    expect(await screen.findByText(/Знайдено 4 операції/)).toBeInTheDocument();
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Продукти › Супермаркет')).toBeInTheDocument();
    expect(table.getByText('Переказ між рахунками')).toBeInTheDocument();
    expect(table.getByText('Банківська картка → Готівка')).toBeInTheDocument();
    expect(table.getByText('заплановано')).toBeInTheDocument();
    expect(lastFilter()).toMatchObject({ page: 0, size: 20, sort: 'date', direction: 'desc' });
    expect(lastFilter().from).toBe(fx.summary.from);
  });

  it('filters by type, account, category, amount and text', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);
    await screen.findByText(/Знайдено/);

    await user.click(screen.getByRole('radio', { name: 'Витрати' }));
    await waitFor(() => expect(lastFilter()).toMatchObject({ type: 'EXPENSE' }));

    await user.click(screen.getByPlaceholderText('Усі рахунки'));
    await user.click(screen.getByRole('option', { name: 'Готівка' }));
    await waitFor(() => expect(lastFilter()).toMatchObject({ accountId: 1 }));

    await user.click(screen.getByPlaceholderText('Усі категорії'));
    await user.click(screen.getByRole('option', { name: 'Продукти' }));
    await waitFor(() => expect(lastFilter()).toMatchObject({ categoryId: 10 }));

    await user.type(screen.getByPlaceholderText('Сума від'), '100');
    await user.type(screen.getByPlaceholderText('Сума до'), '500');
    await waitFor(() => expect(lastFilter()).toMatchObject({ minAmount: 100, maxAmount: 500 }));

    await user.type(screen.getByLabelText('Пошук у нотатках і категоріях'), 'кава');
    await waitFor(() => expect(lastFilter()).toMatchObject({ q: 'кава' }), { timeout: 10_000 });

    // скинутий фільтр збігається з початковим — список береться з кешу, тому перевіряємо стан форми
    await user.click(screen.getByRole('button', { name: 'Скинути фільтри' }));
    expect(screen.getByLabelText('Пошук у нотатках і категоріях')).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Усі' })).toBeChecked();
    expect(screen.getByPlaceholderText('Сума від')).toHaveValue('');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Скинути фільтри' })).toBeNull());
  }, 20_000);

  it('sorts, paginates and switches to the whole history', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);
    await screen.findByText(/Знайдено/);

    await user.click(screen.getByRole('button', { name: 'Сума' }));
    await waitFor(() => expect(lastFilter()).toMatchObject({ sort: 'amount', direction: 'desc' }));
    await user.click(screen.getByRole('button', { name: 'Сума' }));
    await waitFor(() => expect(lastFilter()).toMatchObject({ sort: 'amount', direction: 'asc' }));

    await user.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(lastFilter()).toMatchObject({ page: 1 }));

    await user.click(screen.getByLabelText('Період', { selector: 'input' }));
    await user.click(screen.getByRole('option', { name: 'Весь час' }));
    await waitFor(() => expect(lastFilter()).toMatchObject({ page: 0 }));
    expect(lastFilter().from).toBeUndefined();
  });

  it('edits and deletes an operation after confirmation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);
    await screen.findByText(/Знайдено/);
    const rows = screen.getAllByRole('button', { name: 'Дії' });

    await user.click(rows[1]);
    await user.click(screen.getByRole('menuitem', { name: 'Редагувати' }));
    expect(await screen.findByText('Редагувати операцію')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Скасувати' }));

    await user.click(rows[1]);
    await user.click(screen.getByRole('menuitem', { name: 'Видалити' }));
    const dialog = await screen.findByRole('dialog', { name: 'Видалити операцію?' });
    await user.click(within(dialog).getByRole('button', { name: 'Видалити' }));
    await waitFor(() => expect(endpoints.transactionsApi.remove).toHaveBeenCalled());
    expect(endpoints.transactionsApi.remove.mock.calls[0][0]).toBe(101);
  });

  it('opens the form for a new operation and shows an empty result', async () => {
    const user = userEvent.setup();
    endpoints.transactionsApi.search.mockResolvedValue({ ...fx.transactionPage, content: [], totalElements: 0, totalPages: 0 });
    renderWithProviders(<TransactionsPage />);
    expect(await screen.findByText('Нічого не знайдено')).toBeInTheDocument();
    expect(screen.getByText('За цей період операцій немає.')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Додати операцію' })[0]);
    expect(await screen.findByText('Нова операція')).toBeInTheDocument();
    endpoints.transactionsApi.search.mockResolvedValue(fx.transactionPage);
  });
});
