import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../test/apiMock';
import * as fx from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import { TransactionFormModal, type TransactionDefaults } from './TransactionFormModal';
import type { Transaction } from '../api/types';

vi.mock('../api/endpoints', async () => (await import('../test/apiMock')).endpoints);
vi.mock('../auth/AuthContext', () => ({ useCurrency: () => 'UAH' }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

const onClose = vi.fn();

function openForm(props: { transaction?: Transaction; defaults?: TransactionDefaults } = {}) {
  return renderWithProviders(<TransactionFormModal opened onClose={onClose} {...props} />, {
    queryData: [
      [['accounts'], fx.accounts],
      [['categories'], fx.categories],
    ],
  });
}

async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string | RegExp) {
  await user.click(screen.getByLabelText(label, { exact: false, selector: 'input' }));
  await user.click(screen.getByRole('option', { name: option }));
}

describe('TransactionFormModal (REQ-1.1, REQ-1.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates required fields', async () => {
    const user = userEvent.setup();
    openForm();
    await user.click(screen.getByRole('button', { name: 'Додати' }));
    expect(screen.getByText('Вкажіть суму, більшу за нуль')).toBeInTheDocument();
    expect(screen.getByText('Оберіть категорію')).toBeInTheDocument();
    expect(endpoints.transactionsApi.create).not.toHaveBeenCalled();
  });

  it('creates an expense with category, date and note', async () => {
    const user = userEvent.setup();
    openForm();
    await user.type(screen.getByLabelText('Сума', { exact: false }), '150,5');
    await choose(user, 'Категорія', 'Продукти › Супермаркет');
    await user.type(screen.getByLabelText('Нотатка'), 'Хліб і молоко');
    await user.click(screen.getByRole('button', { name: 'Додати' }));

    await waitFor(() => expect(endpoints.transactionsApi.create).toHaveBeenCalled());
    expect(endpoints.transactionsApi.create).toHaveBeenCalledWith({
      type: 'EXPENSE',
      amount: 150.5,
      date: fx.today,
      accountId: 1,
      toAccountId: null,
      categoryId: 11,
      note: 'Хліб і молоко',
      version: undefined,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('offers only income categories for income', async () => {
    const user = userEvent.setup();
    openForm();
    await user.click(screen.getByRole('radio', { name: 'Дохід' }));
    await user.click(screen.getByLabelText('Категорія', { exact: false, selector: 'input' }));
    expect(screen.getByRole('option', { name: 'Зарплата' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Продукти' })).toBeNull();
  });

  it('creates a transfer between own accounts', async () => {
    const user = userEvent.setup();
    openForm({ defaults: { type: 'TRANSFER', accountId: 2 } });
    await user.type(screen.getByLabelText('Сума', { exact: false }), '1000');
    await user.click(screen.getByRole('button', { name: 'Додати' }));
    expect(screen.getByText('Оберіть рахунок зарахування')).toBeInTheDocument();

    await choose(user, 'На рахунок', /^Готівка/);
    await user.click(screen.getByRole('button', { name: 'Додати' }));
    await waitFor(() =>
      expect(endpoints.transactionsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'TRANSFER', amount: 1000, accountId: 2, toAccountId: 1, categoryId: null }),
      ),
    );
  });

  it('creates a recurring operation instead of a single one', async () => {
    const user = userEvent.setup();
    openForm();
    await user.type(screen.getByLabelText('Сума', { exact: false }), '299');
    await choose(user, 'Категорія', 'Комунальні послуги');
    await user.type(screen.getByLabelText('Нотатка'), 'Netflix');
    await user.click(screen.getByLabelText(/Повторювати регулярно/));
    expect(screen.getByText(/автоматично за розкладом/)).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Створювати автоматично/));
    expect(screen.getByText(/FinTrack нагадає про платіж/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Додати' }));

    await waitFor(() => expect(endpoints.recurringApi.create).toHaveBeenCalled());
    await waitFor(() =>
      expect(endpoints.recurringApi.create.mock.calls[0][0]).toEqual({
        name: 'Netflix',
        type: 'EXPENSE',
        amount: 299,
        accountId: 1,
        categoryId: 13,
        note: 'Netflix',
        frequency: 'MONTHLY',
        intervalCount: 1,
        startDate: fx.today,
        autoCreate: false,
      }),
    );
    expect(endpoints.transactionsApi.create).not.toHaveBeenCalled();
  });

  it('edits an existing operation with optimistic locking version', async () => {
    const user = userEvent.setup();
    openForm({ transaction: { ...fx.transactions[1], version: 3 } });
    expect(screen.getByText('Редагувати операцію')).toBeInTheDocument();
    expect(screen.getByLabelText('Сума', { exact: false })).toHaveValue('450,5');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() =>
      expect(endpoints.transactionsApi.update).toHaveBeenCalledWith(101, expect.objectContaining({ amount: 450.5, version: 3 })),
    );
  });

  it('closes on cancel', async () => {
    const user = userEvent.setup();
    openForm();
    await user.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(onClose).toHaveBeenCalled();
  });
});
