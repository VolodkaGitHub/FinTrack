import { notifications } from '@mantine/notifications';
import { Client } from '@stomp/stompjs';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { clientId } from '../api/client';
import { invalidateEntity } from '../api/hooks';
import type { AppNotification, NotificationType, SyncMessage } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { currentSessionId, getAccessToken } from '../auth/tokens';

export type SyncStatus = 'connecting' | 'online' | 'offline';

const SyncContext = createContext<SyncStatus>('connecting');

const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  BUDGET_WARNING: 'orange',
  BUDGET_EXCEEDED: 'red',
  BUDGET_ROLLOVER: 'grape',
  RECURRING_CREATED: 'blue',
  RECURRING_DUE: 'indigo',
  IMPORT_COMPLETED: 'teal',
};

export const notificationColor = (type: NotificationType) => NOTIFICATION_COLORS[type] ?? 'blue';

/**
 * REQ-4.2: синхронізація між пристроями в реальному часі. Сервер надсилає подію про кожну зміну даних акаунта —
 * інші пристрої оновлюють відповідні дані; сповіщення (REQ-2.3) приходять тим самим каналом.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const [status, setStatus] = useState<SyncStatus>('connecting');

  useEffect(() => {
    let connectedBefore = false;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const client = new Client({
      brokerURL: `${protocol}://${window.location.host}/ws`,
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      beforeConnect: async () => {
        const token = await getAccessToken();
        client.connectHeaders = token ? { Authorization: `Bearer ${token}` } : {};
      },
      onConnect: () => {
        setStatus('online');
        client.subscribe('/user/queue/sync', (frame) => {
          const event = JSON.parse(frame.body) as SyncMessage;
          if (event.entity === 'session') {
            if (event.action === 'revoked' && event.id === currentSessionId()) {
              notifications.show({ color: 'orange', title: 'Сеанс завершено', message: 'Вихід виконано з іншого пристрою.' });
              void logout(false);
            } else {
              void queryClient.invalidateQueries({ queryKey: ['sessions'] });
            }
            return;
          }
          if (event.originClientId !== clientId) {
            invalidateEntity(queryClient, event.entity);
          }
        });
        client.subscribe('/user/queue/notifications', (frame) => {
          const notification = JSON.parse(frame.body) as AppNotification;
          void queryClient.invalidateQueries({ queryKey: ['notifications'] });
          notifications.show({
            color: notificationColor(notification.type),
            title: notification.title,
            message: notification.message,
            autoClose: 8000,
          });
          showSystemNotification(notification);
        });
        // після перепідключення (наприклад, ноутбук прокинувся) — підтягуємо все, що змінилось за цей час
        if (connectedBefore) {
          void queryClient.invalidateQueries();
        }
        connectedBefore = true;
      },
      onWebSocketClose: () => setStatus('offline'),
      onStompError: () => setStatus('offline'),
    });
    client.activate();
    return () => {
      void client.deactivate();
    };
  }, [queryClient, logout]);

  return <SyncContext.Provider value={status}>{children}</SyncContext.Provider>;
}

export function useSyncStatus(): SyncStatus {
  return useContext(SyncContext);
}

function showSystemNotification(notification: AppNotification) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) {
    return;
  }
  try {
    new Notification(notification.title, { body: notification.message, icon: '/favicon.svg', tag: `fintrack-${notification.id}` });
  } catch {
    // деякі мобільні браузери дозволяють сповіщення лише через Service Worker
  }
}
