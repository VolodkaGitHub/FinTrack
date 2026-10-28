import type { Category, CategoryType } from '../api/types';

const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'uk');

/** Опції для Select: батьківська категорія, а під нею її підкатегорії («Транспорт › Таксі»). */
export function categoryOptions(categories: Category[], type?: CategoryType): { value: string; label: string }[] {
  const filtered = categories.filter((c) => !type || c.type === type);
  const result: { value: string; label: string }[] = [];
  for (const parent of filtered.filter((c) => c.parentId === null).sort(byName)) {
    result.push({ value: String(parent.id), label: parent.name });
    for (const child of filtered.filter((c) => c.parentId === parent.id).sort(byName)) {
      result.push({ value: String(child.id), label: `${parent.name} › ${child.name}` });
    }
  }
  return result;
}

export function categoryLabel(categoryById: Map<number, Category>, id: number | null | undefined): string {
  if (id == null) {
    return 'Без категорії';
  }
  const category = categoryById.get(id);
  if (!category) {
    return 'Категорію видалено';
  }
  const parent = category.parentId != null ? categoryById.get(category.parentId) : undefined;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

export function categoryTree(categories: Category[], type: CategoryType) {
  const filtered = categories.filter((c) => c.type === type);
  return filtered
    .filter((c) => c.parentId === null)
    .sort(byName)
    .map((parent) => ({ parent, children: filtered.filter((c) => c.parentId === parent.id).sort(byName) }));
}
