import { Alert, Anchor, Center, Loader, Stack, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { errorMessage } from '../../api/client';
import { authApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import { AuthLayout } from './AuthLayout';

/** REQ-4.1: перехід за посиланням з листа — підтвердження пошти та автоматичний вхід. */
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { acceptTokens } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const token = params.get('token');

  useEffect(() => {
    if (started.current || !token) {
      return;
    }
    started.current = true;
    authApi
      .verifyEmail(token)
      .then(async (response) => {
        await acceptTokens(response, response.user);
        navigate('/', { replace: true });
      })
      .catch((e) => setError(errorMessage(e)));
  }, [token, acceptTokens, navigate]);

  return (
    <AuthLayout title="Підтвердження email">
      {!token || error ? (
        <Stack>
          <Alert color="red">{error ?? 'Посилання некоректне: у ньому немає токена підтвердження.'}</Alert>
          <Anchor component={Link} to="/login" ta="center">
            Перейти до входу
          </Anchor>
        </Stack>
      ) : (
        <Center>
          <Stack align="center">
            <Loader />
            <Text c="dimmed">Підтверджуємо вашу пошту…</Text>
          </Stack>
        </Center>
      )}
    </AuthLayout>
  );
}
