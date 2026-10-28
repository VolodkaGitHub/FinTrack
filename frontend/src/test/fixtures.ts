import dayjs from 'dayjs';
import type {
  Account,
  BudgetStatus,
  Category,
  CategoryShare,
  Forecast,
  ImportResult,
  MonthlyDynamics,
  NotificationList,
  Recurring,
  Session,
  Summary,
  Transaction,
  TransactionPage,
  UpcomingPayment,
  User,
} from '../api/types';

const iso = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD');
export const today = iso(dayjs());
const created = '2025-01-01T10:00:00Z';

export const user: User = {
  id: 7,
  email: 'olena@example.com',
  displayName: 'Олена',
  currency: 'UAH',
  authProvider: 'LOCAL',
  emailVerified: true,
  hasPassword: true,
  createdAt: created,
};

export const accounts: Account[] = [
  { id: 1, name: 'Готівка', type: 'CASH', initialBalance: 0, balance: 1500, color: '#2f9e44', archived: false, createdAt: created, version: 0 },
  { id: 2, name: 'Банківська картка', type: 'CARD', initialBalance: 0, balance: 32000.5, color: '#1971c2', archived: false, createdAt: created, version: 3 },
  { id: 3, name: 'Стара картка', type: 'CARD', initialBalance: 100, balance: 0, color: '#868e96', archived: true, createdAt: created, version: 1 },
];

export const categories: Category[] = [
  { id: 10, name: 'Продукти', type: 'EXPENSE', parentId: null, icon: 'shopping-cart', color: '#2f9e44', version: 0 },
  { id: 11, name: 'Супермаркет', type: 'EXPENSE', parentId: 10, icon: 'basket', color: '#37b24d', version: 0 },
  { id: 12, name: 'Кафе та ресторани', type: 'EXPENSE', parentId: null, icon: 'tools-kitchen-2', color: '#f08c00', version: 0 },
  { id: 13, name: 'Комунальні послуги', type: 'EXPENSE', parentId: null, icon: 'bolt', color: '#7048e8', version: 2 },
  { id: 20, name: 'Зарплата', type: 'INCOME', parentId: null, icon: 'briefcase', color: '#2b8a3e', version: 0 },
];

const tx = (t: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'amount'>): Transaction => ({
  date: today,
  accountId: 2,
  toAccountId: null,
  categoryId: null,
  note: null,
  recurringId: null,
  createdAt: created,
  updatedAt: created,
  version: 0,
  ...t,
});

export const transactions: Transaction[] = [
  tx({ id: 100, type: 'INCOME', amount: 30000, categoryId: 20, note: 'Зарплата за місяць' }),
  tx({ id: 101, type: 'EXPENSE', amount: 450.5, categoryId: 11, note: 'Сільпо' }),
  tx({ id: 102, type: 'TRANSFER', amount: 1000, toAccountId: 1, note: 'Зняття готівки' }),
  tx({ id: 103, type: 'EXPENSE', amount: 299, categoryId: 13, note: 'Netflix', recurringId: 300, date: iso(dayjs().add(5, 'day')) }),
];

export const transactionPage: TransactionPage = {
  content: transactions,
  page: 0,
  size: 20,
  totalElements: 4,
  totalPages: 2,
  totalIncome: 30000,
  totalExpense: 749.5,
};

export const recurring: Recurring[] = [
  {
    id: 300, name: 'Netflix', type: 'EXPENSE', amount: 299, accountId: 2, categoryId: 13, note: null, frequency: 'MONTHLY',
    intervalCount: 1, startDate: '2025-01-05', nextDate: iso(dayjs().add(5, 'day')), endDate: null, autoCreate: true,
    active: true, due: false, version: 1,
  },
  {
    id: 301, name: 'Комуналка', type: 'EXPENSE', amount: 1800, accountId: 2, categoryId: 13, note: null, frequency: 'MONTHLY',
    intervalCount: 1, startDate: '2025-01-10', nextDate: iso(dayjs().subtract(2, 'day')), endDate: null, autoCreate: false,
    active: true, due: true, version: 0,
  },
  {
    id: 302, name: 'Фріланс', type: 'INCOME', amount: 5000, accountId: 2, categoryId: 20, note: 'Проєкт', frequency: 'WEEKLY',
    intervalCount: 2, startDate: '2025-01-01', nextDate: today, endDate: '2030-12-31', autoCreate: false,
    active: false, due: false, version: 0,
  },
];

export const upcoming: UpcomingPayment[] = [
  { recurringId: 301, name: 'Комуналка', type: 'EXPENSE', amount: 1800, date: iso(dayjs().subtract(2, 'day')), accountId: 2, categoryId: 13, autoCreate: false, overdue: true },
  { recurringId: 300, name: 'Netflix', type: 'EXPENSE', amount: 299, date: iso(dayjs().add(5, 'day')), accountId: 2, categoryId: 13, autoCreate: true, overdue: false },
];

