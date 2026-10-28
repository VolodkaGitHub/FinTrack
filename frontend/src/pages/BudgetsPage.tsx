import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  Progress,
  SegmentedControl,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { IconArrowForward, IconDots, IconEdit, IconPigMoney, IconPlus, IconRotate, IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { budgetsApi } from '../api/endpoints';
import { useBudgets, useEntityMutation, useLookups } from '../api/hooks';
import type { BudgetInput, BudgetStatus } from '../api/types';
import { useCurrency } from '../auth/AuthContext';
import { CategoryIcon } from '../components/CategoryIcon';
import { EmptyState, PageHeader, SectionLoader } from '../components/common';
import { categoryOptions } from '../utils/categories';
import { formatMonth, formatMoney } from '../utils/format';

const STATE = {
  OK: { color: 'teal', label: 'У межах бюджету' },
  WARNING: { color: 'orange', label: 'Наближається до ліміту' },
  EXCEEDED: { color: 'red', label: 'Перевищено' },
} as const;

/** REQ-2.2 / 2.3 / 2.4: місячні бюджети категорій з залишком у реальному часі, порогом сповіщення і перенесенням залишку. */
export default function BudgetsPage() {
  const currency = useCurrency();
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const { data: budgets, isLoading } = useBudgets(month);
  const { categoryById } = useLookups();
  const [editing, setEditing] = useState<BudgetStatus | null>(null);
  const [creating, setCreating] = useState(false);
  const remove = useEntityMutation('budgets', (id: number) => budgetsApi.remove(id), { success: 'Бюджет видалено' });
  const isCurrentMonth = month === dayjs().format('YYYY-MM');

  const totals = (budgets ?? []).reduce(
    (acc, b) => ({ available: acc.available + b.available, spent: acc.spent + b.spent }),
    { available: 0, spent: 0 },
  );
  const totalPercent = totals.available > 0 ? (totals.spent / totals.available) * 100 : 0;

  const confirmDelete = (budget: BudgetStatus) =>
    modals.openConfirmModal({
      title: `Видалити бюджет «${categoryById.get(budget.categoryId)?.name ?? ''}»?`,
      children: <Text size="sm">Історія витрат залишиться, буде видалено лише ліміт.</Text>,
      labels: { confirm: 'Видалити', cancel: 'Скасувати' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(budget.id),
    });

  return (
    <>
      <PageHeader
        title="Бюджети"
        description="Місячні ліміти витрат за категоріями"
        actions={
          <>
            <MonthPickerInput
              aria-label="Місяць"
              value={`${month}-01`}
              onChange={(value) => value && setMonth(dayjs(value).format('YYYY-MM'))}
              valueFormat="MMMM YYYY"
              w={180}
            />
            <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
              Новий бюджет
            </Button>
          </>
        }
      />

      {isLoading ? (
        <SectionLoader />
      ) : !budgets?.length ? (
        <EmptyState
          icon={IconPigMoney}
          title={`Бюджетів на ${formatMonth(month).toLowerCase()} немає`}
          description="Встановіть ліміт для категорії — FinTrack показуватиме залишок і попередить, коли витрати наблизяться до межі."
          action={
            <Button variant="light" size="xs" onClick={() => setCreating(true)}>
              Створити бюджет
            </Button>
          }
        />
      ) : (
        <Stack gap="lg">
          <Paper withBorder radius="md" p="md">
            <Group justify="space-between" mb="xs" wrap="wrap">
              <Text fw={600}>Загалом за {formatMonth(month).toLowerCase()}</Text>
              <Text size="sm">
                Витрачено <b>{formatMoney(totals.spent, currency)}</b> з {formatMoney(totals.available, currency)} · залишок{' '}
                <Text span fw={700} c={totals.available - totals.spent < 0 ? 'red' : 'teal'}>
                  {formatMoney(totals.available - totals.spent, currency)}
                </Text>
              </Text>
            </Group>
            <Progress value={Math.min(totalPercent, 100)} color={totalPercent > 100 ? 'red' : totalPercent >= 80 ? 'orange' : 'teal'} size="lg" radius="xl" />
          </Paper>

          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {budgets.map((budget) => {
              const category = categoryById.get(budget.categoryId);
              const state = STATE[budget.state];
              return (
                <Paper key={budget.id} withBorder radius="md" p="md">
                  <Group justify="space-between" wrap="nowrap" mb="sm">
                    <Group gap="sm" wrap="nowrap">
                      <CategoryIcon icon={category?.icon} color={category?.color} size={38} />
                      <div>
                        <Text fw={600}>{category?.name ?? 'Категорія'}</Text>
                        <Badge size="xs" variant="light" color={state.color}>
                          {state.label}
                        </Badge>
                      </div>
                    </Group>
                    <Menu position="bottom-end">
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" aria-label="Дії з бюджетом">
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconEdit size={15} />} onClick={() => setEditing(budget)}>
                          Редагувати
                        </Menu.Item>
                        <Menu.Item color="red" leftSection={<IconTrash size={15} />} onClick={() => confirmDelete(budget)}>
                          Видалити
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                  <Progress.Root size={14} radius="xl">
                    <Tooltip label={`${budget.percent.toFixed(1)}% використано`} withArrow>
                      <Progress.Section value={Math.min(budget.percent, 100)} color={state.color} />
                    </Tooltip>
                  </Progress.Root>
                  <Group justify="space-between" mt="xs" wrap="wrap">
                    <Text size="sm">
                      {formatMoney(budget.spent, currency)}{' '}
                      <Text span c="dimmed">
                        з {formatMoney(budget.available, currency)}
                      </Text>
                    </Text>
                    <Text size="sm" fw={600} c={budget.remaining < 0 ? 'red' : 'teal'}>
                      {budget.remaining < 0
                        ? `Перевищено на ${formatMoney(-budget.remaining, currency)}`
                        : `Залишок ${formatMoney(budget.remaining, currency)}`}
                    </Text>
                  </Group>
                  <Group gap={6} mt="sm">
                    <Badge variant="outline" color="gray" size="sm">
                      ліміт {formatMoney(budget.limit, currency)}
                    </Badge>
                    {budget.carriedOver > 0 && (
                      <Badge variant="light" color="grape" size="sm" leftSection={<IconArrowForward size={12} />}>
                        +{formatMoney(budget.carriedOver, currency)} перенесено
                      </Badge>
                    )}
                    <Badge variant="light" color={budget.rollover ? 'grape' : 'gray'} size="sm" leftSection={budget.rollover ? <IconArrowForward size={12} /> : <IconRotate size={12} />}>
                      {budget.rollover ? 'залишок переноситься' : 'скидається щомісяця'}
                    </Badge>
                    <Badge variant="light" color="orange" size="sm">
                      сповіщення з {budget.alertThreshold}%
                    </Badge>
                  </Group>
                </Paper>
              );
            })}
          </SimpleGrid>
          {!isCurrentMonth && (
            <Text size="xs" c="dimmed">
              Для минулих місяців показано фактичний стан на кінець періоду; зміни ліміту діють з поточного місяця.
            </Text>
          )}
        </Stack>
      )}

      <Modal
        opened={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? 'Редагувати бюджет' : 'Новий бюджет'}
        centered
      >
        {(creating || editing) && (
          <BudgetForm
            budget={editing}
            usedCategoryIds={(budgets ?? []).map((b) => b.categoryId)}
            onDone={() => {
              setCreating(false);
              setEditing(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}

function BudgetForm({ budget, usedCategoryIds, onDone }: { budget: BudgetStatus | null; usedCategoryIds: number[]; onDone: () => void }) {
  const { categories } = useLookups();
  const form = useForm({
    initialValues: {
      categoryId: budget ? String(budget.categoryId) : '',
      amount: (budget?.amount ?? '') as number | string,
      rollover: budget?.rollover ? 'rollover' : 'reset',
      alertThreshold: budget?.alertThreshold ?? 80,
    },
    validate: {
      categoryId: (value) => (value ? null : 'Оберіть категорію'),
      amount: (value) => (Number(value) > 0 ? null : 'Вкажіть суму, більшу за нуль'),
    },
  });
  const save = useEntityMutation(
    'budgets',
    (input: BudgetInput) => (budget ? budgetsApi.update(budget.id, input) : budgetsApi.create(input)),
    { success: budget ? 'Бюджет оновлено' : 'Бюджет створено', onSuccess: onDone },
  );
  const options = categoryOptions(categories, 'EXPENSE').filter(
    (o) => !usedCategoryIds.includes(Number(o.value)) || o.value === String(budget?.categoryId),
  );

  return (
    <form
      onSubmit={form.onSubmit((values) =>
        save.mutate({
          categoryId: Number(values.categoryId),
          amount: Number(values.amount),
          rollover: values.rollover === 'rollover',
          alertThreshold: values.alertThreshold,
          version: budget?.version,
        }),
      )}
    >
      <Stack>
        <Select
          label="Категорія витрат"
          description="Враховуються також витрати в підкатегоріях"
          data={options}
          searchable
          withAsterisk
          {...form.getInputProps('categoryId')}
        />
        <NumberInput label="Ліміт на місяць" min={0} decimalScale={2} thousandSeparator=" " decimalSeparator="," hideControls withAsterisk {...form.getInputProps('amount')} />
        <div>
          <Text size="sm" fw={500} mb={6}>
            Невикористаний залишок на початку нового місяця
          </Text>
          <SegmentedControl
            fullWidth
            data={[
              { value: 'reset', label: 'Скидати' },
              { value: 'rollover', label: 'Переносити' },
            ]}
            {...form.getInputProps('rollover')}
          />
          <Text size="xs" c="dimmed" mt={6}>
            {form.values.rollover === 'rollover'
              ? 'Залишок цього місяця додасться до ліміту наступного.'
              : 'Кожного місяця бюджет починається з повного ліміту.'}
          </Text>
        </div>
        <div>
          <Text size="sm" fw={500}>
            Попередити, коли витрачено {form.values.alertThreshold}%
          </Text>
          <Slider
            min={50}
            max={100}
            step={5}
            marks={[{ value: 50, label: '50%' }, { value: 75, label: '75%' }, { value: 100, label: '100%' }]}
            mb="lg"
            mt={6}
            {...form.getInputProps('alertThreshold')}
          />
        </div>
        <Group justify="flex-end" mt="sm">
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
