import type { InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import {
  accountsApi,
  analyticsApi,
  authApi,
  budgetsApi,
  categoriesApi,
  dataApi,
  notificationsApi,
  recurringApi,
  reportsApi,
  transactionsApi,
  userApi,
} from './endpoints';
import type { AccountInput, BudgetInput, CategoryInput, RecurringInput, TransactionInput } from './types';

vi.mock('../auth/tokens', () => ({ getAccessToken: vi.fn(async () => 'token'), refreshAccessToken: vi.fn() }));

const requests: InternalAxiosRequestConfig[] = [];

beforeEach(() => {
  requests.length = 0;
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    requests.push(config);
    return { data: { url: config.url }, status: 200, statusText: 'OK', headers: {}, config };
  };
});

interface Expected {
  method: string;
  url: string;
  params?: Record<string, unknown>;
  body?: unknown;
  responseType?: string;
}

const account: AccountInput = { name: 'Картка', type: 'CARD', initialBalance: 0, color: '#1971c2', archived: false };
const category: CategoryInput = { name: 'Кава', type: 'EXPENSE', parentId: null, icon: 'coffee', color: '#f08c00' };
const transaction: TransactionInput = { type: 'EXPENSE', amount: 50, date: '2025-03-01', accountId: 1, categoryId: 2 };
const recurring: RecurringInput = {
  name: 'Netflix', type: 'EXPENSE', amount: 299, accountId: 1, categoryId: 2, frequency: 'MONTHLY', intervalCount: 1,
  startDate: '2025-03-01', autoCreate: true,
};
const budget: BudgetInput = { categoryId: 2, amount: 1000, rollover: true, alertThreshold: 80 };

