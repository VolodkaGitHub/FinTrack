import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  NumberInput,
  Pagination,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Table,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import {
  IconArrowDown,
  IconArrowUp,
  IconDots,
  IconEdit,
  IconFilterOff,
  IconPlus,
  IconReceipt2,
  IconRepeat,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { transactionsApi } from '../api/endpoints';
import { useEntityMutation, useLookups, useTransactions } from '../api/hooks';
import type { Transaction, TransactionFilter, TransactionType } from '../api/types';
import { useCurrency } from '../auth/AuthContext';
import { CategoryIcon } from '../components/CategoryIcon';
import { Amount, EmptyState, PageHeader } from '../components/common';
import { periodFromPreset, PeriodSelect, type Period } from '../components/PeriodSelect';
import { TransactionFormModal } from '../components/TransactionFormModal';
import { categoryLabel, categoryOptions } from '../utils/categories';
import { formatDate, formatMoney, plural } from '../utils/format';

type SortBy = 'date' | 'amount';

export default function TransactionsPage() {
  const currency = useCurrency();
  const { accounts, categories, accountById, categoryById } = useLookups();
  const [period, setPeriod] = useState<Period>(() => periodFromPreset('thisMonth'));
  const [type, setType] = useState<'' | TransactionType>('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [minAmount, setMinAmount] = useState<number | string>('');
  const [maxAmount, setMaxAmount] = useState<number | string>('');
  const [search, setSearch] = useState('');
  const [q] = useDebouncedValue(search.trim(), 350);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ by: SortBy; direction: 'asc' | 'desc' }>({ by: 'date', direction: 'desc' });
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [creating, setCreating] = useState(false);

  const filter: TransactionFilter = {
    from: period.preset === 'all' ? undefined : period.from,
    to: period.preset === 'all' ? undefined : period.to,
    type: type || undefined,
    accountId: accountId ? Number(accountId) : undefined,
    categoryId: categoryId ? Number(categoryId) : undefined,
    minAmount: minAmount === '' ? undefined : Number(minAmount),
    maxAmount: maxAmount === '' ? undefined : Number(maxAmount),
    q: q || undefined,
    page: page - 1,
    size: 20,
    sort: sort.by,
    direction: sort.direction,
  };
  const { data, isFetching } = useTransactions(filter);
  const remove = useEntityMutation('transactions', (id: number) => transactionsApi.remove(id), { success: 'Операцію видалено' });

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const hasFilters = type || accountId || categoryId || minAmount !== '' || maxAmount !== '' || search;
  const clearFilters = () => {
    setType('');
    setAccountId(null);
    setCategoryId(null);
    setMinAmount('');
    setMaxAmount('');
    setSearch('');
    setPage(1);
  };

  const toggleSort = (by: SortBy) =>
    setSort((current) => ({ by, direction: current.by === by && current.direction === 'desc' ? 'asc' : 'desc' }));

  const confirmDelete = (tx: Transaction) =>
    modals.openConfirmModal({
      title: 'Видалити операцію?',
      children: (
        <Text size="sm">
          {formatDate(tx.date)} · {formatMoney(tx.amount, currency)}
          {tx.note ? ` · ${tx.note}` : ''}. Дію не можна скасувати.
        </Text>
      ),
      labels: { confirm: 'Видалити', cancel: 'Скасувати' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(tx.id),
    });

  const SortIcon = sort.direction === 'desc' ? IconArrowDown : IconArrowUp;
  const today = dayjs().format('YYYY-MM-DD');

  return (
    <>
      <PageHeader
        title="Операції"
        description="Облік доходів, витрат і переказів між рахунками"
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
            Додати операцію
          </Button>
        }
      />

      <Paper withBorder radius="md" p="md" mb="md">
        <Group justify="space-between" mb="sm" wrap="wrap" gap="sm">
          <PeriodSelect value={period} onChange={resetPage(setPeriod)} />
          <SegmentedControl
            value={type}
            onChange={(value) => resetPage(setType)(value as '' | TransactionType)}
            data={[
              { value: '', label: 'Усі' },
              { value: 'EXPENSE', label: 'Витрати' },
              { value: 'INCOME', label: 'Доходи' },
              { value: 'TRANSFER', label: 'Перекази' },
            ]}
          />
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="sm">
          <TextInput
            placeholder="Нотатка або категорія"
            aria-label="Пошук у нотатках і категоріях"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(event) => resetPage(setSearch)(event.currentTarget.value)}
          />
          <Select
            placeholder="Усі рахунки"
            data={accounts.map((a) => ({ value: String(a.id), label: a.name }))}
            value={accountId}
            onChange={resetPage(setAccountId)}
            clearable
          />
          <Select
            placeholder="Усі категорії"
            data={categoryOptions(categories, type === 'INCOME' || type === 'EXPENSE' ? type : undefined)}
            value={categoryId}
            onChange={resetPage(setCategoryId)}
            searchable
            clearable
          />
          <NumberInput placeholder="Сума від" min={0} hideControls value={minAmount} onChange={resetPage(setMinAmount)} thousandSeparator=" " decimalSeparator="," />
          <NumberInput placeholder="Сума до" min={0} hideControls value={maxAmount} onChange={resetPage(setMaxAmount)} thousandSeparator=" " decimalSeparator="," />
        </SimpleGrid>
        <Group justify="space-between" mt="sm" wrap="wrap">
          <Text size="sm" c="dimmed">
            {data ? (
              <>
                Знайдено {data.totalElements} {plural(data.totalElements, 'операцію', 'операції', 'операцій')} · доходи{' '}
                <Text span c="teal" fw={600}>
                  {formatMoney(data.totalIncome, currency, { sign: true })}
                </Text>{' '}
                · витрати{' '}
                <Text span c="red" fw={600}>
                  {formatMoney(-data.totalExpense, currency)}
                </Text>
              </>
            ) : (
              'Завантаження…'
            )}
          </Text>
          {hasFilters && (
            <Button variant="subtle" size="xs" leftSection={<IconFilterOff size={14} />} onClick={clearFilters}>
              Скинути фільтри
            </Button>
          )}
        </Group>
      </Paper>

      {data && data.content.length === 0 ? (
        <EmptyState
          icon={IconReceipt2}
          title="Нічого не знайдено"
          description={hasFilters ? 'Змініть умови пошуку або скиньте фільтри.' : 'За цей період операцій немає.'}
          action={
            <Button variant="light" size="xs" onClick={() => setCreating(true)}>
              Додати операцію
            </Button>
          }
        />
      ) : (
        <Paper withBorder radius="md" style={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 150ms' }}>
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={120}>
                    <UnstyledButton onClick={() => toggleSort('date')}>
                      <Group gap={4}>
                        <Text size="sm" fw={600}>
                          Дата
                        </Text>
                        {sort.by === 'date' && <SortIcon size={14} />}
                      </Group>
                    </UnstyledButton>
                  </Table.Th>
                  <Table.Th>Категорія / нотатка</Table.Th>
                  <Table.Th>Рахунок</Table.Th>
                  <Table.Th ta="right">
                    <UnstyledButton onClick={() => toggleSort('amount')}>
                      <Group gap={4} justify="flex-end">
                        <Text size="sm" fw={600}>
                          Сума
                        </Text>
                        {sort.by === 'amount' && <SortIcon size={14} />}
                      </Group>
                    </UnstyledButton>
                  </Table.Th>
                  <Table.Th w={50} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data?.content.map((tx) => {
                  const category = tx.categoryId != null ? categoryById.get(tx.categoryId) : undefined;
                  return (
                    <Table.Tr key={tx.id}>
                      <Table.Td>
                        <Text size="sm">{formatDate(tx.date)}</Text>
                        {tx.date > today && (
                          <Badge size="xs" variant="light" color="gray">
                            заплановано
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Group gap="sm" wrap="nowrap">
                          <CategoryIcon icon={category?.icon} color={category?.color} transfer={tx.type === 'TRANSFER'} size={32} />
                          <div style={{ minWidth: 0 }}>
                            <Group gap={6}>
                              <Text size="sm" fw={500}>
                                {tx.type === 'TRANSFER' ? 'Переказ між рахунками' : categoryLabel(categoryById, tx.categoryId)}
                              </Text>
                              {tx.recurringId && (
                                <Tooltip label="Регулярна операція" withArrow>
                                  <IconRepeat size={14} color="var(--mantine-color-blue-6)" />
                                </Tooltip>
                              )}
                            </Group>
                            {tx.note && (
                              <Text size="xs" c="dimmed" lineClamp={1}>
                                {tx.note}
                              </Text>
                            )}
                          </div>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {accountById.get(tx.accountId)?.name}
                          {tx.type === 'TRANSFER' && ` → ${accountById.get(tx.toAccountId ?? -1)?.name ?? ''}`}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Amount amount={tx.amount} type={tx.type} />
                      </Table.Td>
                      <Table.Td>
                        <Menu position="bottom-end" withinPortal>
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray" aria-label="Дії">
                              <IconDots size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item leftSection={<IconEdit size={15} />} onClick={() => setEditing(tx)}>
                              Редагувати
                            </Menu.Item>
                            <Menu.Item color="red" leftSection={<IconTrash size={15} />} onClick={() => confirmDelete(tx)}>
                              Видалити
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {data && data.totalPages > 1 && (
            <Group justify="center" p="md">
              <Pagination total={data.totalPages} value={page} onChange={setPage} size="sm" />
            </Group>
          )}
        </Paper>
      )}

      <TransactionFormModal opened={creating} onClose={() => setCreating(false)} />
      <TransactionFormModal opened={editing !== null} transaction={editing} onClose={() => setEditing(null)} />
    </>
  );
}