const month = dayjs().format('YYYY-MM');
export const budgets: BudgetStatus[] = [
  {
    id: 400, categoryId: 10, amount: 3000, rollover: true, alertThreshold: 80, month, limit: 3000, carriedOver: 500,
    available: 3500, spent: 3000, remaining: 500, percent: 85.7, state: 'WARNING', version: 0,
  },
  {
    id: 401, categoryId: 12, amount: 1000, rollover: false, alertThreshold: 90, month, limit: 1000, carriedOver: 0,
    available: 1000, spent: 1200, remaining: -200, percent: 120, state: 'EXCEEDED', version: 4,
  },
];

export const notificationList: NotificationList = {
  unreadCount: 1,
  items: [
    { id: 500, type: 'BUDGET_WARNING', title: 'Бюджет «Продукти» майже вичерпано', message: 'Використано 86%', read: false, createdAt: dayjs().subtract(5, 'minute').toISOString() },
    { id: 501, type: 'RECURRING_CREATED', title: 'Регулярна операція: Netflix', message: 'Автоматично записано −299,00 ₴', read: true, createdAt: dayjs().subtract(1, 'day').toISOString() },
  ],
};

export const summary: Summary = {
  from: dayjs().startOf('month').format('YYYY-MM-DD'),
  to: dayjs().endOf('month').format('YYYY-MM-DD'),
  income: 30000,
  expense: 749.5,
  net: 29250.5,
  transactionCount: 4,
  totalBalance: 33500.5,
};

export const shares: CategoryShare[] = [
  { categoryId: 10, name: 'Продукти', icon: 'shopping-cart', color: '#2f9e44', amount: 450.5, percent: 60.1, hasChildren: true },
  { categoryId: 13, name: 'Комунальні послуги', icon: 'bolt', color: '#7048e8', amount: 299, percent: 39.9, hasChildren: false },
];

export const monthly: MonthlyDynamics = {
  points: Array.from({ length: 12 }, (_, i) => {
    const m = dayjs().subtract(11 - i, 'month').format('YYYY-MM');
    const tracked = i >= 9;
    return {
      month: m,
      income: tracked ? 30000 : 0,
      expense: tracked ? 8000 + i * 100 : 0,
      net: tracked ? 22000 - i * 100 : 0,
      incomeTrend: tracked ? 30000 : null,
      expenseTrend: tracked ? 8000 + i * 100 : null,
    };
  }),
  incomeSlope: 1200.5,
  expenseSlope: -150,
  averageIncome: 30000,
  averageExpense: 8950,
};

export const forecast: Forecast = {
  today,
  monthEnd: dayjs().endOf('month').format('YYYY-MM-DD'),
  daysInMonth: 30,
  daysElapsed: 10,
  daysLeft: 20,
  currentBalance: 33500.5,
  incomeToDate: 30000,
  expenseToDate: 749.5,
  averageDailyExpense: 120,
  plannedIncome: 0,
  plannedExpense: 299,
  recurringIncome: 0,
  recurringExpense: 1800,
  projectedIncome: 30000,
  projectedExpense: 5248.5,
  projectedEndBalance: 29001.5,
  upcoming,
  series: Array.from({ length: 30 }, (_, i) => ({
    date: iso(dayjs().startOf('month').add(i, 'day')),
    actual: i < 10 ? 33500.5 : null,
    projected: i >= 9 ? 33500.5 - (i - 9) * 120 : null,
  })),
};

export const sessions: Session[] = [
  { id: 1, deviceName: 'Chrome · Windows', createdAt: created, lastUsedAt: created, expiresAt: '2030-01-01T00:00:00Z', current: true },
  { id: 2, deviceName: 'Safari · iOS', createdAt: created, lastUsedAt: created, expiresAt: '2030-01-01T00:00:00Z', current: false },
];

export const importPreview: ImportResult = {
  dryRun: true,
  encoding: 'Windows-1251',
  delimiter: 'крапка з комою',
  columns: { date: 'Дата', amount: 'Сума', note: 'Опис' },
  totalRows: 3,
  validRows: 2,
  duplicateRows: 0,
  errorRows: 1,
  imported: 0,
  newAccounts: ['Скарбничка'],
  newCategories: ['Витрата: Подорожі'],
  needsDefaultAccount: true,
  preview: [
    { line: 2, date: '2025-02-01', type: 'EXPENSE', amount: 120, account: 'Готівка', category: 'Подорожі', subcategory: null, toAccount: null, note: 'Квитки', status: 'OK', message: null },
    { line: 3, date: '2025-02-02', type: 'INCOME', amount: 500, account: 'Скарбничка', category: null, subcategory: null, toAccount: null, note: 'Повернення', status: 'OK', message: null },
    { line: 4, date: null, type: null, amount: null, account: null, category: null, subcategory: null, toAccount: null, note: 'Зламаний', status: 'ERROR', message: 'Порожня дата' },
  ],
  errors: [],
};
