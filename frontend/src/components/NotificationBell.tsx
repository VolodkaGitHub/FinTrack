import { ActionIcon, Box, Button, Divider, Group, Indicator, Popover, ScrollArea, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import {
  IconAlertTriangle,
  IconBell,
  IconCalendarDue,
  IconFileImport,
  IconPigMoney,
  IconRepeat,
  IconTrash,
  IconTrendingUp,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { notificationsApi } from '../api/endpoints';
import { useEntityMutation, useNotifications } from '../api/hooks';
import type { NotificationType } from '../api/types';
import { notificationColor } from '../sync/SyncProvider';
import type { IconComponent } from './icons';

const TYPE_ICONS: Record<NotificationType, IconComponent> = {
  BUDGET_WARNING: IconTrendingUp,
  BUDGET_EXCEEDED: IconAlertTriangle,
  BUDGET_ROLLOVER: IconPigMoney,
  RECURRING_CREATED: IconRepeat,
  RECURRING_DUE: IconCalendarDue,
  IMPORT_COMPLETED: IconFileImport,
};

/** REQ-2.3: центр сповіщень (бюджети, регулярні платежі, імпорт). */
export function NotificationBell() {
  const { data } = useNotifications();
  const markAll = useEntityMutation('notifications', (_: void) => notificationsApi.markAllRead());
  const markRead = useEntityMutation('notifications', (id: number) => notificationsApi.markRead(id));
  const remove = useEntityMutation('notifications', (id: number) => notificationsApi.remove(id));
  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  return (
    <Popover width={380} position="bottom-end" shadow="md" withArrow>
      <Popover.Target>
        <Indicator label={unread > 99 ? '99+' : unread} size={17} disabled={unread === 0} color="red" offset={5}>
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Сповіщення">
            <IconBell size={20} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <Group justify="space-between" px="md" py="sm">
          <Text fw={600}>Сповіщення</Text>
          {unread > 0 && (
            <Button variant="subtle" size="compact-xs" onClick={() => markAll.mutate()}>
              Позначити всі прочитаними
            </Button>
          )}
        </Group>
        <Divider />
        <ScrollArea.Autosize mah={420}>
          {items.length === 0 ? (
            <Text c="dimmed" size="sm" p="lg" ta="center">
              Сповіщень поки немає
            </Text>
          ) : (
            <Stack gap={0}>
              {items.map((item) => {
                const Icon = TYPE_ICONS[item.type] ?? IconBell;
                return (
                  <Group
                    key={item.id}
                    wrap="nowrap"
                    align="flex-start"
                    gap="sm"
                    px="md"
                    py="sm"
                    style={{
                      borderBottom: '1px solid var(--mantine-color-default-border)',
                      background: item.read ? undefined : 'var(--mantine-primary-color-light)',
                    }}
                  >
                    <ThemeIcon color={notificationColor(item.type)} variant="light" radius="xl" size={32}>
                      <Icon size={18} />
                    </ThemeIcon>
                    <UnstyledButton style={{ flex: 1 }} onClick={() => !item.read && markRead.mutate(item.id)}>
                      <Text size="sm" fw={600}>
                        {item.title}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {item.message}
                      </Text>
                      <Text size="xs" c="dimmed" mt={4}>
                        {dayjs(item.createdAt).fromNow()}
                      </Text>
                    </UnstyledButton>
                    <Box>
                      <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Видалити сповіщення" onClick={() => remove.mutate(item.id)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Box>
                  </Group>
                );
              })}
            </Stack>
          )}
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}
