import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { periodFromPreset, PeriodSelect, type Period, type PeriodPreset } from './PeriodSelect';

describe('periodFromPreset', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2025, 2, 15, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  it.each<[PeriodPreset, string, string]>([
    ['thisMonth', '2025-03-01', '2025-03-31'],
    ['lastMonth', '2025-02-01', '2025-02-28'],
    ['last30', '2025-02-14', '2025-03-15'],
    ['last90', '2024-12-16', '2025-03-15'],
    ['thisYear', '2025-01-01', '2025-12-31'],
    ['all', '2000-01-01', '2030-03-15'],
    ['custom', '2025-03-01', '2025-03-31'],
  ])('%s → %s … %s', (preset, from, to) => {
    expect(periodFromPreset(preset)).toEqual({ preset, from, to });
  });
});

function renderSelect(value: Period, onChange = vi.fn()) {
  const ui = (v: Period): ReactElement => (
    <MantineProvider env="test">
      <DatesProvider settings={{ locale: 'uk' }}>
        <PeriodSelect value={v} onChange={onChange} />
      </DatesProvider>
    </MantineProvider>
  );
  const view = render(ui(value));
  return { onChange, rerender: (v: Period) => view.rerender(ui(v)) };
}

describe('PeriodSelect', () => {
  it('switches between presets', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelect(periodFromPreset('thisMonth'));
    await user.click(screen.getByLabelText('Період', { selector: 'input' }));
    await user.click(screen.getByRole('option', { name: 'Минулий місяць' }));
    expect(onChange).toHaveBeenCalledWith(periodFromPreset('lastMonth'));
  });

  it('offers a custom date range and reports it once both dates are chosen', async () => {
    const user = userEvent.setup();
    const { onChange, rerender } = renderSelect(periodFromPreset('thisMonth'));
    await user.click(screen.getByLabelText('Період', { selector: 'input' }));
    await user.click(screen.getByRole('option', { name: 'Довільний період' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ preset: 'custom' }));

    rerender({ preset: 'custom', from: '2025-03-01', to: '2025-03-31' });
    await user.click(screen.getByLabelText('Довільний період', { selector: 'button' }));
    const days = (label: string) =>
      screen.getAllByRole('button', { name: new RegExp(`^${label} `) }).find((button) => !button.hasAttribute('data-outside'))!;
    onChange.mockClear();
    await user.click(days('5'));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(days('12'));
    expect(onChange).toHaveBeenCalledWith({ preset: 'custom', from: '2025-03-05', to: '2025-03-12' });
  });
});
