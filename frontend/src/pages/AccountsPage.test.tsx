import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../test/apiMock';
import { renderWithProviders } from '../test/render';
import AccountsPage from './AccountsPage';

vi.mock('../api/endpoints', async () => (await import('../test/apiMock')).endpoints);
vi.mock('../auth/AuthContext', () => ({ useCurrency: () => 'UAH' }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

const menu = async (user: ReturnType<typeof userEvent.setup>, index: number, item: string) => {
  await user.click(screen.getAllByRole('button', { name: 'Дії з рахунком' })[index]);
  await user.click(screen.getByRole('menuitem', { name: item }));
};

describe('AccountsPage (REQ-1.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows active and archived accounts with balances', async () => {
    renderWithProviders(<AccountsPage />);
    expect(await screen.findByText(/Загальний баланс активних рахунків: 33\s500,50/)).toBeInTheDocument();
    expect(screen.getByText('Архів')).toBeInTheDocument();
    expect(screen.getByText('Стара картка')).toBeInTheDocument();
    expect(screen.getByText(/^32\s000,50\s₴$/)).toBeInTheDocument();
  });

  it('creates a savings account', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountsPage />);
    await user.click(await screen.findByRole('button', { name: 'Новий рахунок' }));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(screen.getByText('Вкажіть назву')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Назва', { exact: false }), 'Скарбничка');
    await user.click(screen.getByLabelText('Тип', { selector: 'input' }));
    await user.click(screen.getByRole('option', { name: 'Накопичення' }));
    await user.clear(screen.getByLabelText('Початковий баланс'));
    await user.type(screen.getByLabelText('Початковий баланс'), '1000');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(endpoints.accountsApi.create).toHaveBeenCalled());
    expect(endpoints.accountsApi.create.mock.calls[0][0]).toEqual({
      name: 'Скарбничка',
      type: 'SAVINGS',
      initialBalance: 1000,
      color: '#1971c2',
      archived: false,
      version: undefined,
    });
  });

  it('edits, archives, restores and deletes accounts', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountsPage />);
    await screen.findByText('Стара картка');

    await menu(user, 1, 'Редагувати');
    expect(screen.getByText('Редагувати рахунок')).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Архівний рахунок/));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(endpoints.accountsApi.update).toHaveBeenCalled());
    expect(endpoints.accountsApi.update.mock.calls[0]).toEqual([2, expect.objectContaining({ archived: true, version: 3 })]);

    await menu(user, 0, 'Архівувати');
    await waitFor(() => expect(endpoints.accountsApi.update).toHaveBeenCalledTimes(2));
    expect(endpoints.accountsApi.update.mock.calls[1]).toEqual([1, expect.objectContaining({ archived: true, version: 0 })]);

    await menu(user, 2, 'Повернути з архіву');
    await waitFor(() => expect(endpoints.accountsApi.update).toHaveBeenCalledTimes(3));
    expect(endpoints.accountsApi.update.mock.calls[2][1]).toMatchObject({ archived: false, version: 1 });

    await menu(user, 0, 'Видалити');
    const dialog = await screen.findByRole('dialog', { name: 'Видалити рахунок «Готівка»?' });
    await user.click(within(dialog).getByRole('button', { name: 'Видалити' }));
    await waitFor(() => expect(endpoints.accountsApi.remove).toHaveBeenCalled());
    expect(endpoints.accountsApi.remove.mock.calls[0][0]).toBe(1);
  });

  it('starts a transfer between accounts', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountsPage />);
    await screen.findByText('Стара картка');
    await menu(user, 0, 'Переказати з рахунку');
    expect(await screen.findByText('Нова операція')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Переказ' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Скасувати' }));
    await user.click(screen.getByRole('button', { name: 'Переказ' }));
    expect(await screen.findByText('Нова операція')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    endpoints.accountsApi.list.mockResolvedValueOnce([]);
    renderWithProviders(<AccountsPage />);
    expect(await screen.findByText('Рахунків ще немає')).toBeInTheDocument();
  });
});
