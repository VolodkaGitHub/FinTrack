import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../test/apiMock';
import { renderWithProviders } from '../test/render';
import CategoriesPage from './CategoriesPage';

vi.mock('../api/endpoints', async () => (await import('../test/apiMock')).endpoints);
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

describe('CategoriesPage (REQ-2.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows expense and income categories with subcategories', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategoriesPage />);
    expect(await screen.findByText('Супермаркет')).toBeInTheDocument();
    expect(screen.getByText('1 підкатегорій')).toBeInTheDocument();
    expect(screen.getAllByText('без підкатегорій')).toHaveLength(2);
    expect(screen.queryByText('Зарплата')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Доходи' }));
    expect(screen.getByText('Зарплата')).toBeInTheDocument();
    expect(screen.queryByText('Продукти')).toBeNull();
  });

  it('creates a category with an icon and a subcategory inheriting its look', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategoriesPage />);
    await screen.findByText('Супермаркет');

    await user.click(screen.getByRole('button', { name: 'Нова категорія' }));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(screen.getByText('Вкажіть назву')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Назва', { exact: false }), 'Спорт');
    await user.click(screen.getByRole('button', { name: 'barbell' }));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(endpoints.categoriesApi.create).toHaveBeenCalled());
    expect(endpoints.categoriesApi.create.mock.calls[0][0]).toEqual({
      name: 'Спорт',
      type: 'EXPENSE',
      parentId: null,
      icon: 'barbell',
      color: '#0ca678',
      version: undefined,
    });

    // «Продукти» — третя категорія верхнього рівня за алфавітом
    await user.click(screen.getAllByRole('button', { name: 'Додати підкатегорію' })[2]);
    expect(screen.getByLabelText('Батьківська категорія', { selector: 'input' })).toHaveValue('Продукти');
    await user.type(screen.getByLabelText('Назва', { exact: false }), 'Ринок');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(endpoints.categoriesApi.create).toHaveBeenCalledTimes(2));
    expect(endpoints.categoriesApi.create.mock.calls[1][0]).toMatchObject({
      name: 'Ринок',
      parentId: 10,
      icon: 'shopping-cart',
      color: '#2f9e44',
    });
  });

  it('edits a parent category and deletes a category after confirmation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategoriesPage />);
    await screen.findByText('Супермаркет');

    await user.click(screen.getAllByRole('button', { name: 'Редагувати' })[2]);
    expect(screen.getByText('Редагувати категорію')).toBeInTheDocument();
    expect(screen.getByText('Категорія має підкатегорії, тому залишається верхнього рівня')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(endpoints.categoriesApi.update).toHaveBeenCalled());
    expect(endpoints.categoriesApi.update.mock.calls[0][0]).toBe(10);

    await user.click(screen.getAllByRole('button', { name: 'Видалити' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Видалити категорію «Кафе та ресторани»?' });
    await user.click(within(dialog).getByRole('button', { name: 'Видалити' }));
    await waitFor(() => expect(endpoints.categoriesApi.remove).toHaveBeenCalled());
    expect(endpoints.categoriesApi.remove.mock.calls[0][0]).toBe(12);
  });
});
