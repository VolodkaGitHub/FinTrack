import { Alert, Anchor, Button, PasswordInput, Stack, Text, TextInput, ThemeIcon } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconMailCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { errorMessage, fieldErrors } from '../../api/client';
import { authApi } from '../../api/endpoints';
import { AuthLayout } from './AuthLayout';

export default function RegisterPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const form = useForm({
    initialValues: { displayName: '', email: '', password: '', confirm: '' },
    validate: {
      displayName: (value) => (value.trim() ? null : 'Вкажіть ім’я'),
      email: (value) => (/^\S+@\S+\.\S+$/.test(value) ? null : 'Вкажіть коректний email'),
      password: (value) =>
        value.length >= 8 && /\d/.test(value) && /\p{L}/u.test(value) ? null : 'Щонайменше 8 символів, літери та цифри',
      confirm: (value, values) => (value === values.password ? null : 'Паролі не збігаються'),
    },
  });

  const submit = form.onSubmit(async ({ displayName, email, password }) => {
    setLoading(true);
    setError(null);
    try {
      await authApi.register({ displayName: displayName.trim(), email: email.trim(), password });
      setSentTo(email.trim());
    } catch (e) {
      form.setErrors(fieldErrors(e));
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  });

  if (sentTo) {
    return (
      <AuthLayout title="Підтвердіть email">
        <Stack align="center" ta="center">
          <ThemeIcon size={64} radius="xl" variant="light">
            <IconMailCheck size={34} />
          </ThemeIcon>
          <Text>
            Ми надіслали лист на <b>{sentTo}</b>. Перейдіть за посиланням у листі, щоб активувати акаунт.
          </Text>
          <Text size="sm" c="dimmed">
            Не отримали лист? Перевірте папку «Спам» або{' '}
            <Anchor
              component="button"
              type="button"
              onClick={() =>
                void authApi
                  .resendVerification(sentTo)
                  .then(() => notifications.show({ color: 'teal', message: 'Лист надіслано повторно' }))
              }
            >
              надішліть ще раз
            </Anchor>
            .
          </Text>
          <Anchor component={Link} to="/login">
            Повернутися до входу
          </Anchor>
        </Stack>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Створити акаунт" subtitle="Реєстрація займе менше хвилини">
      <form onSubmit={submit}>
        <Stack>
          {error && <Alert color="red">{error}</Alert>}
          <TextInput label="Ім’я" placeholder="Олена" autoComplete="name" {...form.getInputProps('displayName')} />
          <TextInput label="Email" placeholder="you@example.com" autoComplete="email" {...form.getInputProps('email')} />
          <PasswordInput label="Пароль" description="Щонайменше 8 символів, літери та цифри" autoComplete="new-password" {...form.getInputProps('password')} />
          <PasswordInput label="Повторіть пароль" autoComplete="new-password" {...form.getInputProps('confirm')} />
          <Button type="submit" loading={loading} fullWidth mt="xs">
            Зареєструватися
          </Button>
        </Stack>
      </form>
      <Text size="sm" ta="center" mt="lg">
        Вже маєте акаунт?{' '}
        <Anchor component={Link} to="/login" fw={600}>
          Увійти
        </Anchor>
      </Text>
    </AuthLayout>
  );
}
