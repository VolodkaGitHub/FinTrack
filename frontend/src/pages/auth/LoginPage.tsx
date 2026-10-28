import { Alert, Anchor, Button, Divider, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconBrandGoogle, IconInfoCircle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { errorCode, errorMessage } from '../../api/client';
import { authApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import { AuthLayout } from './AuthLayout';

const OAUTH_ERRORS: Record<string, string> = {
  oauth: 'Не вдалося увійти через Google. Спробуйте ще раз.',
  EMAIL_NOT_VERIFIED: 'Google-акаунт не має підтвердженої пошти.',
};

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(params.get('error') ? (OAUTH_ERRORS[params.get('error')!] ?? OAUTH_ERRORS.oauth) : null);
  const [unverified, setUnverified] = useState(false);
  const [loading, setLoading] = useState(false);
  const providers = useQuery({ queryKey: ['auth-providers'], queryFn: authApi.providers, staleTime: Infinity });

  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: {
      email: (value) => (/^\S+@\S+\.\S+$/.test(value) ? null : 'Вкажіть коректний email'),
      password: (value) => (value ? null : 'Вкажіть пароль'),
    },
  });

  const submit = form.onSubmit(async ({ email, password }) => {
    setLoading(true);
    setError(null);
    setUnverified(false);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (e) {
      setUnverified(errorCode(e) === 'EMAIL_NOT_VERIFIED');
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  });

  const resend = async () => {
    await authApi.resendVerification(form.values.email).catch(() => undefined);
    notifications.show({ color: 'teal', message: 'Лист для підтвердження надіслано повторно' });
  };

  return (
    <AuthLayout title="Вхід до FinTrack" subtitle="Контролюйте доходи, витрати й бюджети в одному місці">
      <form onSubmit={submit}>
        <Stack>
          {error && (
            <Alert color={unverified ? 'orange' : 'red'} icon={<IconInfoCircle size={18} />}>
              {error}
              {unverified && (
                <Anchor component="button" type="button" display="block" mt={6} size="sm" onClick={() => void resend()}>
                  Надіслати лист повторно
                </Anchor>
              )}
            </Alert>
          )}
          <TextInput label="Email" placeholder="you@example.com" autoComplete="email" {...form.getInputProps('email')} />
          <PasswordInput label="Пароль" autoComplete="current-password" {...form.getInputProps('password')} />
          <Button type="submit" loading={loading} fullWidth mt="xs">
            Увійти
          </Button>
        </Stack>
      </form>
      {providers.data?.google && (
        <>
          <Divider label="або" labelPosition="center" my="md" />
          <Button component="a" href="/oauth2/authorization/google" variant="default" fullWidth leftSection={<IconBrandGoogle size={18} />}>
            Увійти через Google
          </Button>
        </>
      )}
      <Text size="sm" ta="center" mt="lg">
        Ще немає акаунта?{' '}
        <Anchor component={Link} to="/register" fw={600}>
          Зареєструватися
        </Anchor>
      </Text>
    </AuthLayout>
  );
}
