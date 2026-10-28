import { ThemeIcon } from '@mantine/core';
import { IconArrowsExchange, IconDots } from '@tabler/icons-react';
import { CATEGORY_ICONS } from './icons';

interface Props {
  icon?: string | null;
  color?: string | null;
  size?: number;
  transfer?: boolean;
}

export function CategoryIcon({ icon, color, size = 34, transfer = false }: Props) {
  const Icon = transfer ? IconArrowsExchange : (CATEGORY_ICONS[icon ?? ''] ?? IconDots);
  return (
    <ThemeIcon size={size} radius="xl" color={transfer ? 'blue' : (color ?? 'gray')} variant={transfer ? 'light' : 'filled'}>
      <Icon size={Math.round(size * 0.56)} stroke={1.8} />
    </ThemeIcon>
  );
}
