import { Box, Center, Paper, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { Logo } from '../../components/AppLayout';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Center
      mih="100vh"
      p="md"
      style={{ background: 'linear-gradient(135deg, var(--mantine-color-teal-light) 0%, var(--mantine-color-body) 60%)' }}
    >
      <Stack w={420} maw="100%" gap="lg">
        <Center>
          <Logo />
        </Center>
        <Paper withBorder shadow="md" radius="lg" p="xl">
          <Box mb="lg">
            <Text fz={22} fw={700}>
              {title}
            </Text>
            {subtitle && (
              <Text c="dimmed" size="sm" mt={4}>
                {subtitle}
              </Text>
            )}
          </Box>
          {children}
        </Paper>
        <Text c="dimmed" size="xs" ta="center">
          FinTrack — простий облік особистих і сімейних фінансів
        </Text>
      </Stack>
    </Center>
  );
}
