import { Center, Group, Loader, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import type { TransactionType } from '../api/types';
import { useCurrency } from '../auth/AuthContext';
import { formatSigned } from '../utils/format';
import type { IconComponent } from './icons';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-end" mb="lg" wrap="wrap" gap="sm">
      <div>
        <Title order={2}>{title}</Title>
        {description && (
          <Text c="dimmed" size="sm" mt={4}>
            {description}
          </Text>
        )}
      </div>
      {actions && <Group gap="xs">{actions}</Group>}
    </Group>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: IconComponent; title: string; description?: string; action?: ReactNode }) {
  return (
    <Paper withBorder radius="md" p="xl">
      <Stack align="center" gap="xs">
        <ThemeIcon size={52} radius="xl" variant="light" color="gray">
          <Icon size={28} />
        </ThemeIcon>
        <Text fw={600}>{title}</Text>
        {description && (
          <Text c="dimmed" size="sm" ta="center" maw={420}>
            {description}
          </Text>
        )}
        {action}
      </Stack>
    </Paper>
  );
}

export function FullScreenLoader() {
  return (
    <Center h="100vh">
      <Loader />
    </Center>
  );
}

export function SectionLoader() {
  return (
    <Center py="xl">
      <Loader size="sm" />
    </Center>
  );
}

export function Amount({ amount, type, size = 'sm' }: { amount: number; type: TransactionType; size?: string }) {
  const currency = useCurrency();
  const color = type === 'INCOME' ? 'teal.7' : type === 'EXPENSE' ? 'red.7' : undefined;
  return (
    <Text size={size} fw={600} c={color} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {formatSigned(amount, type, currency)}
    </Text>
  );
}

export function StatCard({ label, value, hint, color, icon: Icon }: { label: string; value: string; hint?: ReactNode; color?: string; icon: IconComponent }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {label}
          </Text>
          <Text fz={22} fw={700} mt={4} c={color} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </Text>
          {hint && (
            <Text size="xs" c="dimmed" mt={2} component="div">
              {hint}
            </Text>
          )}
        </div>
        <ThemeIcon variant="light" color={color ?? 'teal'} size={38} radius="md">
          <Icon size={22} />
        </ThemeIcon>
      </Group>
    </Paper>
  );
}
