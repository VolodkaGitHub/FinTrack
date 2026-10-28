import { Alert, Anchor, Breadcrumbs, Button, Grid, Group, List, Paper, SegmentedControl, SimpleGrid, Stack, Tabs, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCalendarStats,
  IconChartArea,
  IconChartBar,
  IconChartDonut3,
  IconFileSpreadsheet,
  IconFileTypePdf,
  IconReportMoney,
  IconTrendingDown,
  IconTrendingUp,
  IconWallet,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { reportsApi } from '../api/endpoints';
import { useCategoryShares, useForecast, useMonthly } from '../api/hooks';
import type { CategoryShare, CategoryType } from '../api/types';
import { useCurrency } from '../auth/AuthContext';
import { CategoryDonut, CategoryLegend, tooltipStyle } from '../components/charts';
import { EmptyState, PageHeader, SectionLoader, StatCard } from '../components/common';
import { periodFromPreset, PeriodSelect, type Period } from '../components/PeriodSelect';
import { blobErrorMessage, saveResponse } from '../utils/download';
import { compactMoney, formatDate, formatMoney, formatShortMonth, formatSigned } from '../utils/format';

const COLORS = { income: '#12b886', incomeDark: '#087f5b', expense: '#fa5252', expenseDark: '#c92a2a', balance: '#228be6', projected: '#fd7e14' };
const axisTick = { fontSize: 12, fill: '#868e96' };

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader title="Аналітика і звіти" description="Структура витрат, динаміка, прогноз і зведені звіти" />
      <Tabs defaultValue="structure" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="structure" leftSection={<IconChartDonut3 size={16} />}>
            Структура
          </Tabs.Tab>
          <Tabs.Tab value="dynamics" leftSection={<IconChartBar size={16} />}>
            Динаміка
          </Tabs.Tab>
          <Tabs.Tab value="forecast" leftSection={<IconChartArea size={16} />}>
            Прогноз
          </Tabs.Tab>
          <Tabs.Tab value="reports" leftSection={<IconReportMoney size={16} />}>
            Звіти
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="structure">
          <StructureTab />
        </Tabs.Panel>
        <Tabs.Panel value="dynamics">
          <DynamicsTab />
        </Tabs.Panel>
        <Tabs.Panel value="forecast">
          <ForecastTab />
        </Tabs.Panel>
        <Tabs.Panel value="reports">
          <ReportsTab />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}

/** REQ-3.1: розподіл витрат (доходів) за категоріями з деталізацією до підкатегорій. */
function StructureTab() {
  const currency = useCurrency();
  const [period, setPeriod] = useState<Period>(() => periodFromPreset('thisMonth'));
  const [type, setType] = useState<CategoryType>('EXPENSE');
  const [parent, setParent] = useState<CategoryShare | null>(null);
  const { data, isLoading } = useCategoryShares(period.from, period.to, type, parent?.categoryId ?? null);
  const total = (data ?? []).reduce((sum, item) => sum + item.amount, 0);

  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" mb="md" wrap="wrap">
        <PeriodSelect value={period} onChange={setPeriod} />
        <SegmentedControl
          value={type}
          onChange={(value) => {
            setType(value as CategoryType);
            setParent(null);
          }}
          data={[
            { value: 'EXPENSE', label: 'Витрати' },
            { value: 'INCOME', label: 'Доходи' },
          ]}
        />
      </Group>
      {parent && (
        <Breadcrumbs mb="md">
          <Anchor component="button" type="button" onClick={() => setParent(null)}>
            Усі категорії
          </Anchor>
          <Text>{parent.name}</Text>
        </Breadcrumbs>
      )}
      {isLoading ? (
        <SectionLoader />
      ) : !data?.length ? (
        <EmptyState icon={IconChartDonut3} title="Немає даних за обраний період" description="Спробуйте інший період або додайте операції." />
      ) : (
        <Grid align="center" gutter="xl">
          <Grid.Col span={{ base: 12, md: 5 }}>
            <CategoryDonut data={data} currency={currency} height={300} />
            <Text ta="center" fw={700} fz="lg">
              {formatMoney(total, currency)}
            </Text>
            <Text ta="center" c="dimmed" size="sm">
              {type === 'EXPENSE' ? 'витрати' : 'доходи'} за {formatDate(period.from)} — {formatDate(period.to)}
            </Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 7 }}>
            <CategoryLegend data={data} currency={currency} onSelect={setParent} />
          </Grid.Col>
        </Grid>
      )}
    </Paper>
  );
}

