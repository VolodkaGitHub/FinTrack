import { notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateEntity, useEntityMutation, useLookups } from './hooks';

vi.mock('./endpoints', async () => (await import('../test/apiMock')).endpoints);
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

const createClient = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

describe('query hooks', () => {
  beforeEach(() => {
    vi.mocked(notifications.show).mockClear();
  });

  it('invalidates data related to a changed entity (REQ-4.2)', () => {
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    invalidateEntity(client, 'transactions');
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ['transactions'], ['accounts'], ['budgets'], ['analytics'], ['recurring'],
    ]);
    invalidate.mockClear();
    invalidateEntity(client, 'sessions');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sessions'] });
  });

  it('shows success, invalidates caches and calls onSuccess after a mutation', async () => {
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () => useEntityMutation('accounts', async (name: string) => ({ name }), { success: 'Збережено', onSuccess }),
      { wrapper: wrapperFor(client) },
    );
    await act(() => result.current.mutateAsync('Картка'));
    expect(onSuccess).toHaveBeenCalledWith({ name: 'Картка' }, 'Картка');
    expect(notifications.show).toHaveBeenCalledWith({ color: 'teal', message: 'Збережено' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['accounts'] });
  });

  it('shows the server error message when a mutation fails', async () => {
    const error = new AxiosError('Not found', 'ERR_BAD_REQUEST', undefined, null, {
      status: 404,
      data: { detail: 'Рахунок не знайдено' },
    } as AxiosResponse);
    const { result } = renderHook(() => useEntityMutation('accounts', async (_: void) => Promise.reject(error)), {
      wrapper: wrapperFor(createClient()),
    });
    act(() => result.current.mutate());
    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ color: 'red', message: 'Рахунок не знайдено' })),
    );
  });

  it('builds lookup maps for accounts and categories', async () => {
    const { result } = renderHook(() => useLookups(), { wrapper: wrapperFor(createClient()) });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accountById.get(2)?.name).toBe('Банківська картка');
    expect(result.current.categoryById.get(11)?.parentId).toBe(10);
  });
});
