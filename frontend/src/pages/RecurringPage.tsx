import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { IconBolt, IconDots, IconEdit, IconPlayerPause, IconPlayerPlay, IconPlayerSkipForward, IconPlus, IconRepeat, IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { recurringApi } from '../api/endpoints';
import { useEntityMutation, useLookups, useRecurring } from '../api/hooks';
import type { Frequency, Recurring, RecurringInput } from '../api/types';
import { useCurrency } from '../auth/AuthContext';
import { CategoryIcon } from '../components/CategoryIcon';
import { EmptyState, PageHeader, SectionLoader } from '../components/common';
import { categoryLabel, categoryOptions } from '../utils/categories';
import { formatDate, formatSigned, frequencyLabel } from '../utils/format';

const toInput = (r: Recurring, patch: Partial<RecurringInput> = {}): RecurringInput => ({
  name: r.name,
  type: r.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
  amount: r.amount,
  accountId: r.accountId,
  categoryId: r.categoryId,
  note: r.note,
  frequency: r.frequency,
  intervalCount: r.intervalCount,
  startDate: r.startDate,
  endDate: r.endDate,
  autoCreate: r.autoCreate,
  active: r.active,
  version: r.version,
  ...patch,
});

/** REQ-1.3: регулярні операції — підписки, комунальні платежі, зарплата. */
export default function RecurringPage() {
  const currency = useCurrency();
  const { data, isLoading } = useRecurring();
  const { accountById, categoryById } = useLookups();
  const [editing, setEditing] = useState<Recurring | null>(null);
  const [creating, setCreating] = useState(false);

  const apply = useEntityMutation('recurring', (id: number) => recurringApi.apply(id), { success: 'Операцію записано' });
  const skip = useEntityMutation('recurring', (id: number) => recurringApi.skip(id), { success: 'Платіж пропущено' });
  const update = useEntityMutation('recurring', ({ id, input }: { id: number; input: RecurringInput }) => recurringApi.update(id, input));
  const remove = useEntityMutation('recurring', (id: number) => recurringApi.remove(id), { success: 'Регулярну операцію видалено' });

  const today = dayjs().format('YYYY-MM-DD');
  const monthlyExpense = (data ?? [])
    .filter((r) => r.active && r.type === 'EXPENSE')
    .reduce((sum, r) => sum + r.amount * monthlyFactor(r.frequency, r.intervalCount), 0);

  const confirmDelete = (r: Recurring) =>
    modals.openConfirmModal({
      title: `Видалити «${r.name}»?`,
      children: <Text size="sm">Уже створені операції залишаться в історії.</Text>,
      labels: { confirm: 'Видалити', cancel: 'Скасувати' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(r.id),
    });

  return (
    <>
      <PageHeader
        title="Регулярні платежі"
        description={`Обов’язкові витрати ≈ ${formatSigned(monthlyExpense, 'EXPENSE', currency)} на місяць`}
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
            Новий регулярний платіж
          </Button>
        }
      />
      {isLoading ? (
        <SectionLoader />
      ) : !data?.length ? (
        <EmptyState
          icon={IconRepeat}
          title="Регулярних операцій немає"
          description="Додайте підписки, комунальні платежі чи зарплату — FinTrack записуватиме їх автоматично або нагадуватиме про оплату."
          action={
            <Button variant="light" size="xs" onClick={() => setCreating(true)}>
              Додати
            </Button>
          }
        />
      ) : (
        <Paper withBorder radius="md">
          <Table.ScrollContainer minWidth={820}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Назва</Table.Th>
                  <Table.Th>Періодичність</Table.Th>
                  <Table.Th>Наступна дата</Table.Th>
                  <Table.Th>Режим</Table.Th>
                  <Table.Th ta="right">Сума</Table.Th>
                  <Table.Th w={170} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.map((r) => {
                  const category = categoryById.get(r.categoryId);
                  const overdue = r.active && r.nextDate < today;
                  const dueToday = r.active && r.nextDate === today;
                  return (
                    <Table.Tr key={r.id} style={{ opacity: r.active ? 1 : 0.55 }}>
                      <Table.Td>
                        <Group gap="sm" wrap="nowrap">
                          <CategoryIcon icon={category?.icon} color={category?.color} size={32} />
                          <div>
                            <Text size="sm" fw={600}>
                              {r.name}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {categoryLabel(categoryById, r.categoryId)} · {accountById.get(r.accountId)?.name}
                            </Text>
                          </div>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{frequencyLabel(r.frequency, r.intervalCount)}</Text>
                        {r.endDate && (
                          <Text size="xs" c="dimmed">
                            до {formatDate(r.endDate)}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {!r.active ? (
                          <Badge color="gray" variant="light">
                            призупинено
                          </Badge>
                        ) : overdue ? (
                          <Badge color="red" variant="light">
                            прострочено · {formatDate(r.nextDate)}
                          </Badge>
                        ) : dueToday ? (
                          <Badge color="orange" variant="light">
                            сьогодні
                          </Badge>
                        ) : (
                          <Text size="sm">{formatDate(r.nextDate)}</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={r.autoCreate ? 'blue' : 'grape'}>
                          {r.autoCreate ? 'автоматично' : 'нагадування'}
                        </Badge>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" fw={600} c={r.type === 'INCOME' ? 'teal.7' : 'red.7'}>
                          {formatSigned(r.amount, r.type, currency)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                          <Button
                            size="compact-sm"
                            variant={r.due ? 'filled' : 'light'}
                            leftSection={<IconBolt size={14} />}
                            loading={apply.isPending && apply.variables === r.id}
                            onClick={() => apply.mutate(r.id)}
                          >
                            Додати зараз
                          </Button>
                          <Menu position="bottom-end">
                            <Menu.Target>
                              <ActionIcon variant="subtle" color="gray" aria-label="Дії">
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item leftSection={<IconPlayerSkipForward size={15} />} onClick={() => skip.mutate(r.id)} disabled={!r.active}>
                                Пропустити цей платіж
                              </Menu.Item>
                              <Menu.Item leftSection={<IconEdit size={15} />} onClick={() => setEditing(r)}>
                                Редагувати
                              </Menu.Item>
                              <Menu.Item
                                leftSection={r.active ? <IconPlayerPause size={15} /> : <IconPlayerPlay size={15} />}
                                onClick={() => update.mutate({ id: r.id, input: toInput(r, { active: !r.active }) })}
                              >
                                {r.active ? 'Призупинити' : 'Відновити'}
                              </Menu.Item>
                              <Menu.Item color="red" leftSection={<IconTrash size={15} />} onClick={() => confirmDelete(r)}>
                                Видалити
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
      <Modal
        opened={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? 'Редагувати регулярну операцію' : 'Нова регулярна операція'}
        size="lg"
        centered
      >
        {(creating || editing) && (
          <RecurringForm
            recurring={editing}
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

function monthlyFactor(frequency: Frequency, interval: number): number {
  const perMonth = { DAILY: 30.4, WEEKLY: 4.35, MONTHLY: 1, YEARLY: 1 / 12 }[frequency];
  return perMonth / Math.max(interval, 1);
}

function RecurringForm({ recurring, onDone }: { recurring: Recurring | null; onDone: () => void }) {
  const { accounts, categories } = useLookups();
  const form = useForm({
    initialValues: {
      name: recurring?.name ?? '',
      type: (recurring?.type === 'INCOME' ? 'INCOME' : 'EXPENSE') as 'INCOME' | 'EXPENSE',
      amount: (recurring?.amount ?? '') as number | string,
      accountId: String(recurring?.accountId ?? accounts.find((a) => !a.archived)?.id ?? ''),
      categoryId: recurring ? String(recurring.categoryId) : '',
      note: recurring?.note ?? '',
      frequency: (recurring?.frequency ?? 'MONTHLY') as Frequency,
      intervalCount: (recurring?.intervalCount ?? 1) as number | string,
      startDate: recurring?.startDate ?? dayjs().format('YYYY-MM-DD'),
      endDate: recurring?.endDate ?? (null as string | null),
      autoCreate: recurring?.autoCreate ?? true,
    },
    validate: {
      name: (value) => (value.trim() ? null : 'Вкажіть назву'),
      amount: (value) => (Number(value) > 0 ? null : 'Вкажіть суму'),
      accountId: (value) => (value ? null : 'Оберіть рахунок'),
      categoryId: (value) => (value ? null : 'Оберіть категорію'),
      startDate: (value) => (value ? null : 'Вкажіть дату'),
      endDate: (value, values) => (value && value < values.startDate ? 'Дата завершення раніше за дату початку' : null),
    },
  });
  const save = useEntityMutation(
    'recurring',
    (input: RecurringInput) => (recurring ? recurringApi.update(recurring.id, input) : recurringApi.create(input)),
    { success: recurring ? 'Зміни збережено' : 'Регулярну операцію створено', onSuccess: onDone },
  );

  const submit = form.onSubmit((v) =>
    save.mutate({
      name: v.name.trim(),
      type: v.type,
      amount: Number(v.amount),
      accountId: Number(v.accountId),
      categoryId: Number(v.categoryId),
      note: v.note.trim() || null,
      frequency: v.frequency,
      intervalCount: Number(v.intervalCount) || 1,
      startDate: v.startDate,
      endDate: v.endDate || null,
      autoCreate: v.autoCreate,
      active: recurring?.active ?? true,
      version: recurring?.version,
    }),
  );

  return (
    <form onSubmit={submit}>
      <Stack gap="sm">
        <SegmentedControl
          fullWidth
          value={form.values.type}
          onChange={(value) => {
            form.setFieldValue('type', value as 'INCOME' | 'EXPENSE');
            form.setFieldValue('categoryId', '');
          }}
          data={[
            { value: 'EXPENSE', label: 'Регулярна витрата' },
            { value: 'INCOME', label: 'Регулярний дохід' },
          ]}
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Назва" placeholder="Netflix, комунальні, оренда…" withAsterisk data-autofocus {...form.getInputProps('name')} />
          <NumberInput label="Сума" min={0} decimalScale={2} thousandSeparator=" " decimalSeparator="," hideControls withAsterisk {...form.getInputProps('amount')} />
          <Select label="Рахунок" data={accounts.filter((a) => !a.archived).map((a) => ({ value: String(a.id), label: a.name }))} withAsterisk {...form.getInputProps('accountId')} />
          <Select label="Категорія" data={categoryOptions(categories, form.values.type)} searchable withAsterisk {...form.getInputProps('categoryId')} />
          <Select
            label="Періодичність"
            data={[
              { value: 'DAILY', label: 'Щодня' },
              { value: 'WEEKLY', label: 'Щотижня' },
              { value: 'MONTHLY', label: 'Щомісяця' },
              { value: 'YEARLY', label: 'Щороку' },
            ]}
            allowDeselect={false}
            {...form.getInputProps('frequency')}
          />
          <NumberInput label="Інтервал" description="Наприклад, 2 — кожні два тижні" min={1} max={365} allowDecimal={false} {...form.getInputProps('intervalCount')} />
          <DateInput label="Дата першого платежу" valueFormat="DD.MM.YYYY" withAsterisk {...form.getInputProps('startDate')} />
          <DateInput label="Дата завершення" placeholder="Без обмеження" valueFormat="DD.MM.YYYY" clearable {...form.getInputProps('endDate')} />
        </SimpleGrid>
        <TextInput label="Нотатка для операцій" placeholder="За замовчуванням — назва" {...form.getInputProps('note')} />
        <Switch
          label="Створювати операції автоматично"
          description={
            form.values.autoCreate
              ? 'Операція з’являтиметься сама в день платежу (пропущені з дати початку буде додано одразу)'
              : 'У день платежу FinTrack надішле нагадування, а записати платіж можна кнопкою «Додати зараз»'
          }
          {...form.getInputProps('autoCreate', { type: 'checkbox' })}
        />
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