const cases: Array<[string, () => Promise<unknown>, Expected]> = [
  ['auth providers', () => authApi.providers(), { method: 'get', url: '/auth/providers' }],
  ['login', () => authApi.login('a@b.c', 'secret123'), { method: 'post', url: '/auth/login', body: { email: 'a@b.c', password: 'secret123' } }],
  ['register', () => authApi.register({ email: 'a@b.c', password: 'p', displayName: 'A' }), { method: 'post', url: '/auth/register', body: { email: 'a@b.c', password: 'p', displayName: 'A' } }],
  ['verify e-mail', () => authApi.verifyEmail('tok'), { method: 'post', url: '/auth/verify-email', body: { token: 'tok' } }],
  ['resend verification', () => authApi.resendVerification('a@b.c'), { method: 'post', url: '/auth/resend-verification', body: { email: 'a@b.c' } }],
  ['logout', () => authApi.logout('r'), { method: 'post', url: '/auth/logout', body: { refreshToken: 'r' } }],
  ['profile', () => userApi.me(), { method: 'get', url: '/users/me' }],
  ['update profile', () => userApi.update({ displayName: 'A', currency: 'USD' }), { method: 'put', url: '/users/me', body: { displayName: 'A', currency: 'USD' } }],
  ['change password', () => userApi.changePassword({ newPassword: 'x' }), { method: 'put', url: '/users/me/password', body: { newPassword: 'x' } }],
  ['sessions', () => userApi.sessions(), { method: 'get', url: '/users/me/sessions' }],
  ['revoke session', () => userApi.revokeSession(2), { method: 'delete', url: '/users/me/sessions/2' }],
  ['accounts', () => accountsApi.list(), { method: 'get', url: '/accounts' }],
  ['create account', () => accountsApi.create(account), { method: 'post', url: '/accounts', body: account }],
  ['update account', () => accountsApi.update(1, account), { method: 'put', url: '/accounts/1', body: account }],
  ['delete account', () => accountsApi.remove(1), { method: 'delete', url: '/accounts/1' }],
  ['categories', () => categoriesApi.list(), { method: 'get', url: '/categories' }],
  ['create category', () => categoriesApi.create(category), { method: 'post', url: '/categories', body: category }],
  ['update category', () => categoriesApi.update(3, category), { method: 'put', url: '/categories/3', body: category }],
  ['delete category', () => categoriesApi.remove(3), { method: 'delete', url: '/categories/3' }],
  [
    'search transactions',
    () => transactionsApi.search({ from: '2025-03-01', type: 'EXPENSE', q: '', accountId: undefined, page: 0 }),
    { method: 'get', url: '/transactions', params: { from: '2025-03-01', type: 'EXPENSE', page: 0 } },
  ],
  ['create transaction', () => transactionsApi.create(transaction), { method: 'post', url: '/transactions', body: transaction }],
  ['update transaction', () => transactionsApi.update(9, transaction), { method: 'put', url: '/transactions/9', body: transaction }],
  ['delete transaction', () => transactionsApi.remove(9), { method: 'delete', url: '/transactions/9' }],
  ['recurring', () => recurringApi.list(), { method: 'get', url: '/recurring' }],
  ['upcoming payments', () => recurringApi.upcoming(14), { method: 'get', url: '/recurring/upcoming', params: { days: 14 } }],
  ['create recurring', () => recurringApi.create(recurring), { method: 'post', url: '/recurring', body: recurring }],
  ['update recurring', () => recurringApi.update(4, recurring), { method: 'put', url: '/recurring/4', body: recurring }],
  ['delete recurring', () => recurringApi.remove(4), { method: 'delete', url: '/recurring/4' }],
  ['apply recurring', () => recurringApi.apply(4, { amount: 310 }), { method: 'post', url: '/recurring/4/apply', body: { amount: 310 } }],
  ['apply recurring with defaults', () => recurringApi.apply(4), { method: 'post', url: '/recurring/4/apply', body: {} }],
  ['skip recurring', () => recurringApi.skip(4), { method: 'post', url: '/recurring/4/skip' }],
  ['budgets', () => budgetsApi.list('2025-03'), { method: 'get', url: '/budgets', params: { month: '2025-03' } }],
  ['create budget', () => budgetsApi.create(budget), { method: 'post', url: '/budgets', body: budget }],
  ['update budget', () => budgetsApi.update(5, budget), { method: 'put', url: '/budgets/5', body: budget }],
  ['delete budget', () => budgetsApi.remove(5), { method: 'delete', url: '/budgets/5' }],
  ['notifications', () => notificationsApi.list(), { method: 'get', url: '/notifications', params: { limit: 30 } }],
  ['mark notification read', () => notificationsApi.markRead(6), { method: 'post', url: '/notifications/6/read' }],
  ['mark all read', () => notificationsApi.markAllRead(), { method: 'post', url: '/notifications/read-all' }],
  ['delete notification', () => notificationsApi.remove(6), { method: 'delete', url: '/notifications/6' }],
  ['summary', () => analyticsApi.summary('2025-03-01', '2025-03-31'), { method: 'get', url: '/analytics/summary', params: { from: '2025-03-01', to: '2025-03-31' } }],
  [
    'category shares',
    () => analyticsApi.categories('2025-03-01', '2025-03-31', 'EXPENSE', null),
    { method: 'get', url: '/analytics/categories', params: { from: '2025-03-01', to: '2025-03-31', type: 'EXPENSE' } },
  ],
  [
    'category drill-down',
    () => analyticsApi.categories('2025-03-01', '2025-03-31', 'EXPENSE', 10),
    { method: 'get', url: '/analytics/categories', params: { from: '2025-03-01', to: '2025-03-31', type: 'EXPENSE', parentId: 10 } },
  ],
  ['monthly dynamics', () => analyticsApi.monthly('2024-04', '2025-03'), { method: 'get', url: '/analytics/monthly', params: { from: '2024-04', to: '2025-03' } }],
  ['forecast', () => analyticsApi.forecast(), { method: 'get', url: '/analytics/forecast' }],
  [
    'report',
    () => reportsApi.summary('2025-03-01', '2025-03-31', 'xlsx'),
    { method: 'get', url: '/reports/summary', params: { from: '2025-03-01', to: '2025-03-31', format: 'xlsx' }, responseType: 'blob' },
  ],
  [
    'CSV export',
    () => dataApi.exportCsv({ delimiter: 'semicolon', from: undefined }),
    { method: 'get', url: '/data/export', params: { delimiter: 'semicolon' }, responseType: 'blob' },
  ],
];

describe('REST endpoints', () => {
  it.each(cases)('%s', async (_name, call, expected) => {
    await call();
    const request = requests[requests.length - 1];
    expect(request.method).toBe(expected.method);
    expect(request.url).toBe(expected.url);
    expect(request.baseURL).toBe('/api');
    if (expected.params) {
      expect(request.params).toEqual(expected.params);
    }
    if (expected.body !== undefined) {
      expect(JSON.parse(request.data as string)).toEqual(expected.body);
    }
    if (expected.responseType) {
      expect(request.responseType).toBe(expected.responseType);
    }
  });

  it('returns response bodies for data endpoints', async () => {
    await expect(accountsApi.list()).resolves.toEqual({ url: '/accounts' });
    await expect(analyticsApi.forecast()).resolves.toEqual({ url: '/analytics/forecast' });
  });

  it('uploads CSV files as multipart form data', async () => {
    const file = new File(['date;amount'], 'bank.csv', { type: 'text/csv' });
    await dataApi.importCsv(file, { dryRun: true, createMissing: true, skipDuplicates: false, defaultAccountId: null });
    const request = requests[0];
    expect(request.url).toBe('/data/import');
    expect(request.data).toBeInstanceOf(FormData);
    expect((request.data as FormData).get('file')).toBeInstanceOf(File);
    expect(request.params).toEqual({ dryRun: true, createMissing: true, skipDuplicates: false });
  });
});
