import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FileInput,
  Group,
  Paper,
  PasswordInput,
  PinInput,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconDeviceDesktop, IconDownload, IconFileImport, IconFingerprint, IconLock, IconLogout, IconShieldLock } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage, fieldErrors } from '../api/client';
import { dataApi, userApi } from '../api/endpoints';
import { invalidateEntity, useAccounts, useEntityMutation, useSessions } from '../api/hooks';
import type { ImportResult, ImportRowStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/common';
import { periodFromPreset, PeriodSelect, type Period } from '../components/PeriodSelect';
import { isBiometricAvailable } from '../lock/biometric';
import { useLock } from '../lock/LockProvider';
import { isCryptoAvailable, isValidPin } from '../lock/pin';
import { blobErrorMessage, saveResponse } from '../utils/download';
import { formatDate, formatDateTime, formatMoney, TYPE_LABELS } from '../utils/format';

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Налаштування" description="Профіль, безпека, пристрої та дані" />
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Stack gap="lg">
          <ProfileSection />
          <PasswordSection />
          <SessionsSection />
        </Stack>
        <Stack gap="lg">
          <SecuritySection />
          <ExportSection />
        </Stack>
      </SimpleGrid>
      <ImportSection />
    </>
  );
}

const CURRENCIES = [
  { value: 'UAH', label: 'UAH — гривня (₴)' },
  { value: 'USD', label: 'USD — долар США ($)' },
  { value: 'EUR', label: 'EUR — євро (€)' },
  { value: 'PLN', label: 'PLN — польський злотий (zł)' },
  { value: 'GBP', label: 'GBP — фунт стерлінгів (£)' },
];

function ProfileSection() {
  const { user, setUser } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: { displayName: user?.displayName ?? '', currency: user?.currency ?? 'UAH' },
    validate: { displayName: (value) => (value.trim() ? null : 'Вкажіть ім’я') },
  });
  const save = useEntityMutation('user', userApi.update, {
    success: 'Профіль оновлено',
    onSuccess: (updated) => {
      setUser(updated);
      invalidateEntity(queryClient, 'transactions');
    },
  });
  return (
    <Paper withBorder radius="md" p="lg">
      <Title order={4} mb="md">
        Профіль
      </Title>
      <form onSubmit={form.onSubmit((values) => save.mutate({ displayName: values.displayName.trim(), currency: values.currency }))}>
        <Stack>
          <TextInput label="Email" value={user?.email ?? ''} disabled description={user?.authProvider === 'GOOGLE' ? 'Вхід через Google' : undefined} />
          <TextInput label="Ім’я" {...form.getInputProps('displayName')} />
          <Select label="Валюта обліку" data={CURRENCIES} allowDeselect={false} {...form.getInputProps('currency')} />
          <Group justify="flex-end">
            <Button type="submit" loading={save.isPending}>
              Зберегти
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}

