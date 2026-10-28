import { Group, Select } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import dayjs from 'dayjs';
import { useState } from 'react';
import { toIsoDate } from '../utils/format';

export type PeriodPreset = 'thisMonth' | 'lastMonth' | 'last30' | 'last90' | 'thisYear' | 'all' | 'custom';

export interface Period {
  preset: PeriodPreset;
  from: string;
  to: string;
}

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'thisMonth', label: 'Цей місяць' },
  { value: 'lastMonth', label: 'Минулий місяць' },
  { value: 'last30', label: 'Останні 30 днів' },
  { value: 'last90', label: 'Останні 3 місяці' },
  { value: 'thisYear', label: 'Цей рік' },
  { value: 'all', label: 'Весь час' },
  { value: 'custom', label: 'Довільний період' },
];

export function periodFromPreset(preset: PeriodPreset): Period {
  const today = dayjs();
  const format = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD');
  switch (preset) {
    case 'lastMonth': {
      const month = today.subtract(1, 'month');
      return { preset, from: format(month.startOf('month')), to: format(month.endOf('month')) };
    }
    case 'last30':
      return { preset, from: format(today.subtract(29, 'day')), to: format(today) };
    case 'last90':
      return { preset, from: format(today.subtract(89, 'day')), to: format(today) };
    case 'thisYear':
      return { preset, from: format(today.startOf('year')), to: format(today.endOf('year')) };
    case 'all':
      return { preset, from: '2000-01-01', to: format(today.add(5, 'year')) };
    default:
      return { preset: preset === 'custom' ? 'custom' : 'thisMonth', from: format(today.startOf('month')), to: format(today.endOf('month')) };
  }
}

interface Props {
  value: Period;
  onChange: (period: Period) => void;
  presets?: PeriodPreset[];
}

export function PeriodSelect({ value, onChange, presets }: Props) {
  const data = PRESETS.filter((p) => !presets || presets.includes(p.value));
  return (
    <Group gap="xs" wrap="wrap">
      <Select
        aria-label="Період"
        data={data}
        value={value.preset}
        allowDeselect={false}
        w={190}
        onChange={(preset) => {
          if (preset === 'custom') {
            onChange({ ...value, preset: 'custom' });
          } else if (preset) {
            onChange(periodFromPreset(preset as PeriodPreset));
          }
        }}
      />
      {value.preset === 'custom' && <CustomRange value={value} onChange={onChange} />}
    </Group>
  );
}

function CustomRange({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  // поки обрано лише першу дату, діапазон тримаємо локально
  const [range, setRange] = useState<[string | null, string | null]>([value.from, value.to]);
  return (
    <DatePickerInput
      type="range"
      aria-label="Довільний період"
      valueFormat="DD.MM.YYYY"
      value={range}
      w={250}
      onChange={([from, to]) => {
        const next: [string | null, string | null] = [toIsoDate(from), toIsoDate(to)];
        setRange(next);
        if (next[0] && next[1]) {
          onChange({ preset: 'custom', from: next[0], to: next[1] });
        }
      }}
    />
  );
}
