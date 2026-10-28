import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../test/apiMock';
import * as fx from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import RecurringPage from './RecurringPage';

vi.mock('../api/endpoints', async () => (await import('../test/apiMock')).endpoints);
vi.mock('../auth/AuthContext', () => ({ useCurrency: () => 'UAH' }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

const rowMenu = async (user: ReturnType<typeof userEvent.setup>, index: number, item: string) => {
  await user.click(screen.getAllByRole('button', { name: 'Дії' })[index]);
  await user.click(screen.getByRole('menuitem', { name: item }));
};

describe('RecurringPage (REQ-1.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows schedule, state and monthly obligatory spending', async () => {
    renderWithProviders(<RecurringPage />);
    expect(await screen.findByText(/Обов’язкові витрати ≈ −2\s099,00\s₴ на місяць/)).toBeInTheDocument();
    expect(screen.getByText('Кожні 2 тижні')).toBeInTheDocument();
    expect(screen.getAllByText('Щомісяця')).toHaveLength(2);
    expect(screen.getByText('до 31.12.2030')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`прострочено · ${dayjs().subtract(2, 'day').format('DD.MM.YYYY')}`))).toBeInTheDocument();
    expect(screen.getByText('призупинено')).toBeInTheDocument();
    expect(screen.getAllByText('нагадування')).toHaveLength(2);
    expect(screen.getByText('автоматично')).toBeInTheDocument();
  });

  it('adds a payment now, skips, pauses, resumes and deletes templates', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecurringPage />);
    await screen.findByText('Комуналка');

    await user.click(screen.getAllByRole('button', { name: 'Додати зараз' })[1]);
    await waitFor(() => expect(endpoints.recurringApi.apply).toHaveBeenCalled());
    expect(endpoints.recurringApi.apply.mock.calls[0][0]).toBe(301);

    await rowMenu(user, 1, 'Пропустити цей платіж');
    await waitFor(() => expect(endpoints.recurringApi.skip).toHaveBeenCalled());
    expect(endpoints.recurringApi.skip.mock.calls[0][0]).toBe(301);

    await rowMenu(user, 0, 'Призупинити');
    await waitFor(() => expect(endpoints.recurringApi.update).toHaveBeenCalled());
    expect(endpoints.recurringApi.update.mock.calls[0][0]).toBe(300);
    expect(endpoints.recurringApi.update.mock.calls[0][1]).toMatchObject({ active: false, version: 1 });

    await rowMenu(user, 2, 'Відновити');
    await waitFor(() => expect(endpoints.recurringApi.update).toHaveBeenCalledTimes(2));
    expect(endpoints.recurringApi.update.mock.calls[1][1]).toMatchObject({ active: true, type: 'INCOME', intervalCount: 2 });

    await rowMenu(user, 0, 'Видалити');
    const dialog = await screen.findByRole('dialog', { name: 'Видалити «Netflix»?' });
    await user.click(within(dialog).getByRole('button', { name: 'Видалити' }));
    await waitFor(() => expect(endpoints.recurringApi.remove).toHaveBeenCalled());
  });

  it('creates a recurring income on a custom schedule', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecurringPage />, {
      queryData: [
        [['accounts'], fx.accounts],
        [['categories'], fx.categories],
      ],
    });
    await user.click(await screen.findByRole('button', { name: 'Новий регулярний платіж' }));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(screen.getByText('Вкажіть назву')).toBeInTheDocument();
    expect(screen.getByText('Оберіть категорію')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Регулярний дохід' }));
    await user.type(screen.getByLabelText('Назва', { exact: false }), 'Зарплата');
    await user.type(screen.getByLabelText('Сума', { exact: false }), '30000');
    await user.click(screen.getByLabelText('Категорія', { exact: false, selector: 'input' }));
    await user.click(screen.getByRole('option', { name: 'Зарплата' }));
    await user.click(screen.getByLabelText('Періодичність', { selector: 'input' }));
    await user.click(screen.getByRole('option', { name: 'Щотижня' }));
    await user.clear(screen.getByLabelText('Інтервал'));
    await user.type(screen.getByLabelText('Інтервал'), '2');
    await user.click(screen.getByLabelText(/Створювати операції автоматично/));
    expect(screen.getByText(/FinTrack надішле нагадування/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(endpoints.recurringApi.create).toHaveBeenCalled());
    expect(endpoints.recurringApi.create.mock.calls[0][0]).toMatchObject({
      name: 'Зарплата',
      type: 'INCOME',
      amount: 30000,
      accountId: 1,
      categoryId: 20,
      frequency: 'WEEKLY',
      intervalCount: 2,
      startDate: fx.today,
      autoCreate: false,
    });
  });

  it('edits an existing template', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecurringPage />);
    await screen.findByText('Netflix');
    await rowMenu(user, 0, 'Редагувати');
    expect(screen.getByText('Редагувати регулярну операцію')).toBeInTheDocument();
    expect(screen.getByLabelText('Назва', { exact: false })).toHaveValue('Netflix');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(endpoints.recurringApi.update).toHaveBeenCalled());
    expect(endpoints.recurringApi.update.mock.calls[0][0]).toBe(300);
  });

  it('shows an empty state', async () => {
    endpoints.recurringApi.list.mockResolvedValueOnce([]);
    renderWithProviders(<RecurringPage />);
    expect(await screen.findByText('Регулярних операцій немає')).toBeInTheDocument();
  });
});
