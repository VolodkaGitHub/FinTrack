import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Burger,
  Button,
  Group,
  Menu,
  NavLink,
  Text,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconArrowsExchange,
  IconCategory,
  IconChartPie,
  IconLayoutDashboard,
  IconLock,
  IconLogout,
  IconMoon,
  IconPigMoney,
  IconPlus,
  IconRepeat,
  IconSettings,
  IconSun,
  IconWallet,
} from '@tabler/icons-react';
import { Suspense, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { useLock } from '../lock/LockProvider';
import { useSyncStatus } from '../sync/SyncProvider';
import { SectionLoader } from './common';
import { NotificationBell } from './NotificationBell';
import { TransactionFormModal } from './TransactionFormModal';

const NAV = [
  { to: '/', label: 'Огляд', icon: IconLayoutDashboard },
  { to: '/transactions', label: 'Операції', icon: IconArrowsExchange },
  { to: '/accounts', label: 'Рахунки', icon: IconWallet },
  { to: '/recurring', label: 'Регулярні платежі', icon: IconRepeat },
  { to: '/budgets', label: 'Бюджети', icon: IconPigMoney },
  { to: '/categories', label: 'Категорії', icon: IconCategory },
  { to: '/analytics', label: 'Аналітика і звіти', icon: IconChartPie },
  { to: '/settings', label: 'Налаштування', icon: IconSettings },
];

export function Logo() {
  return (
    <Group gap={8} wrap="nowrap">
      <img src="/favicon.svg" alt="" width={30} height={30} />
      <Text fw={800} fz={20} c="teal.7" style={{ letterSpacing: -0.5 }}>
        FinTrack
      </Text>
    </Group>
  );
}

function SyncIndicator() {
  const status = useSyncStatus();
  const config = {
    online: { color: 'teal', label: 'Синхронізовано', hint: 'Зміни з інших пристроїв з’являються миттєво' },
    connecting: { color: 'yellow', label: 'Підключення…', hint: 'Встановлюємо з’єднання для синхронізації' },
    offline: { color: 'gray', label: 'Офлайн', hint: 'Немає зв’язку для синхронізації — повторна спроба кожні 5 с' },
  }[status];
  return (
    <Tooltip label={config.hint} withArrow>
      <Badge variant="dot" color={config.color} visibleFrom="md" size="lg" radius="sm">
        {config.label}
      </Badge>
    </Tooltip>
  );
}

function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light');
  return (
    <Tooltip label={computed === 'dark' ? 'Світла тема' : 'Темна тема'} withArrow>
      <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Перемкнути тему" onClick={() => setColorScheme(computed === 'dark' ? 'light' : 'dark')}>
        {computed === 'dark' ? <IconSun size={20} /> : <IconMoon size={20} />}
      </ActionIcon>
    </Tooltip>
  );
}

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const [txOpened, setTxOpened] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();
  const lock = useLock();

  return (
    <AppShell header={{ height: 60 }} navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Меню" />
            <Logo />
          </Group>
          <Group gap={6} wrap="nowrap">
            <Button leftSection={<IconPlus size={16} />} onClick={() => setTxOpened(true)} visibleFrom="xs">
              Операція
            </Button>
            <ActionIcon hiddenFrom="xs" size="lg" onClick={() => setTxOpened(true)} aria-label="Нова операція">
              <IconPlus size={18} />
            </ActionIcon>
            <SyncIndicator />
            <NotificationBell />
            <ColorSchemeToggle />
            {lock.enabled && (
              <Tooltip label="Заблокувати застосунок" withArrow>
                <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Заблокувати" onClick={lock.lock}>
                  <IconLock size={20} />
                </ActionIcon>
              </Tooltip>
            )}
            <Menu position="bottom-end" width={220} shadow="md">
              <Menu.Target>
                <UnstyledButton aria-label="Меню користувача">
                  <Avatar color="teal" radius="xl" size={34}>
                    {user?.displayName.slice(0, 2).toUpperCase()}
                  </Avatar>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>
                  <Text size="sm" fw={600} c="var(--mantine-color-text)">
                    {user?.displayName}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {user?.email}
                  </Text>
                </Menu.Label>
                <Menu.Divider />
                <Menu.Item component={Link} to="/settings" leftSection={<IconSettings size={16} />}>
                  Налаштування
                </Menu.Item>
                <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={() => void logout()}>
                  Вийти
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <AppShell.Section grow>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              component={Link}
              to={item.to}
              label={item.label}
              leftSection={<item.icon size={19} stroke={1.7} />}
              active={item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)}
              onClick={close}
              style={{ borderRadius: 'var(--mantine-radius-md)' }}
              mb={2}
            />
          ))}
        </AppShell.Section>
        <AppShell.Section>
          <Text size="xs" c="dimmed" px="sm">
            FinTrack 1.0 · облік особистих фінансів
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Suspense fallback={<SectionLoader />}>
          <Outlet />
        </Suspense>
      </AppShell.Main>

      <TransactionFormModal opened={txOpened} onClose={() => setTxOpened(false)} />
    </AppShell>
  );
}
