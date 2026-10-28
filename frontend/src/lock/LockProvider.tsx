import { Anchor, Button, Center, Paper, PinInput, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { useIdle } from '@mantine/hooks';
import { IconFingerprint, IconLock } from '@tabler/icons-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { registerBiometric, verifyBiometric } from './biometric';
import {
  clearLockConfig,
  failedAttempts,
  loadLockConfig,
  MAX_PIN_ATTEMPTS,
  registerFailedAttempt,
  resetAttempts,
  saveLockConfig,
  type LockConfig,
} from './lockStore';
import { hashPin, verifyPin } from './pin';

interface LockContextValue {
  enabled: boolean;
  config: LockConfig | null;
  lock: () => void;
  setPin: (pin: string) => Promise<void>;
  checkPin: (pin: string) => Promise<boolean>;
  disable: () => void;
  enableBiometric: () => Promise<void>;
  disableBiometric: () => void;
  setTimeoutMinutes: (minutes: number) => void;
}

const LockContext = createContext<LockContextValue | null>(null);

/**
 * REQ-4.4: захист доступу до застосунку PIN-кодом або біометрією на клієнті.
 * Блокує інтерфейс при запуску, після бездіяльності та після повернення до вкладки, прихованої довше за тайм-аут.
 */
export function LockProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const userId = user?.id ?? 0;
  const [config, setConfig] = useState<LockConfig | null>(() => loadLockConfig(userId));
  const [locked, setLocked] = useState<boolean>(() => loadLockConfig(userId) !== null);
  const timeoutMs = (config?.timeoutMinutes ?? 5) * 60_000;
  const idle = useIdle(timeoutMs, { initialState: false });

  if (config && idle && !locked) {
    setLocked(true);
  }

  useEffect(() => {
    if (!config) {
      return;
    }
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > timeoutMs) {
        setLocked(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [config, timeoutMs]);

  const update = useCallback(
    (next: LockConfig | null) => {
      if (next) {
        saveLockConfig(userId, next);
      } else {
        clearLockConfig(userId);
      }
      setConfig(next);
    },
    [userId],
  );

  const value = useMemo<LockContextValue>(
    () => ({
      enabled: config !== null,
      config,
      lock: () => setLocked(config !== null),
      setPin: async (pin) => {
        const hashed = await hashPin(pin);
        update({ timeoutMinutes: 5, ...config, pin: hashed });
        resetAttempts(userId);
      },
      checkPin: async (pin) => (config ? verifyPin(pin, config.pin) : false),
      disable: () => update(null),
      enableBiometric: async () => {
        if (!config || !user) {
          throw new Error('Спочатку встановіть PIN-код');
        }
        const credentialId = await registerBiometric(user.id, user.email);
        update({ ...config, biometricCredentialId: credentialId });
      },
      disableBiometric: () => {
        if (config) {
          update({ ...config, biometricCredentialId: undefined });
        }
      },
      setTimeoutMinutes: (minutes) => {
        if (config) {
          update({ ...config, timeoutMinutes: minutes });
        }
      },
    }),
    [config, update, user, userId],
  );

  if (config && locked) {
    return (
      <LockScreen
        config={config}
        userId={userId}
        userName={user?.displayName ?? ''}
        onUnlock={() => setLocked(false)}
        onLogout={() => {
          void logout();
        }}
      />
    );
  }
  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

export function useLock(): LockContextValue {
  const context = useContext(LockContext);
  if (!context) {
    throw new Error('useLock must be used inside LockProvider');
  }
  return context;
}

interface LockScreenProps {
  config: LockConfig;
  userId: number;
  userName: string;
  onUnlock: () => void;
  onLogout: () => void;
}

export function LockScreen({ config, userId, userName, onUnlock, onLogout }: LockScreenProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unlock = () => {
    resetAttempts(userId);
    onUnlock();
  };

  const tryPin = async (pin: string) => {
    setBusy(true);
    const ok = await verifyPin(pin, config.pin);
    setBusy(false);
    if (ok) {
      unlock();
      return;
    }
    setValue('');
    const attempts = registerFailedAttempt(userId);
    if (attempts >= MAX_PIN_ATTEMPTS) {
      clearLockConfig(userId);
      onLogout();
      return;
    }
    setError(`Невірний PIN-код. Залишилось спроб: ${MAX_PIN_ATTEMPTS - attempts}`);
  };

  const tryBiometric = async () => {
    try {
      if (config.biometricCredentialId && (await verifyBiometric(config.biometricCredentialId))) {
        unlock();
      } else {
        setError('Біометрію не підтверджено');
      }
    } catch {
      setError('Біометрію не підтверджено. Скористайтеся PIN-кодом.');
    }
  };

  const remaining = MAX_PIN_ATTEMPTS - failedAttempts(userId);

  return (
    <Center mih="100vh" p="md" bg="var(--mantine-color-body)">
      <Paper withBorder shadow="md" p="xl" radius="lg" w={380} maw="100%">
        <Stack align="center" gap="md">
          <ThemeIcon size={60} radius="xl" variant="light">
            <IconLock size={30} />
          </ThemeIcon>
          <div style={{ textAlign: 'center' }}>
            <Title order={3}>FinTrack заблоковано</Title>
            <Text c="dimmed" size="sm" mt={4}>
              {userName ? `${userName}, введіть` : 'Введіть'} PIN-код, щоб продовжити
            </Text>
          </div>
          <PinInput
            length={config.pin.length}
            type="number"
            mask
            autoFocus
            oneTimeCode={false}
            value={value}
            onChange={setValue}
            onComplete={(pin) => void tryPin(pin)}
            error={Boolean(error)}
            disabled={busy}
            aria-label="PIN-код"
          />
          {error && (
            <Text c="red" size="sm" ta="center">
              {error}
            </Text>
          )}
          {!error && remaining < MAX_PIN_ATTEMPTS && (
            <Text c="orange" size="xs">
              Залишилось спроб: {remaining}
            </Text>
          )}
          {config.biometricCredentialId && (
            <Button variant="light" leftSection={<IconFingerprint size={18} />} onClick={() => void tryBiometric()} fullWidth>
              Розблокувати біометрією
            </Button>
          )}
          <Anchor component="button" type="button" size="sm" c="dimmed" onClick={onLogout}>
            Вийти з акаунта
          </Anchor>
        </Stack>
      </Paper>
    </Center>
  );
}