/** REQ-3.2: порівняння доходів і витрат у динаміці по місяцях з трендовою лінією. */
function DynamicsTab() {
  const currency = useCurrency();
  const [months, setMonths] = useState('12');
  const to = dayjs().format('YYYY-MM');
  const from = dayjs().subtract(Number(months) - 1, 'month').format('YYYY-MM');
  const { data, isLoading } = useMonthly(from, to);
  const chartData = (data?.points ?? []).map((point) => ({ ...point, label: formatShortMonth(point.month) }));
  const slopeText = (slope: number) =>
    Math.abs(slope) < 1 ? 'стабільно' : `${slope > 0 ? 'зростають' : 'спадають'} на ${formatMoney(Math.abs(slope), currency)} / міс.`;

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <StatCard label="Середній дохід / міс." value={formatMoney(data?.averageIncome, currency)} color="teal" icon={IconTrendingUp} />
        <StatCard label="Середні витрати / міс." value={formatMoney(data?.averageExpense, currency)} color="red" icon={IconTrendingDown} />
        <StatCard label="Тренд доходів" value={data ? slopeText(data.incomeSlope) : '—'} icon={IconCalendarStats} color="teal" />
        <StatCard label="Тренд витрат" value={data ? slopeText(data.expenseSlope) : '—'} icon={IconCalendarStats} color={data && data.expenseSlope > 0 ? 'red' : 'teal'} />
      </SimpleGrid>
      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" mb="md">
          <Title order={4}>Доходи та витрати по місяцях</Title>
          <SegmentedControl
            value={months}
            onChange={setMonths}
            data={[
              { value: '6', label: '6 міс.' },
              { value: '12', label: '12 міс.' },
              { value: '24', label: '24 міс.' },
            ]}
          />
        </Group>
        {isLoading ? (
          <SectionLoader />
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dee2e6" />
              <XAxis dataKey="label" tick={axisTick} />
              <YAxis tickFormatter={compactMoney} width={56} tick={axisTick} />
              <Tooltip formatter={(value, name) => [formatMoney(Number(value), currency), name]} contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="income" name="Доходи" fill={COLORS.income} radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="expense" name="Витрати" fill={COLORS.expense} radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Line type="linear" dataKey="incomeTrend" name="Тренд доходів" stroke={COLORS.incomeDark} strokeDasharray="6 4" strokeWidth={2} dot={false} />
              <Line type="linear" dataKey="expenseTrend" name="Тренд витрат" stroke={COLORS.expenseDark} strokeDasharray="6 4" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
        <Text size="xs" c="dimmed" mt="xs">
          Трендові лінії побудовано методом найменших квадратів за обраний період.
        </Text>
      </Paper>
    </Stack>
  );
}

/** REQ-3.4: прогноз залишку коштів до кінця місяця на основі поточної динаміки витрат. */
function ForecastTab() {
  const currency = useCurrency();
  const { data, isLoading } = useForecast();
  if (isLoading || !data) {
    return <SectionLoader />;
  }
  const chartData = data.series.map((point) => ({ ...point, day: dayjs(point.date).format('D MMM') }));
  const negative = data.projectedEndBalance < 0;

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <StatCard label="Баланс сьогодні" value={formatMoney(data.currentBalance, currency)} icon={IconWallet} />
        <StatCard
          label="Середні витрати / день"
          value={formatMoney(data.averageDailyExpense, currency)}
          color="red"
          icon={IconTrendingDown}
          hint="без регулярних платежів"
        />
        <StatCard
          label="Очікувані регулярні"
          value={formatMoney(data.recurringIncome - data.recurringExpense, currency, { sign: true })}
          icon={IconCalendarStats}
          hint={`доходи ${formatMoney(data.recurringIncome, currency)} · витрати ${formatMoney(data.recurringExpense, currency)}`}
        />
        <StatCard
          label={`Прогноз на ${formatDate(data.monthEnd)}`}
          value={formatMoney(data.projectedEndBalance, currency)}
          color={negative ? 'red' : 'blue'}
          icon={IconChartArea}
          hint={`залишилось днів: ${data.daysLeft}`}
        />
      </SimpleGrid>
      {negative && (
        <Alert color="red" title="Можливий дефіцит коштів">
          За поточної динаміки витрат до кінця місяця коштів може не вистачити. Перегляньте бюджети або заплановані витрати.
        </Alert>
      )}
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Paper withBorder radius="md" p="md">
            <Title order={4} mb="md">
              Баланс протягом місяця
            </Title>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dee2e6" />
                <XAxis dataKey="day" tick={axisTick} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tickFormatter={compactMoney} width={56} tick={axisTick} />
                <Tooltip formatter={(value, name) => [formatMoney(Number(value), currency), name]} contentStyle={tooltipStyle} />
                <Legend />
                <ReferenceLine y={0} stroke="#fa5252" />
                <Area type="monotone" dataKey="actual" name="Фактичний баланс" stroke={COLORS.balance} fill={COLORS.balance} fillOpacity={0.15} strokeWidth={2} />
                <Line type="monotone" dataKey="projected" name="Прогноз" stroke={COLORS.projected} strokeDasharray="6 4" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Paper withBorder radius="md" p="md" h="100%">
            <Title order={4} mb="sm">
              Як рахується прогноз
            </Title>
            <List size="sm" spacing={6}>
              <List.Item>поточний баланс усіх активних рахунків;</List.Item>
              <List.Item>+ заплановані операції та регулярні доходи до кінця місяця;</List.Item>
              <List.Item>− регулярні платежі до кінця місяця;</List.Item>
              <List.Item>
                − середньоденні витрати × {data.daysLeft} дн. (поточний місяць зважено з трьома попередніми).
              </List.Item>
            </List>
            {data.upcoming.length > 0 && (
              <>
                <Text fw={600} mt="md" mb={6} size="sm">
                  Очікувані платежі
                </Text>
                <Stack gap={4}>
                  {data.upcoming.slice(0, 8).map((payment) => (
                    <Group key={`${payment.recurringId}-${payment.date}`} justify="space-between" wrap="nowrap">
                      <Text size="sm" truncate>
                        {formatDate(payment.date)} · {payment.name}
                      </Text>
                      <Text size="sm" fw={600} c={payment.type === 'INCOME' ? 'teal' : 'red'}>
                        {formatSigned(payment.amount, payment.type, currency)}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </>
            )}
          </Paper>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

/** REQ-3.3: зведений звіт (PDF / Excel) за обраний період. */
function ReportsTab() {
  const [period, setPeriod] = useState<Period>(() => periodFromPreset('thisMonth'));
  const [loading, setLoading] = useState<'pdf' | 'xlsx' | null>(null);
  const range = period.preset === 'all' ? { from: dayjs().subtract(5, 'year').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') } : period;

  const download = async (format: 'pdf' | 'xlsx') => {
    setLoading(format);
    try {
      await saveResponse(reportsApi.summary(range.from, range.to, format), `fintrack-report.${format}`);
    } catch (error) {
      notifications.show({ color: 'red', message: await blobErrorMessage(error, 'Не вдалося сформувати звіт') });
    } finally {
      setLoading(null);
    }
  };

  return (
    <Paper withBorder radius="md" p="lg">
      <Title order={4}>Зведений звіт за період</Title>
      <Text c="dimmed" size="sm" mt={4} mb="md">
        Містить підсумки доходів і витрат, розподіл за категоріями, помісячну динаміку з трендом, баланси рахунків, найбільші витрати
        та повний перелік операцій.
      </Text>
      <PeriodSelect value={period} onChange={setPeriod} />
      <Group mt="lg">
        <Button leftSection={<IconFileTypePdf size={18} />} color="red" variant="light" loading={loading === 'pdf'} onClick={() => void download('pdf')}>
          Завантажити PDF
        </Button>
        <Button leftSection={<IconFileSpreadsheet size={18} />} color="teal" variant="light" loading={loading === 'xlsx'} onClick={() => void download('xlsx')}>
          Завантажити Excel
        </Button>
      </Group>
      <Text size="xs" c="dimmed" mt="md">
        Експорт і імпорт історії операцій у форматі CSV — у розділі «Налаштування → Дані».
      </Text>
    </Paper>
  );
}
