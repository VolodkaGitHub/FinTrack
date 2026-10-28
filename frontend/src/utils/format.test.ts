import { describe, expect, it } from 'vitest';
import { formatMoney, formatSigned, frequencyLabel, plural } from './format';

describe('formatMoney', () => {
  it('formats hryvnia in Ukrainian locale', () => {
    expect(formatMoney(1234.56)).toMatch(/^1\s234,56\s₴$/u);
  });

  it('uses a typographic minus for negative amounts and optional plus', () => {
    expect(formatMoney(-50)).toMatch(/^−50,00\s₴$/u);
    expect(formatMoney(75, 'UAH', { sign: true }).startsWith('+')).toBe(true);
  });

  it('supports other currencies', () => {
    expect(formatMoney(10, 'USD')).toContain('$');
    expect(formatMoney(10, 'EUR')).toContain('€');
  });
});

describe('formatSigned', () => {
  it('prefixes amount by transaction type', () => {
    expect(formatSigned(100, 'INCOME').startsWith('+')).toBe(true);
    expect(formatSigned(100, 'EXPENSE').startsWith('−')).toBe(true);
    expect(formatSigned(100, 'TRANSFER')).toMatch(/^100,00/);
  });
});

describe('Ukrainian plural forms', () => {
  it.each([
    [1, 'операція'],
    [2, 'операції'],
    [5, 'операцій'],
    [11, 'операцій'],
    [21, 'операція'],
    [24, 'операції'],
  ])('%i → %s', (n, expected) => {
    expect(plural(n, 'операція', 'операції', 'операцій')).toBe(expected);
  });

  it('describes recurring frequency', () => {
    expect(frequencyLabel('MONTHLY')).toBe('Щомісяця');
    expect(frequencyLabel('WEEKLY', 2)).toBe('Кожні 2 тижні');
    expect(frequencyLabel('DAILY', 5)).toBe('Кожні 5 днів');
  });
});
