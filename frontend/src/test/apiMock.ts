import type { AxiosResponse } from 'axios';
import { vi } from 'vitest';
import type { AccountInput, BudgetInput, CategoryInput, RecurringInput, TransactionInput } from '../api/types';
import * as fx from './fixtures';

/** Відповідь із файлом, як її повертає axios для responseType=blob. */
export const fileResponse = (name: string) =>
  ({
    data: new Blob(['file'], { type: 'application/octet-stream' }),
    status: 200,
    statusText: 'OK',
    headers: { 'content-disposition': `attachment; filename="${name}"` },
  }) as unknown as AxiosResponse<Blob>;

/** Замінник модуля api/endpoints: кожна функція — vi.fn з типовою відповіддю з fixtures. */
export const endpoints = {
  authApi: {
    providers: vi.fn(async () => ({ google: true })),
    login: vi.fn(async (_email: string, _password: string) => ({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 900, user: fx.user })),
    register: vi.fn(async (_input: { email: string; password: string; displayName: string }) => ({ message: 'ok' })),
    verifyEmail: vi.fn(async (_token: string) => ({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 900, user: fx.user })),
    resendVerification: vi.fn(async (_email: string) => ({})),
    logout: vi.fn(async (_refreshToken: string) => ({})),
  },
  userApi: {
    me: vi.fn(async () => fx.user),
    update: vi.fn(async (input: { displayName: string; currency: string }) => ({ ...fx.user, ...input })),
    changePassword: vi.fn(async (_input: { currentPassword?: string; newPassword: string }) => ({})),
    sessions: vi.fn(async () => fx.sessions),
    revokeSession: vi.fn(async (_id: number) => ({})),
  },
  accountsApi: {
    list: vi.fn(async () => fx.accounts),
    create: vi.fn(async (input: AccountInput) => ({ ...fx.accounts[0], ...input, id: 99 })),
    update: vi.fn(async (id: number, input: AccountInput) => ({ ...fx.accounts[0], ...input, id })),
    remove: vi.fn(async (_id: number) => ({})),
  },
  categoriesApi: {
    list: vi.fn(async () => fx.categories),
    create: vi.fn(async (input: CategoryInput) => ({ ...fx.categories[0], ...input, id: 99 })),
    update: vi.fn(async (id: number, input: CategoryInput) => ({ ...fx.categories[0], ...input, id })),
    remove: vi.fn(async (_id: number) => ({})),
  },
  transactionsApi: {
    search: vi.fn(async (_filter: object) => fx.transactionPage),
    create: vi.fn(async (input: TransactionInput) => ({ ...fx.transactions[1], ...input, id: 199 })),
    update: vi.fn(async (id: number, input: TransactionInput) => ({ ...fx.transactions[1], ...input, id })),
    remove: vi.fn(async (_id: number) => ({})),
  },
  recurringApi: {
    list: vi.fn(async () => fx.recurring),
    upcoming: vi.fn(async (_days: number) => fx.upcoming),
    create: vi.fn(async (input: RecurringInput) => ({ ...fx.recurring[0], ...input, id: 399 })),
    update: vi.fn(async (id: number, input: RecurringInput) => ({ ...fx.recurring[0], ...input, id })),
    remove: vi.fn(async (_id: number) => ({})),
    apply: vi.fn(async (_id: number, _input: { date?: string; amount?: number } = {}) => fx.transactions[1]),
    skip: vi.fn(async (id: number) => ({ ...fx.recurring[0], id })),
  },
  budgetsApi: {
    list: vi.fn(async (_month: string) => fx.budgets),
    create: vi.fn(async (input: BudgetInput) => ({ ...fx.budgets[0], ...input, id: 499 })),
    update: vi.fn(async (id: number, input: BudgetInput) => ({ ...fx.budgets[0], ...input, id })),
    remove: vi.fn(async (_id: number) => ({})),
  },
  notificationsApi: {
    list: vi.fn(async (_limit?: number) => fx.notificationList),
    markRead: vi.fn(async (_id: number) => ({})),
    markAllRead: vi.fn(async () => ({})),
    remove: vi.fn(async (_id: number) => ({})),
  },
  analyticsApi: {
    summary: vi.fn(async (_from: string, _to: string) => fx.summary),
    categories: vi.fn(async (_from: string, _to: string, _type: string, _parentId?: number | null) => fx.shares),
    monthly: vi.fn(async (_from: string, _to: string) => fx.monthly),
    forecast: vi.fn(async () => fx.forecast),
  },
  reportsApi: {
    summary: vi.fn(async (_from: string, _to: string, format: 'pdf' | 'xlsx') => fileResponse(`report.${format}`)),
  },
  dataApi: {
    exportCsv: vi.fn(async (_params: object) => fileResponse('export.csv')),
    importCsv: vi.fn(async (_file: File, options: { dryRun: boolean }) => ({
      ...fx.importPreview,
      dryRun: options.dryRun,
      imported: options.dryRun ? 0 : 2,
    })),
  },
};
