import { notifications } from '@mantine/notifications';
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { errorMessage } from './client';
import {
  accountsApi,
  analyticsApi,
  budgetsApi,
  categoriesApi,
  notificationsApi,
  recurringApi,
  transactionsApi,
  userApi,
} from './endpoints';
import type { Account, Category, CategoryType, TransactionFilter } from './types';

export const keys = {
  me: ['me'] as const,
  sessions: ['sessions'] as const,
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  transactions: (filter: TransactionFilter) => ['transactions', filter] as const,
  recurring: ['recurring'] as const,
  upcoming: (days: number) => ['recurring', 'upcoming', days] as const,
  budgets: (month: string) => ['budgets', month] as const,
  notifications: ['notifications'] as const,
  summary: (from: string, to: string) => ['analytics', 'summary', from, to] as const,
  shares: (from: string, to: string, type: CategoryType, parentId: number | null) =>
    ['analytics', 'categories', from, to, type, parentId] as const,
  monthly: (from: string, to: string) => ['analytics', 'monthly', from, to] as const,
  forecast: ['analytics', 'forecast'] as const,
};

/** Які кеші застаріли після зміни сутності (локально або на іншому пристрої — REQ-4.2). */
const RELATED: Record<string, string[]> = {
  transactions: ['transactions', 'accounts', 'budgets', 'analytics', 'recurring'],
  accounts: ['accounts', 'transactions', 'analytics'],
  categories: ['categories', 'budgets', 'analytics', 'transactions'],
  budgets: ['budgets'],
  recurring: ['recurring', 'analytics', 'transactions'],
  notifications: ['notifications'],
  user: ['me'],
};

export function invalidateEntity(queryClient: QueryClient, entity: string) {
  for (const key of RELATED[entity] ?? [entity]) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: userApi.me });
export const useSessions = () => useQuery({ queryKey: keys.sessions, queryFn: userApi.sessions });
export const useAccounts = () => useQuery({ queryKey: keys.accounts, queryFn: accountsApi.list });
export const useCategories = () => useQuery({ queryKey: keys.categories, queryFn: categoriesApi.list });
export const useRecurring = () => useQuery({ queryKey: keys.recurring, queryFn: recurringApi.list });
export const useUpcoming = (days: number) =>
  useQuery({ queryKey: keys.upcoming(days), queryFn: () => recurringApi.upcoming(days) });
export const useBudgets = (month: string) =>
  useQuery({ queryKey: keys.budgets(month), queryFn: () => budgetsApi.list(month), placeholderData: keepPreviousData });
export const useNotifications = () => useQuery({ queryKey: keys.notifications, queryFn: () => notificationsApi.list() });
export const useTransactions = (filter: TransactionFilter) =>
  useQuery({
    queryKey: keys.transactions(filter),
    queryFn: () => transactionsApi.search(filter),
    placeholderData: keepPreviousData,
  });
export const useSummary = (from: string, to: string) =>
  useQuery({ queryKey: keys.summary(from, to), queryFn: () => analyticsApi.summary(from, to) });
export const useCategoryShares = (from: string, to: string, type: CategoryType, parentId: number | null = null) =>
  useQuery({
    queryKey: keys.shares(from, to, type, parentId),
    queryFn: () => analyticsApi.categories(from, to, type, parentId),
    placeholderData: keepPreviousData,
  });
export const useMonthly = (from: string, to: string) =>
  useQuery({ queryKey: keys.monthly(from, to), queryFn: () => analyticsApi.monthly(from, to), placeholderData: keepPreviousData });
export const useForecast = () => useQuery({ queryKey: keys.forecast, queryFn: analyticsApi.forecast });

/** Мутація з інвалідацією пов'язаних даних, повідомленням про успіх і показом помилки сервера. */
export function useEntityMutation<TVariables, TResult>(
  entity: string,
  mutationFn: (variables: TVariables) => Promise<TResult>,
  options: { success?: string; onSuccess?: (result: TResult, variables: TVariables) => void } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (result, variables) => {
      invalidateEntity(queryClient, entity);
      if (options.success) {
        notifications.show({ color: 'teal', message: options.success });
      }
      options.onSuccess?.(result, variables);
    },
    onError: (error) => {
      notifications.show({ color: 'red', title: 'Не вдалося виконати дію', message: errorMessage(error) });
    },
  });
}

/** Довідники для відображення назв рахунків і категорій за їхніми id. */
export function useLookups() {
  const accounts = useAccounts();
  const categories = useCategories();
  return useMemo(() => {
    const accountById = new Map<number, Account>((accounts.data ?? []).map((a) => [a.id, a]));
    const categoryById = new Map<number, Category>((categories.data ?? []).map((c) => [c.id, c]));
    return {
      accounts: accounts.data ?? [],
      categories: categories.data ?? [],
      accountById,
      categoryById,
      loading: accounts.isLoading || categories.isLoading,
    };
  }, [accounts.data, categories.data, accounts.isLoading, categories.isLoading]);
}
