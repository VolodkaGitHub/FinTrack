export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type CategoryType = 'INCOME' | 'EXPENSE';
export type AccountType = 'CASH' | 'CARD' | 'SAVINGS' | 'OTHER';
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type BudgetState = 'OK' | 'WARNING' | 'EXCEEDED';
export type NotificationType =
  | 'BUDGET_WARNING'
  | 'BUDGET_EXCEEDED'
  | 'BUDGET_ROLLOVER'
  | 'RECURRING_CREATED'
  | 'RECURRING_DUE'
  | 'IMPORT_COMPLETED';

export interface User {
  id: number;
  email: string;
  displayName: string;
  currency: string;
  authProvider: 'LOCAL' | 'GOOGLE';
  emailVerified: boolean;
  hasPassword: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}

export interface Session {
  id: number;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  initialBalance: number;
  balance: number;
  color: string;
  archived: boolean;
  createdAt: string;
  version: number;
}

export interface AccountInput {
  name: string;
  type: AccountType;
  initialBalance: number;
  color: string;
  archived: boolean;
  version?: number;
}

export interface Category {
  id: number;
  name: string;
  type: CategoryType;
  parentId: number | null;
  icon: string;
  color: string;
  version: number;
}

export interface CategoryInput {
  name: string;
  type: CategoryType;
  parentId: number | null;
  icon: string;
  color: string;
  version?: number;
}

export interface Transaction {
  id: number;
  type: TransactionType;
  amount: number;
  date: string;
  accountId: number;
  toAccountId: number | null;
  categoryId: number | null;
  note: string | null;
  recurringId: number | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface TransactionInput {
  type: TransactionType;
  amount: number;
  date: string;
  accountId: number;
  toAccountId?: number | null;
  categoryId?: number | null;
  note?: string | null;
  version?: number;
}

export interface TransactionFilter {
  from?: string;
  to?: string;
  type?: TransactionType;
  accountId?: number;
  categoryId?: number;
  minAmount?: number;
  maxAmount?: number;
  q?: string;
  page?: number;
  size?: number;
  sort?: 'date' | 'amount';
  direction?: 'asc' | 'desc';
}

export interface TransactionPage {
  content: Transaction[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  totalIncome: number;
  totalExpense: number;
}

export interface Recurring {
  id: number;
  name: string;
  type: TransactionType;
  amount: number;
  accountId: number;
  categoryId: number;
  note: string | null;
  frequency: Frequency;
  intervalCount: number;
  startDate: string;
  nextDate: string;
  endDate: string | null;
  autoCreate: boolean;
  active: boolean;
  due: boolean;
  version: number;
}

export interface RecurringInput {
  name: string;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  accountId: number;
  categoryId: number;
  note?: string | null;
  frequency: Frequency;
  intervalCount: number;
  startDate: string;
  endDate?: string | null;
  autoCreate: boolean;
  active?: boolean;
  version?: number;
}

export interface UpcomingPayment {
  recurringId: number;
  name: string;
  type: TransactionType;
  amount: number;
  date: string;
  accountId: number;
  categoryId: number;
  autoCreate: boolean;
  overdue: boolean;
}

export interface BudgetStatus {
  id: number;
  categoryId: number;
  amount: number;
  rollover: boolean;
  alertThreshold: number;
  month: string;
  limit: number;
  carriedOver: number;
  available: number;
  spent: number;
  remaining: number;
  percent: number;
  state: BudgetState;
  version: number;
}

export interface BudgetInput {
  categoryId: number;
  amount: number;
  rollover: boolean;
  alertThreshold: number;
  version?: number;
}

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationList {
  items: AppNotification[];
  unreadCount: number;
}

export interface Summary {
  from: string;
  to: string;
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
  totalBalance: number;
}

export interface CategoryShare {
  categoryId: number | null;
  name: string;
  icon: string;
  color: string;
  amount: number;
  percent: number;
  hasChildren: boolean;
}

export interface MonthlyPoint {
  month: string;
  income: number;
  expense: number;
  net: number;
  /** null — місяць до початку обліку */
  incomeTrend: number | null;
  expenseTrend: number | null;
}

export interface MonthlyDynamics {
  points: MonthlyPoint[];
  incomeSlope: number;
  expenseSlope: number;
  averageIncome: number;
  averageExpense: number;
}

export interface ForecastPoint {
  date: string;
  actual: number | null;
  projected: number | null;
}

export interface Forecast {
  today: string;
  monthEnd: string;
  daysInMonth: number;
  daysElapsed: number;
  daysLeft: number;
  currentBalance: number;
  incomeToDate: number;
  expenseToDate: number;
  averageDailyExpense: number;
  plannedIncome: number;
  plannedExpense: number;
  recurringIncome: number;
  recurringExpense: number;
  projectedIncome: number;
  projectedExpense: number;
  projectedEndBalance: number;
  upcoming: UpcomingPayment[];
  series: ForecastPoint[];
}

export type ImportRowStatus = 'OK' | 'DUPLICATE' | 'ERROR';

export interface ImportRow {
  line: number;
  date: string | null;
  type: TransactionType | null;
  amount: number | null;
  account: string | null;
  category: string | null;
  subcategory: string | null;
  toAccount: string | null;
  note: string | null;
  status: ImportRowStatus;
  message: string | null;
}

export interface ImportResult {
  dryRun: boolean;
  encoding: string;
  delimiter: string;
  columns: Record<string, string>;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  errorRows: number;
  imported: number;
  newAccounts: string[];
  newCategories: string[];
  needsDefaultAccount: boolean;
  preview: ImportRow[];
  errors: ImportRow[];
}

export interface SyncMessage {
  entity: string;
  action: string;
  id: number | null;
  originClientId: string | null;
  timestamp: string;
}
