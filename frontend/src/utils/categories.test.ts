import { describe, expect, it } from 'vitest';
import type { Category } from '../api/types';
import { categoryLabel, categoryOptions } from './categories';

const category = (id: number, name: string, parentId: number | null = null, type: Category['type'] = 'EXPENSE'): Category => ({
  id,
  name,
  parentId,
  type,
  icon: 'dots',
  color: '#868e96',
  version: 0,
});

const categories = [
  category(1, 'Транспорт'),
  category(2, 'Таксі', 1),
  category(3, 'Пальне', 1),
  category(4, 'Продукти'),
  category(5, 'Зарплата', null, 'INCOME'),
];

describe('category helpers (REQ-2.1)', () => {
  it('lists subcategories right after their parent', () => {
    expect(categoryOptions(categories, 'EXPENSE').map((o) => o.label)).toEqual([
      'Продукти',
      'Транспорт',
      'Транспорт › Пальне',
      'Транспорт › Таксі',
    ]);
  });

  it('filters by type', () => {
    expect(categoryOptions(categories, 'INCOME')).toEqual([{ value: '5', label: 'Зарплата' }]);
  });

  it('builds a readable label', () => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    expect(categoryLabel(byId, 2)).toBe('Транспорт › Таксі');
    expect(categoryLabel(byId, null)).toBe('Без категорії');
  });
});
