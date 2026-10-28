import type { PinHash } from './pin';

/** Налаштування блокування зберігаються окремо для кожного користувача на цьому пристрої. */
export interface LockConfig {
  pin: PinHash;
  biometricCredentialId?: string;
  timeoutMinutes: number;
}

export const MAX_PIN_ATTEMPTS = 5;

const configKey = (userId: number) => `fintrack.lock.${userId}`;
const attemptsKey = (userId: number) => `fintrack.lock.${userId}.attempts`;

export function loadLockConfig(userId: number): LockConfig | null {
  try {
    const raw = localStorage.getItem(configKey(userId));
    return raw ? (JSON.parse(raw) as LockConfig) : null;
  } catch {
    return null;
  }
}

export function saveLockConfig(userId: number, config: LockConfig): void {
  localStorage.setItem(configKey(userId), JSON.stringify(config));
}

export function clearLockConfig(userId: number): void {
  localStorage.removeItem(configKey(userId));
  localStorage.removeItem(attemptsKey(userId));
}

export function failedAttempts(userId: number): number {
  return Number(localStorage.getItem(attemptsKey(userId)) ?? 0);
}

export function registerFailedAttempt(userId: number): number {
  const attempts = failedAttempts(userId) + 1;
  localStorage.setItem(attemptsKey(userId), String(attempts));
  return attempts;
}

export function resetAttempts(userId: number): void {
  localStorage.removeItem(attemptsKey(userId));
}
