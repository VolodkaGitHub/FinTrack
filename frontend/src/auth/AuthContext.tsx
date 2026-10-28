import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, userApi } from '../api/endpoints';
import type { AuthTokens, User } from '../api/types';
import { SESSION_EXPIRED_EVENT, tokenStore } from './tokens';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  user: User | null;
  status: Status;
  login: (email: string, password: string) => Promise<void>;
  acceptTokens: (tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>, user?: User) => Promise<void>;
  logout: (notifyServer?: boolean) => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>(() => (tokenStore.get() ? 'loading' : 'anonymous'));

  useEffect(() => {
    if (status !== 'loading') {
      return;
    }
    userApi
      .me()
      .then((me) => {
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() => {
        tokenStore.clear();
        setStatus('anonymous');
      });
  }, [status]);

  const reset = useCallback(() => {
    tokenStore.clear();
    queryClient.clear();
    setUser(null);
    setStatus('anonymous');
  }, [queryClient]);

  useEffect(() => {
    const onExpired = () => {
      reset();
      notifications.show({ color: 'orange', title: 'Сесія завершилась', message: 'Увійдіть знову, щоб продовжити.' });
    };
    // вихід або вхід в іншій вкладці
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'fintrack.refreshToken' && event.newValue === null) {
        reset();
      }
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
      window.removeEventListener('storage', onStorage);
    };
  }, [reset]);

  const acceptTokens = useCallback(async (tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>, knownUser?: User) => {
    tokenStore.set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    const me = knownUser ?? (await userApi.me());
    setUser(me);
    setStatus('authenticated');
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await authApi.login(email, password);
      await acceptTokens(response, response.user);
    },
    [acceptTokens],
  );

  const logout = useCallback(
    async (notifyServer = true) => {
      const tokens = tokenStore.get();
      if (notifyServer && tokens) {
        await authApi.logout(tokens.refreshToken).catch(() => undefined);
      }
      reset();
    },
    [reset],
  );

  const value = useMemo(
    () => ({ user, status, login, acceptTokens, logout, setUser }),
    [user, status, login, acceptTokens, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}

export function useCurrency(): string {
  return useAuth().user?.currency ?? 'UAH';
}