function PasswordSection() {
  const { user, setUser } = useAuth();
  const form = useForm({
    initialValues: { currentPassword: '', newPassword: '', confirm: '' },
    validate: {
      newPassword: (value) => (value.length >= 8 && /\d/.test(value) && /\p{L}/u.test(value) ? null : 'Щонайменше 8 символів, літери та цифри'),
      confirm: (value, values) => (value === values.newPassword ? null : 'Паролі не збігаються'),
    },
  });
  const [loading, setLoading] = useState(false);
  const submit = form.onSubmit(async (values) => {
    setLoading(true);
    try {
      await userApi.changePassword({ currentPassword: values.currentPassword || undefined, newPassword: values.newPassword });
      notifications.show({ color: 'teal', message: 'Пароль змінено' });
      form.reset();
      if (user && !user.hasPassword) {
        setUser({ ...user, hasPassword: true });
      }
    } catch (error) {
      form.setErrors(fieldErrors(error));
      notifications.show({ color: 'red', message: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  });
  return (
    <Paper withBorder radius="md" p="lg">
      <Title order={4} mb="md">
        {user?.hasPassword ? 'Зміна пароля' : 'Встановити пароль'}
      </Title>
      <form onSubmit={submit}>
        <Stack>
          {user?.hasPassword && <PasswordInput label="Поточний пароль" autoComplete="current-password" {...form.getInputProps('currentPassword')} />}
          <PasswordInput label="Новий пароль" autoComplete="new-password" {...form.getInputProps('newPassword')} />
          <PasswordInput label="Повторіть новий пароль" autoComplete="new-password" {...form.getInputProps('confirm')} />
          <Group justify="flex-end">
            <Button type="submit" loading={loading}>
              Змінити пароль
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}

/** REQ-4.4: PIN-код / біометрія на цьому пристрої. */
function SecuritySection() {
  const lock = useLock();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [changing, setChanging] = useState(false);
  const biometric = useQuery({ queryKey: ['biometric-available'], queryFn: isBiometricAvailable, staleTime: Infinity });
  const [permission, setPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  const savePin = async () => {
    if (!isValidPin(pin) || pin !== confirm) {
      notifications.show({ color: 'red', message: 'PIN має містити 4–6 цифр і збігатися в обох полях' });
      return;
    }
    if (lock.enabled && !(await lock.checkPin(currentPin))) {
      notifications.show({ color: 'red', message: 'Поточний PIN-код неправильний' });
      return;
    }
    await lock.setPin(pin);
    setPin('');
    setConfirm('');
    setCurrentPin('');
    setChanging(false);
    notifications.show({ color: 'teal', message: 'PIN-код збережено. Застосунок блокуватиметься після бездіяльності.' });
  };

  const enableBiometric = async () => {
    try {
      await lock.enableBiometric();
      notifications.show({ color: 'teal', message: 'Біометричне розблокування увімкнено' });
    } catch {
      notifications.show({ color: 'red', message: 'Не вдалося зареєструвати біометрію на цьому пристрої' });
    }
  };

  if (!isCryptoAvailable()) {
    return (
      <Paper withBorder radius="md" p="lg">
        <Title order={4} mb="sm">
          Захист PIN-кодом
        </Title>
        <Alert color="orange">PIN-код і біометрія доступні лише через захищене з’єднання (HTTPS або localhost).</Alert>
      </Paper>
    );
  }

  return (
    <Paper withBorder radius="md" p="lg">
      <Group justify="space-between" mb="md">
        <Title order={4}>Захист доступу на цьому пристрої</Title>
        <Badge color={lock.enabled ? 'teal' : 'gray'} leftSection={<IconShieldLock size={12} />}>
          {lock.enabled ? 'увімкнено' : 'вимкнено'}
        </Badge>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        PIN-код зберігається лише на цьому пристрої у вигляді криптографічного хешу. Після 5 невдалих спроб буде виконано вихід з акаунта.
      </Text>
      {(!lock.enabled || changing) && (
        <Stack gap="sm" mb="md">
          {lock.enabled && (
            <div>
              <Text size="sm" fw={500} mb={4}>
                Поточний PIN
              </Text>
              <PinInput length={lock.config?.pin.length ?? 4} type="number" mask value={currentPin} onChange={setCurrentPin} />
            </div>
          )}
          <div>
            <Text size="sm" fw={500} mb={4}>
              Новий PIN (4 цифри)
            </Text>
            <PinInput length={4} type="number" mask value={pin} onChange={setPin} />
          </div>
          <div>
            <Text size="sm" fw={500} mb={4}>
              Повторіть PIN
            </Text>
            <PinInput length={4} type="number" mask value={confirm} onChange={setConfirm} />
          </div>
          <Group>
            <Button leftSection={<IconLock size={16} />} onClick={() => void savePin()}>
              Зберегти PIN
            </Button>
            {changing && (
              <Button variant="default" onClick={() => setChanging(false)}>
                Скасувати
              </Button>
            )}
          </Group>
        </Stack>
      )}
      {lock.enabled && !changing && (
        <Stack gap="md">
          <Select
            label="Блокувати після бездіяльності"
            data={[
              { value: '1', label: '1 хвилина' },
              { value: '5', label: '5 хвилин' },
              { value: '15', label: '15 хвилин' },
              { value: '30', label: '30 хвилин' },
            ]}
            value={String(lock.config?.timeoutMinutes ?? 5)}
            onChange={(value) => value && lock.setTimeoutMinutes(Number(value))}
            allowDeselect={false}
          />
          {biometric.data ? (
            lock.config?.biometricCredentialId ? (
              <Group justify="space-between">
                <Text size="sm">Розблокування біометрією увімкнено</Text>
                <Button variant="subtle" color="red" size="xs" onClick={lock.disableBiometric}>
                  Вимкнути
                </Button>
              </Group>
            ) : (
              <Button variant="light" leftSection={<IconFingerprint size={18} />} onClick={() => void enableBiometric()}>
                Увімкнути відбиток / Face ID / Windows Hello
              </Button>
            )
          ) : (
            <Text size="xs" c="dimmed">
              Біометричний автентифікатор на цьому пристрої недоступний.
            </Text>
          )}
          <Group>
            <Button variant="default" onClick={() => setChanging(true)}>
              Змінити PIN
            </Button>
            <Button variant="subtle" color="red" onClick={lock.disable}>
              Вимкнути захист
            </Button>
            <Button variant="light" leftSection={<IconLock size={16} />} onClick={lock.lock}>
              Заблокувати зараз
            </Button>
          </Group>
        </Stack>
      )}
      {permission !== 'unsupported' && permission !== 'granted' && (
        <Button
          mt="md"
          variant="subtle"
          size="xs"
          onClick={() => void Notification.requestPermission().then(setPermission)}
        >
          Дозволити системні сповіщення браузера
        </Button>
      )}
    </Paper>
  );
}

/** REQ-4.2: пристрої, на яких виконано вхід. */
function SessionsSection() {
  const { data } = useSessions();
  const revoke = useEntityMutation('sessions', (id: number) => userApi.revokeSession(id), { success: 'Сеанс завершено' });
  return (
    <Paper withBorder radius="md" p="lg">
      <Title order={4} mb={4}>
        Пристрої
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        Дані синхронізуються між усіма пристроями в реальному часі.
      </Text>
      <Stack gap="sm">
        {(data ?? []).map((session) => (
          <Group key={session.id} justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <IconDeviceDesktop size={22} color="var(--mantine-color-dimmed)" />
              <div>
                <Group gap={6}>
                  <Text size="sm" fw={500}>
                    {session.deviceName ?? 'Невідомий пристрій'}
                  </Text>
                  {session.current && (
                    <Badge size="xs" color="teal">
                      цей пристрій
                    </Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  Остання активність: {formatDateTime(session.lastUsedAt)}
                </Text>
              </div>
            </Group>
            {!session.current && (
              <Button size="compact-xs" variant="subtle" color="red" leftSection={<IconLogout size={14} />} onClick={() => revoke.mutate(session.id)}>
                Завершити
              </Button>
            )}
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}

/** REQ-4.3: експорт історії у CSV. */
function ExportSection() {
  const [period, setPeriod] = useState<Period>(() => periodFromPreset('all'));
  const [delimiter, setDelimiter] = useState<'comma' | 'semicolon'>('comma');
  const [loading, setLoading] = useState(false);
  const exportCsv = async () => {
    setLoading(true);
    try {
      const range = period.preset === 'all' ? {} : { from: period.from, to: period.to };
      await saveResponse(dataApi.exportCsv({ ...range, delimiter }), 'fintrack-transactions.csv');
    } catch (error) {
      notifications.show({ color: 'red', message: await blobErrorMessage(error, 'Не вдалося експортувати дані') });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Paper withBorder radius="md" p="lg">
      <Title order={4} mb={4}>
        Експорт даних (CSV)
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        Файл UTF-8 з колонками date, type, amount, account, category, subcategory, to_account, note — його можна відкрити в Excel або
        імпортувати в інший застосунок.
      </Text>
      <Stack gap="sm">
        <PeriodSelect value={period} onChange={setPeriod} />
        <Select
          label="Роздільник"
          data={[
            { value: 'comma', label: 'Кома (,) — стандарт CSV' },
            { value: 'semicolon', label: 'Крапка з комою (;) — для Excel з українською локаллю' },
          ]}
          value={delimiter}
          onChange={(value) => value && setDelimiter(value as 'comma' | 'semicolon')}
          allowDeselect={false}
        />
        <Group>
          <Button leftSection={<IconDownload size={16} />} loading={loading} onClick={() => void exportCsv()}>
            Завантажити CSV
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

const STATUS_BADGE: Record<ImportRowStatus, { color: string; label: string }> = {
  OK: { color: 'teal', label: 'буде додано' },
  DUPLICATE: { color: 'gray', label: 'дублікат' },
  ERROR: { color: 'red', label: 'помилка' },
};

/** REQ-4.3: імпорт історії з CSV інших застосунків і банківських виписок з попереднім переглядом. */
function ImportSection() {
  const queryClient = useQueryClient();
  const { data: accounts } = useAccounts();
  const [file, setFile] = useState<File | null>(null);
  const [defaultAccountId, setDefaultAccountId] = useState<string | null>(null);
  const [createMissing, setCreateMissing] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (dryRun: boolean) => {
    if (!file) {
      return;
    }
    setLoading(true);
    try {
      const result = await dataApi.importCsv(file, {
        dryRun,
        createMissing,
        skipDuplicates,
        defaultAccountId: defaultAccountId ? Number(defaultAccountId) : null,
      });
      if (dryRun) {
        setPreview(result);
      } else {
        notifications.show({ color: 'teal', title: 'Імпорт завершено', message: `Додано операцій: ${result.imported}` });
        ['transactions', 'accounts', 'categories'].forEach((entity) => invalidateEntity(queryClient, entity));
        setPreview(null);
        setFile(null);
      }
    } catch (error) {
      notifications.show({ color: 'red', message: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  const columns = preview ? Object.entries(preview.columns).map(([key, header]) => `${key} ← «${header}»`).join(', ') : '';

  return (
    <Paper withBorder radius="md" p="lg" mt="lg">
      <Title order={4} mb={4}>
        Імпорт історії з CSV
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        Підтримуються файли інших застосунків і банківські виписки: кодування UTF-8 або Windows-1251, роздільник кома чи крапка з комою,
        заголовки українською чи англійською. Від’ємна сума без колонки типу вважається витратою.
      </Text>
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        <FileInput
          label="Файл CSV"
          placeholder="Оберіть файл"
          accept=".csv,text/csv"
          leftSection={<IconFileImport size={16} />}
          value={file}
          onChange={(value) => {
            setFile(value);
            setPreview(null);
          }}
          clearable
        />
        <Select
          label="Рахунок за замовчуванням"
          description="Для файлів без колонки «Рахунок»"
          data={(accounts ?? []).filter((a) => !a.archived).map((a) => ({ value: String(a.id), label: a.name }))}
          value={defaultAccountId}
          onChange={(value) => {
            setDefaultAccountId(value);
            setPreview(null);
          }}
          clearable
        />
        <Stack gap={6} justify="flex-end">
          <Checkbox label="Створювати відсутні рахунки й категорії" checked={createMissing} onChange={(e) => setCreateMissing(e.currentTarget.checked)} />
          <Checkbox label="Пропускати дублікати" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.currentTarget.checked)} />
        </Stack>
      </SimpleGrid>
      <Group mt="md">
        <Button variant="light" disabled={!file} loading={loading && !preview} onClick={() => void run(true)}>
          Перевірити файл
        </Button>
        {preview && (
          <Button disabled={preview.validRows === 0} loading={loading} onClick={() => void run(false)}>
            Імпортувати {preview.validRows} операцій
          </Button>
        )}
      </Group>

      {preview && (
        <Stack mt="md" gap="sm">
          <Alert color={preview.errorRows > 0 ? 'orange' : 'teal'}>
            Рядків: {preview.totalRows} · до імпорту: <b>{preview.validRows}</b> · дублікатів: {preview.duplicateRows} · з помилками:{' '}
            {preview.errorRows}. Кодування: {preview.encoding}, роздільник: {preview.delimiter}.
            <Text size="xs" mt={4}>
              Розпізнані колонки: {columns}
            </Text>
            {preview.needsDefaultAccount && (
              <Text size="xs" mt={4} fw={600}>
                У файлі немає колонки рахунку — оберіть рахунок за замовчуванням.
              </Text>
            )}
            {(preview.newAccounts.length > 0 || preview.newCategories.length > 0) && (
              <Text size="xs" mt={4}>
                Буде створено: {[...preview.newAccounts.map((a) => `рахунок «${a}»`), ...preview.newCategories.map((c) => `категорію «${c}»`)].join(', ')}
              </Text>
            )}
          </Alert>
          <ScrollArea h={320}>
            <Table striped verticalSpacing={4} fz="sm" miw={760}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Рядок</Table.Th>
                  <Table.Th>Дата</Table.Th>
                  <Table.Th>Тип</Table.Th>
                  <Table.Th>Сума</Table.Th>
                  <Table.Th>Рахунок</Table.Th>
                  <Table.Th>Категорія</Table.Th>
                  <Table.Th>Нотатка</Table.Th>
                  <Table.Th>Статус</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {preview.preview.map((row) => (
                  <Table.Tr key={row.line}>
                    <Table.Td>{row.line}</Table.Td>
                    <Table.Td>{formatDate(row.date)}</Table.Td>
                    <Table.Td>{row.type ? TYPE_LABELS[row.type] : '—'}</Table.Td>
                    <Table.Td>{row.amount != null ? formatMoney(row.amount) : '—'}</Table.Td>
                    <Table.Td>{row.account ?? '—'}</Table.Td>
                    <Table.Td>{[row.category, row.subcategory].filter(Boolean).join(' › ') || '—'}</Table.Td>
                    <Table.Td>{row.note}</Table.Td>
                    <Table.Td>
                      <Badge size="xs" color={STATUS_BADGE[row.status].color} variant="light">
                        {STATUS_BADGE[row.status].label}
                      </Badge>
                      {row.message && (
                        <Text size="xs" c="dimmed">
                          {row.message}
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Stack>
      )}
    </Paper>
  );
}
