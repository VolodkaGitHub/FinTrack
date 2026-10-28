import {
  ActionIcon,
  Button,
  ColorInput,
  Group,
  Input,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { categoriesApi } from '../api/endpoints';
import { useCategories, useEntityMutation } from '../api/hooks';
import type { Category, CategoryInput, CategoryType } from '../api/types';
import { CategoryIcon } from '../components/CategoryIcon';
import { PageHeader, SectionLoader } from '../components/common';
import { CATEGORY_ICONS, PALETTE } from '../components/icons';
import { categoryTree } from '../utils/categories';

interface Editing {
  category: Category | null;
  type: CategoryType;
  parentId: number | null;
}

/** REQ-2.1: власні категорії та підкатегорії доходів і витрат з іконками та кольорами. */
export default function CategoriesPage() {
  const { data: categories, isLoading } = useCategories();
  const [tab, setTab] = useState<CategoryType>('EXPENSE');
  const [editing, setEditing] = useState<Editing | null>(null);
  const remove = useEntityMutation('categories', (id: number) => categoriesApi.remove(id), { success: 'Категорію видалено' });

  const confirmDelete = (category: Category) =>
    modals.openConfirmModal({
      title: `Видалити категорію «${category.name}»?`,
      children: (
        <Text size="sm">Категорію, яка використовується в операціях, бюджетах чи регулярних платежах, видалити не можна.</Text>
      ),
      labels: { confirm: 'Видалити', cancel: 'Скасувати' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(category.id),
    });

  const actions = (category: Category) => (
    <Group gap={2} wrap="nowrap">
      <Tooltip label="Редагувати" withArrow>
        <ActionIcon variant="subtle" color="gray" onClick={() => setEditing({ category, type: category.type, parentId: category.parentId })} aria-label="Редагувати">
          <IconEdit size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Видалити" withArrow>
        <ActionIcon variant="subtle" color="red" onClick={() => confirmDelete(category)} aria-label="Видалити">
          <IconTrash size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );

  const tree = categoryTree(categories ?? [], tab);

  return (
    <>
      <PageHeader
        title="Категорії"
        description="Групуйте операції за власними категоріями та підкатегоріями"
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing({ category: null, type: tab, parentId: null })}>
            Нова категорія
          </Button>
        }
      />
      <Tabs value={tab} onChange={(value) => setTab((value as CategoryType) ?? 'EXPENSE')} mb="md">
        <Tabs.List>
          <Tabs.Tab value="EXPENSE">Витрати</Tabs.Tab>
          <Tabs.Tab value="INCOME">Доходи</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      {isLoading ? (
        <SectionLoader />
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          {tree.map(({ parent, children }) => (
            <Paper key={parent.id} withBorder radius="md" p="md">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap">
                  <CategoryIcon icon={parent.icon} color={parent.color} size={38} />
                  <div>
                    <Text fw={600}>{parent.name}</Text>
                    <Text size="xs" c="dimmed">
                      {children.length ? `${children.length} підкатегорій` : 'без підкатегорій'}
                    </Text>
                  </div>
                </Group>
                <Group gap={2} wrap="nowrap">
                  <Tooltip label="Додати підкатегорію" withArrow>
                    <ActionIcon variant="subtle" onClick={() => setEditing({ category: null, type: tab, parentId: parent.id })} aria-label="Додати підкатегорію">
                      <IconPlus size={16} />
                    </ActionIcon>
                  </Tooltip>
                  {actions(parent)}
                </Group>
              </Group>
              {children.length > 0 && (
                <Stack gap={6} mt="sm" pl={48}>
                  {children.map((child) => (
                    <Group key={child.id} justify="space-between" wrap="nowrap">
                      <Group gap="xs" wrap="nowrap">
                        <CategoryIcon icon={child.icon} color={child.color} size={24} />
                        <Text size="sm">{child.name}</Text>
                      </Group>
                      {actions(child)}
                    </Group>
                  ))}
                </Stack>
              )}
            </Paper>
          ))}
        </SimpleGrid>
      )}
      <Modal opened={editing !== null} onClose={() => setEditing(null)} title={editing?.category ? 'Редагувати категорію' : 'Нова категорія'} centered>
        {editing && <CategoryForm editing={editing} categories={categories ?? []} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function CategoryForm({ editing, categories, onDone }: { editing: Editing; categories: Category[]; onDone: () => void }) {
  const { category } = editing;
  const parent = editing.parentId != null ? categories.find((c) => c.id === editing.parentId) : undefined;
  const form = useForm({
    initialValues: {
      name: category?.name ?? '',
      parentId: editing.parentId != null ? String(editing.parentId) : (null as string | null),
      icon: category?.icon ?? parent?.icon ?? 'dots',
      color: category?.color ?? parent?.color ?? PALETTE[1],
    },
    validate: {
      name: (value) => (value.trim() ? null : 'Вкажіть назву'),
      color: (value) => (/^#[0-9a-fA-F]{6}$/.test(value) ? null : 'Колір у форматі #RRGGBB'),
    },
  });
  const save = useEntityMutation(
    'categories',
    (input: CategoryInput) => (category ? categoriesApi.update(category.id, input) : categoriesApi.create(input)),
    { success: category ? 'Категорію оновлено' : 'Категорію створено', onSuccess: onDone },
  );
  const hasChildren = category ? categories.some((c) => c.parentId === category.id) : false;
  const parentOptions = categories
    .filter((c) => c.type === editing.type && c.parentId === null && c.id !== category?.id)
    .map((c) => ({ value: String(c.id), label: c.name }));

  return (
    <form
      onSubmit={form.onSubmit((values) =>
        save.mutate({
          name: values.name.trim(),
          type: editing.type,
          parentId: values.parentId ? Number(values.parentId) : null,
          icon: values.icon,
          color: values.color,
          version: category?.version,
        }),
      )}
    >
      <Stack>
        <Group gap="sm" wrap="nowrap" align="flex-end">
          <CategoryIcon icon={form.values.icon} color={form.values.color} size={44} />
          <TextInput label="Назва" placeholder="Наприклад: Кава" data-autofocus withAsterisk style={{ flex: 1 }} {...form.getInputProps('name')} />
        </Group>
        <Select
          label="Батьківська категорія"
          placeholder="Немає (категорія верхнього рівня)"
          data={parentOptions}
          clearable
          disabled={hasChildren}
          description={hasChildren ? 'Категорія має підкатегорії, тому залишається верхнього рівня' : undefined}
          {...form.getInputProps('parentId')}
        />
        <Input.Wrapper label="Іконка">
          <SimpleGrid cols={8} spacing={6} mt={4}>
            {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
              <ActionIcon
                key={key}
                size="lg"
                variant={form.values.icon === key ? 'filled' : 'default'}
                color={form.values.icon === key ? form.values.color : undefined}
                onClick={() => form.setFieldValue('icon', key)}
                aria-label={key}
              >
                <Icon size={18} />
              </ActionIcon>
            ))}
          </SimpleGrid>
        </Input.Wrapper>
        <ColorInput label="Колір" swatches={PALETTE} swatchesPerRow={8} format="hex" {...form.getInputProps('color')} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Скасувати
          </Button>
          <Button type="submit" loading={save.isPending}>
            Зберегти
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
