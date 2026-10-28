import { api } from './client';
import type {
  Account,
  AccountInput,
  AppNotification,
  AuthResponse,
  BudgetInput,
  BudgetStatus,
  Category,
  CategoryInput,
  CategoryShare,
  CategoryType,
  Forecast,
  ImportResult,
  MonthlyDynamics,
  NotificationList,
  Recurring,
  RecurringInput,
  Session,
  Summary,
  Transaction,
  TransactionFilter,
  TransactionInput,
  TransactionPage,
  UpcomingPayment,
  User,
} from './types';

function clean(params: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

export const authApi = {
  providers: () => api.get<{ google: boolean }>('/auth/providers').then((r) => r.data),
  login: (email: string, password: string) => api.post<AuthResponse>('/auth/login', { email, password }).then((r) => r.data),
  register: (input: { email: string; password: string; displayName: string }) =>
    api.post<{ message: string }>('/auth/register', input).then((r) => r.data),
  verifyEmail: (token: string) => api.post<AuthResponse>('/auth/verify-email', { token }).then((r) => r.data),
  resendVerification: (email: string) => api.post('/auth/resend-verification', { email }),
  logout: (refreshToken: string) => api.post('/auth/logout', { refreshToken }),
};

export const userApi = {
  me: () => api.get<User>('/users/me').then((r) => r.data),
  update: (input: { displayName: string; currency: string }) => api.put<User>('/users/me', input).then((r) => r.data),
  changePassword: (input: { currentPassword?: string; newPassword: string }) => api.put('/users/me/password', input),
  sessions: () => api.get<Session[]>('/users/me/sessions').then((r) => r.data),
  revokeSession: (id: number) => api.delete(`/users/me/sessions/${id}`),
};

export const accountsApi = {
  list: () => api.get<Account[]>('/accounts').then((r) => r.data),
  create: (input: AccountInput) => api.post<Account>('/accounts', input).then((r) => r.data),
  update: (id: number, input: AccountInput) => api.put<Account>(`/accounts/${id}`, input).then((r) => r.data),
  remove: (id: number) => api.delete(`/accounts/${id}`),
};

export const categoriesApi = {
  list: () => api.get<Category[]>('/categories').then((r) => r.data),
  create: (input: CategoryInput) => api.post<Category>('/categories', input).then((r) => r.data),
  update: (id: number, input: CategoryInput) => api.put<Category>(`/categories/${id}`, input).then((r) => r.data),
  remove: (id: number) => api.delete(`/categories/${id}`),
};

export const transactionsApi = {
  search: (filter: TransactionFilter) =>
    api.get<TransactionPage>('/transactions', { params: clean(filter) }).then((r) => r.data),
  create: (input: TransactionInput) => api.post<Transaction>('/transactions', input).then((r) => r.data),
  update: (id: number, input: TransactionInput) => api.put<Transaction>(`/transactions/${id}`, input).then((r) => r.data),
  remove: (id: number) => api.delete(`/transactions/${id}`),
};

export const recurringApi = {
  list: () => api.get<Recurring[]>('/recurring').then((r) => r.data),
  upcoming: (days: number) => api.get<UpcomingPayment[]>('/recurring/upcoming', { params: { days } }).then((r) => r.data),
  create: (input: RecurringInput) => api.post<Recurring>('/recurring', input).then((r) => r.data),
  update: (id: number, input: RecurringInput) => api.put<Recurring>(`/recurring/${id}`, input).then((r) => r.data),
  remove: (id: number) => api.delete(`/recurring/${id}`),
  apply: (id: number, input: { date?: string; amount?: number } = {}) =>
    api.post<Transaction>(`/recurring/${id}/apply`, input).then((r) => r.data),
  skip: (id: number) => api.post<Recurring>(`/recurring/${id}/skip`).then((r) => r.data),
};

export const budgetsApi = {
  list: (month: string) => api.get<BudgetStatus[]>('/budgets', { params: { month } }).then((r) => r.data),
  create: (input: BudgetInput) => api.post<BudgetStatus>('/budgets', input).then((r) => r.data),
  update: (id: number, input: BudgetInput) => api.put<BudgetStatus>(`/budgets/${id}`, input).then((r) => r.data),
  remove: (id: number) => api.delete(`/budgets/${id}`),
};

export const notificationsApi = {
  list: (limit = 30) => api.get<NotificationList>('/notifications', { params: { limit } }).then((r) => r.data),
  markRead: (id: number) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  remove: (id: number) => api.delete(`/notifications/${id}`),
};

export const analyticsApi = {
  summary: (from: string, to: string) => api.get<Summary>('/analytics/summary', { params: { from, to } }).then((r) => r.data),
  categories: (from: string, to: string, type: CategoryType, parentId?: number | null) =>
    api
      .get<CategoryShare[]>('/analytics/categories', { params: clean({ from, to, type, parentId }) })
      .then((r) => r.data),
  monthly: (from: string, to: string) =>
    api.get<MonthlyDynamics>('/analytics/monthly', { params: { from, to } }).then((r) => r.data),
  forecast: () => api.get<Forecast>('/analytics/forecast').then((r) => r.data),
};

export const reportsApi = {
  summary: (from: string, to: string, format: 'pdf' | 'xlsx') =>
    api.get<Blob>('/reports/summary', { params: { from, to, format }, responseType: 'blob' }),
};

export const dataApi = {
  exportCsv: (params: { from?: string; to?: string; delimiter: 'comma' | 'semicolon' }) =>
    api.get<Blob>('/data/export', { params: clean(params), responseType: 'blob' }),
  importCsv: (
    file: File,
    options: { dryRun: boolean; createMissing: boolean; skipDuplicates: boolean; defaultAccountId?: number | null },
  ) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ImportResult>('/data/import', form, { params: clean(options) }).then((r) => r.data);
  },
};

export type { AppNotification };
