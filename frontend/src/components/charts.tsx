import { Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategoryShare } from '../api/types';
import { formatMoney } from '../utils/format';
import { CategoryIcon } from './CategoryIcon';

export const tooltipStyle = {
  background: 'var(--mantine-color-body)',
  border: '1px solid var(--mantine-color-default-border)',
  borderRadius: 8,
  fontSize: 13,
};

/** REQ-3.1: кругова діаграма розподілу витрат (доходів) за категоріями. */
export function CategoryDonut({ data, currency, height = 240 }: { data: CategoryShare[]; currency: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="amount"
          nameKey="name"
          innerRadius="58%"
          outerRadius="92%"
          paddingAngle={data.length > 1 ? 2 : 0}
          stroke="none"
          isAnimationActive={false}
        >
          {data.map((item) => (
            <Cell key={`${item.categoryId}-${item.name}`} fill={item.color} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => formatMoney(Number(value), currency)} contentStyle={tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CategoryLegend({
  data,
  currency,
  limit,
  onSelect,
}: {
  data: CategoryShare[];
  currency: string;
  limit?: number;
  onSelect?: (item: CategoryShare) => void;
}) {
  const items = limit ? data.slice(0, limit) : data;
  return (
    <Stack gap={6}>
      {items.map((item) => {
        const clickable = Boolean(onSelect && item.hasChildren);
        const content = (
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <CategoryIcon icon={item.icon} color={item.color} size={28} />
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={500} truncate>
                  {item.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {item.percent.toFixed(1)}%{clickable ? ' · деталізувати ›' : ''}
                </Text>
              </div>
            </Group>
            <Text size="sm" fw={600} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {formatMoney(item.amount, currency)}
            </Text>
          </Group>
        );
        return clickable ? (
          <UnstyledButton key={`${item.categoryId}-${item.name}`} onClick={() => onSelect?.(item)}>
            {content}
          </UnstyledButton>
        ) : (
          <div key={`${item.categoryId}-${item.name}`}>{content}</div>
        );
      })}
    </Stack>
  );
}
