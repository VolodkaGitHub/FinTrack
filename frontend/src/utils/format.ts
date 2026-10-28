import dayjs from 'dayjs';
import type { Frequency, TransactionType } from '../api/types';

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  let result = formatters.get(currency);
  if (!result) {
    try {
      result = new Intl.NumberFormat('uk-UA', {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      result = new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    formatters.set(currency, result);
  }
  return result;
}

/** «1 234,56 ₴», від'ємні — зі знаком «−». */
export function formatMoney(value: number | null | undefined, currency = 'UAH', options: { sign?: boolean } = {}): string {
  const amount = Number(value ?? 0);
  const sign = amount < 0 ? '−' : options.sign && amount > 0 ? '+' : '';
  return sign + formatter(currency).format(Math.abs(amount));
}

/** Сума операції зі знаком за її типом: дохід «+», витрата «−», переказ без знака. */
export function formatSigned(amount: number, type: TransactionType, currency = 'UAH'): string {
  if (type === 'TRANSFER') {
    return formatMoney(amount, currency);
  }
  return (type === 'INCOME' ? '+' : '−') + formatter(currency).format(Math.abs(amount));
}

export function compactMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)} тис`;
  return value.toFixed(0);
}

export const formatDate = (date: string | null | undefined) => (date ? dayjs(date).format('DD.MM.YYYY') : '—');
export const formatDateTime = (date: string | null | undefined) => (date ? dayjs(date).format('DD.MM.YYYY HH:mm') : '—');
export const formatMonth = (month: string) => {
  const text = dayjs(`${month}-01`).format('MMMM YYYY');
  return text.charAt(0).toUpperCase() + text.slice(1);
};
export const formatShortMonth = (month: string) => dayjs(`${month}-01`).format('MMM YY');

export const TYPE_LABELS: Record<TransactionType, string> = {
  INCOME: 'Дохід',
  EXPENSE: 'Витрата',
  TRANSFER: 'Переказ',
};

export const TYPE_COLORS: Record<TransactionType, string> = {
  INCOME: 'teal',
  EXPENSE: 'red',
  TRANSFER: 'blue',
};

export function frequencyLabel(frequency: Frequency, interval = 1): string {
  if (interval === 1) {
    return { DAILY: 'Щодня', WEEKLY: 'Щотижня', MONTHLY: 'Щомісяця', YEARLY: 'Щороку' }[frequency];
  }
  const unit = {
    DAILY: plural(interval, 'день', 'дні', 'днів'),
    WEEKLY: plural(interval, 'тиждень', 'тижні', 'тижнів'),
    MONTHLY: plural(interval, 'місяць', 'місяці', 'місяців'),
    YEARLY: plural(interval, 'рік', 'роки', 'років'),
  }[frequency];
  return `Кожні ${interval} ${unit}`;
}

/** Українська множина: 1 операція, 2 операції, 5 операцій. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const toIsoDate = (value: Date | string | null | undefined): string | null =>
  value ? dayjs(value).format('YYYY-MM-DD') : null;
