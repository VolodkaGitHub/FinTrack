import { notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientId } from '../api/client';
import { notificationColor, SyncProvider, useSyncStatus } from './SyncProvider';

interface FakeClient {
  config: {
    brokerURL: string;
    beforeConnect: (client: unknown) => Promise<void>;
    onConnect: () => void;
    onWebSocketClose: () => void;
    onStompError: () => void;
  };
  connectHeaders: Record<string, string>;
  handlers: Map<string, (frame: { body: string }) => void>;
  activate: ReturnType<typeof vi.fn>;
  deactivate: ReturnType<typeof vi.fn>;
}

const { clients, logout } = vi.hoisted(() => ({ clients: [] as FakeClient[], logout: vi.fn() }));

vi.mock('@stomp/stompjs', () => ({
  Client: class {
    config: FakeClient['config'];
    connectHeaders: Record<string, string> = {};
    handlers = new Map<string, (frame: { body: string }) => void>();
    activate = vi.fn();
    deactivate = vi.fn(async () => undefined);
    constructor(config: FakeClient['config']) {
      this.config = config;
      clients.push(this as unknown as FakeClient);
    }
    subscribe(destination: string, handler: (frame: { body: string }) => void) {
      this.handlers.set(destination, handler);
      return { unsubscribe: vi.fn() };
    }
  },
}));
vi.mock('../auth/tokens', () => ({ getAccessToken: vi.fn(async () => 'access-token'), currentSessionId: () => 42 }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ logout }) }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

function Status() {
  return <span data-testid="status">{useSyncStatus()}</span>;
}

function renderSync() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SyncProvider>
        <Status />
      </SyncProvider>
    </QueryClientProvider>,
  );
  const client = clients[clients.length - 1];
  return { view, client, invalidate };
}

const frame = (body: object) => ({ body: JSON.stringify(body) });

describe('SyncProvider (REQ-4.2)', () => {
  beforeEach(() => {
    clients.length = 0;
    logout.mockClear();
    vi.mocked(notifications.show).mockClear();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'Notification');
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  it('connects with the access token and reports connection status', async () => {
    const { client, view } = renderSync();
    expect(client.config.brokerURL).toBe('ws://localhost:3000/ws');
    expect(client.activate).toHaveBeenCalled();
    expect(screen.getByTestId('status')).toHaveTextContent('connecting');

    await client.config.beforeConnect(client);
    expect(client.connectHeaders).toEqual({ Authorization: 'Bearer access-token' });
    act(() => client.config.onConnect());
    expect(screen.getByTestId('status')).toHaveTextContent('online');
    act(() => client.config.onWebSocketClose());
    expect(screen.getByTestId('status')).toHaveTextContent('offline');
    act(() => client.config.onConnect());
    act(() => client.config.onStompError());
    expect(screen.getByTestId('status')).toHaveTextContent('offline');

    view.unmount();
    expect(client.deactivate).toHaveBeenCalled();
  });

  it('refreshes data changed on other devices but ignores own changes', () => {
    const { client, invalidate } = renderSync();
    act(() => client.config.onConnect());
    const sync = client.handlers.get('/user/queue/sync')!;

    act(() => sync(frame({ entity: 'budgets', action: 'updated', id: 1, originClientId: 'other-device' })));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['budgets'] });

    invalidate.mockClear();
    act(() => sync(frame({ entity: 'transactions', action: 'created', id: 2, originClientId: clientId })));
    expect(invalidate).not.toHaveBeenCalled();

    act(() => sync(frame({ entity: 'session', action: 'revoked', id: 7, originClientId: null })));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sessions'] });
    expect(logout).not.toHaveBeenCalled();

    act(() => sync(frame({ entity: 'session', action: 'revoked', id: 42, originClientId: null })));
    expect(logout).toHaveBeenCalledWith(false);

    // повторне підключення підтягує все, що змінилося, поки пристрій був офлайн
    invalidate.mockClear();
    act(() => client.config.onConnect());
    expect(invalidate).toHaveBeenCalledWith();
  });

  it('shows notifications as toasts and system notifications when the tab is hidden', () => {
    const shown = vi.fn();
    class FakeNotification {
      static permission = 'granted';
      constructor(title: string, options: { body: string }) {
        shown(title, options.body);
      }
    }
    Object.defineProperty(globalThis, 'Notification', { value: FakeNotification, configurable: true });
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });

    const { client, invalidate } = renderSync();
    act(() => client.config.onConnect());
    act(() =>
      client.handlers.get('/user/queue/notifications')!(
        frame({ id: 9, type: 'BUDGET_EXCEEDED', title: 'Перевищено бюджет «Кафе»', message: 'Витрачено 1 200 з 1 000', read: false }),
      ),
    );
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'red', title: 'Перевищено бюджет «Кафе»', message: 'Витрачено 1 200 з 1 000' }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] });
    expect(shown).toHaveBeenCalledWith('Перевищено бюджет «Кафе»', 'Витрачено 1 200 з 1 000');
  });

  it('maps notification types to colors', () => {
    expect(notificationColor('BUDGET_WARNING')).toBe('orange');
    expect(notificationColor('IMPORT_COMPLETED')).toBe('teal');
  });
});
