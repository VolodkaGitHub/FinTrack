import { Anchor, Badge, Button, Grid, Group, Paper, Progress, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconCalendarDue,
  IconChartLine,
  IconPigMoney,
  IconReceipt2,
  IconWallet,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { Link } from 'react-router';
import { recurringApi } from '../api/endpoints';
import {
  useBudgets,
  useCategoryShares,
  useEntityMutation,
  useForecast,
  useLookups,
  useSummary,
  useTransactions,
  useUpcoming,
} from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { CategoryDonut, CategoryLegend } from '../components/charts';
import { CategoryIcon } from '../components/CategoryIcon';
import { Amount, EmptyState, PageHeader, SectionLoader, StatCard } from '../components/common';
import { ACCOUNT_TYPE_ICONS } from '../components/icons';
import { categoryLabel } from '../utils/categories';
import { formatDate, formatMonth, formatMoney, formatSigned } from '../utils/format';

const STATE_COLORS = { OK: 'teal', WARNING: 'orange', EXCEEDED: 'red' } as const;

export default function DashboardPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? 'UAH';
  const month = dayjs().format('YYYY-MM');
  const from = dayjs().startOf('month').format('YYYY-MM-DD');
  const to = dayjs().endOf('month').format('YYYY-MM-DD');

  const summary = useSummary(from, to);
  const forecast = useForecast();
  const budgets = useBudgets(month);
  const shares = useCategoryShares(from, to, 'EXPENSE');
  const recent = useTransactions({ page: 0, size: 7, sort: 'date', direction: 'desc' });
  const upcoming = useUpcoming(14);
  const { accounts, accountById, categoryById } = useLookups();
  const apply = useEntityMutation('transactions', (id: number) => recurringApi.apply(id), { success: 'Платіж записано' });

  const projected = forecast.data?.projectedEndBalance ?? 0;
  const activeAccounts = accounts.filter((a) => !a.archived);

  return (
    <>
      <PageHeader title={`Вітаємо, ${user?.displayName ?? ''}!`} description={`Фінансовий стан за ${formatMonth(month).toLowerCase()}`} />

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} mb="lg">
        <StatCard label="Баланс рахунків" value={formatMoney(summary.data?.totalBalance, currency)} icon={IconWallet} hint={`${activeAccounts.length} активних рахунків`} />
        <StatCard label="Доходи за місяць" value={formatMoney(summary.data?.income, currency)} color="teal" icon={IconArrowUpRight} />
        <StatCard
          label="Витрати за місяць"
          value={formatMoney(summary.data?.expense, currency)}
          color="red"
          icon={IconArrowDownRight}
          hint={summary.data ? `Сальдо: ${formatMoney(summary.data.net, currency, { sign: true })}` : undefined}
        />
        <StatCard
          label="Прогноз на кінець місяця"
          value={formatMoney(projected, currency)}
          color={projected < 0 ? 'red' : 'blue'}
          icon={IconChartLine}
          hint={forecast.data ? `≈ ${formatMoney(forecast.data.averageDailyExpense, currency)} витрат на день` : undefined}
        />
      </SimpleGrid>

      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Stack gap="lg">
            <Paper withBorder radius="md" p="md">
              <Group justify="space-between" mb="sm">
                <Title order={4}>Структура витрат</Title>
                <Anchor component={Link} to="/analytics" size="sm">
                  Детальна аналітика
                </Anchor>
              </Group>
              {shares.isLoading ? (
                <SectionLoader />
              ) : !shares.data?.length ? (
                <Text c="dimmed" size="sm" py="lg" ta="center">
                  Цього місяця витрат ще немає
                </Text>
              ) : (
                <Grid align="center">
                  <Grid.Col span={{ base: 12, sm: 5 }}>
                    <CategoryDonut data={shares.data} currency={currency} height={220} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 7 }}>
                    <CategoryLegend data={shares.data} currency={currency} limit={6} />
                  </Grid.Col>
                </Grid>
              )}
            </Paper>

            <Paper withBorder radius="md" p="md">
              <Group justify="space-between" mb="sm">
                <Title order={4}>Бюджети</Title>
                <Anchor component={Link} to="/budgets" size="sm">
                  Усі бюджети
                </Anchor>
              </Group>
              {!budgets.data?.length ? (
                <EmptyState
                  icon={IconPigMoney}
                  title="Бюджетів ще немає"
                  description="Встановіть місячний ліміт для категорій, щоб бачити залишок і отримувати попередження."
                  action={
                    <Button component={Link} to="/budgets" variant="light" size="xs">
                      Створити бюджет
                    </Button>
                  }
                />
              ) : (
                <Stack gap="md">
                  {budgets.data.slice(0, 5).map((budget) => {
                    const category = categoryById.get(budget.categoryId);
                    return (
                      <div key={budget.id}>
                        <Group justify="space-between" mb={4} wrap="nowrap">
                          <Group gap="xs" wrap="nowrap">
                            <CategoryIcon icon={category?.icon} color={category?.color} size={24} />
                            <Text size="sm" fw={500}>
                              {category?.name}
                            </Text>
                          </Group>
                          <Text size="sm" c={budget.state === 'EXCEEDED' ? 'red' : 'dimmed'}>
                            {formatMoney(budget.spent, currency)} / {formatMoney(budget.available, currency)}
                          </Text>
                        </Group>
                        <Progress value={Math.min(budget.percent, 100)} color={STATE_COLORS[budget.state]} size="md" radius="xl" />
                      </div>
                    );
                  })}
                </Stack>
              )}
            </Paper>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Stack gap="lg">
            <Paper withBorder radius="md" p="md">
              <Group justify="space-between" mb="sm">
                <Title order={4}>Рахунки</Title>
                <Anchor component={Link} to="/accounts" size="sm">
                  Керувати
                </Anchor>
              </Group>
              <Stack gap="sm">
                {activeAccounts.map((account) => {
                  const Icon = ACCOUNT_TYPE_ICONS[account.type];
                  return (
                    <Group key={account.id} justify="space-between" wrap="nowrap">
                      <Group gap="sm" wrap="nowrap">
                        <ThemeIcon color={account.color} variant="light" radius="md">
                          <Icon size={18} />
                        </ThemeIcon>
                        <Text size="sm">{account.name}</Text>
                      </Group>
                      <Text size="sm" fw={600} c={account.balance < 0 ? 'red' : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatMoney(account.balance, currency)}
                      </Text>
                    </Group>
                  );
                })}
              </Stack>
            </Paper>

            <Paper withBorder radius="md" p="md">
              <Group justify="space-between" mb="sm">
                <Title order={4}>Найближчі платежі</Title>
                <Anchor component={Link} to="/recurring" size="sm">
                  Усі
                </Anchor>
              </Group>
              {!upcoming.data?.length ? (
                <Text c="dimmed" size="sm">
                  На найближчі 2 тижні регулярних платежів немає
                </Text>
              ) : (
                <Stack gap="sm">
                  {upcoming.data.slice(0, 6).map((payment) => (
                    <Group key={`${payment.recurringId}-${payment.date}`} justify="space-between" wrap="nowrap">
                      <div style={{ minWidth: 0 }}>
                        <Text size="sm" fw={500} truncate>
                          {payment.name}
                        </Text>
                        <Group gap={6}>
                          <IconCalendarDue size={13} color="var(--mantine-color-dimmed)" />
                          <Text size="xs" c={payment.overdue ? 'red' : 'dimmed'}>
                            {payment.overdue ? 'Прострочено · ' : ''}
                            {formatDate(payment.date)}
                          </Text>
                          {payment.autoCreate && (
                            <Badge size="xs" variant="light">
                              авто
                            </Badge>
                          )}
                        </Group>
                      </div>
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm" fw={600} c={payment.type === 'INCOME' ? 'teal' : undefined}>
                          {formatSigned(payment.amount, payment.type, currency)}
                        </Text>
                        {!payment.autoCreate && (
                          <Button size="compact-xs" variant="light" loading={apply.isPending} onClick={() => apply.mutate(payment.recurringId)}>
                            Сплатити
                          </Button>
                        )}
                      </Group>
                    </Group>
                  ))}
                </Stack>
              )}
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>

      <Paper withBorder radius="md" p="md" mt="lg">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Останні операції</Title>
          <Anchor component={Link} to="/transactions" size="sm">
            Усі операції
          </Anchor>
        </Group>
        {!recent.data?.content.length ? (
          <EmptyState
            icon={IconReceipt2}
            title="Операцій ще немає"
            description="Натисніть «Операція» вгорі, щоб записати перший дохід чи витрату."
          />
        ) : (
          <Stack gap={0}>
            {recent.data.content.map((tx) => {
              const category = tx.categoryId != null ? categoryById.get(tx.categoryId) : undefined;
              return (
                <Group
                  key={tx.id}
                  justify="space-between"
                  wrap="nowrap"
                  gap="sm"
                  py="xs"
                  style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
                >
                  <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                    <CategoryIcon icon={category?.icon} color={category?.color} transfer={tx.type === 'TRANSFER'} size={30} />
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" truncate>
                        {tx.type === 'TRANSFER'
                          ? `${accountById.get(tx.accountId)?.name ?? ''} → ${accountById.get(tx.toAccountId ?? -1)?.name ?? ''}`
                          : categoryLabel(categoryById, tx.categoryId)}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {formatDate(tx.date)}
                        {tx.note ? ` · ${tx.note}` : ''}
                      </Text>
                    </div>
                  </Group>
                  <Amount amount={tx.amount} type={tx.type} />
                </Group>
              );
            })}
          </Stack>
        )}
      </Paper>
    </>
  );
}
