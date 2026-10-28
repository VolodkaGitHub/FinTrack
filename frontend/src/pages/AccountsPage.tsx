import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  ColorInput,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { IconArchive, IconArrowsExchange, IconDots, IconEdit, IconPlus, IconRestore, IconTrash, IconWallet } from '@tabler/icons-react';
import { useState } from 'react';
import { accountsApi } from '../api/endpoints';
import { useAccounts, useEntityMutation } from '../api/hooks';
import type { Account, AccountInput, AccountType } from '../api/types';
import { useCurrency } from '../auth/AuthContext';
import { EmptyState, PageHeader, SectionLoader } from '../components/common';
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_LABELS, PALETTE } from '../components/icons';
import { TransactionFormModal, type TransactionDefaults } from '../components/TransactionFormModal';
import { formatMoney } from '../utils/format';

/** REQ-1.2: кілька рахунків/гаманців (готівка, картка, накопичення) з окремими балансами. */
export default function AccountsPage() {
  const currency = useCurrency();
  const { data: accounts, isLoading } = useAccounts();
  const [editing, setEditing] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);
  const [transfer, setTransfer] = useState<TransactionDefaults | null>(null);

  const update = useEntityMutation('accounts', ({ id, input }: { id: number; input: AccountInput }) => accountsApi.update(id, input));
  const remove = useEntityMutation('accounts', (id: number) => accountsApi.remove(id), { success: 'Рахунок видалено' });

  const active = (accounts ?? []).filter((a) => !a.archived);
  const archived = (accounts ?? []).filter((a) => a.archived);
  const total = active.reduce((sum, a) => sum + a.balance, 0);

  const toggleArchive = (account: Account) =>
    update.mutate({
      id: account.id,
      input: { name: account.name, type: account.type, initialBalance: account.initialBalance, color: account.color, archived: !account.archived, version: account.version },
    });

  const confirmDelete = (account: Account) =>
    modals.openConfirmModal({
      title: `Видалити рахунок «${account.name}»?`,
      children: <Text size="sm">Видалити можна лише рахунок без операцій. Рахунок з історією краще архівувати.</Text>,
      labels: { confirm: 'Видалити', cancel: 'Скасувати' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(account.id),
    });

  const card = (account: Account) => {
    const Icon = ACCOUNT_TYPE_ICONS[account.type];
    return (
      <Paper key={account.id} withBorder radius="md" p="md" style={{ borderTop: `4px solid ${account.color}`, opacity: account.archived ? 0.65 : 1 }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon size={42} radius="md" color={account.color} variant="light">
              <Icon size={24} />
            </ThemeIcon>
            <div>
              <Text fw={600}>{account.name}</Text>
              <Text size="xs" c="dimmed">
                {ACCOUNT_TYPE_LABELS[account.type]}
              </Text>
            </div>
          </Group>
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" aria-label="Дії з рахунком">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconEdit size={15} />} onClick={() => setEditing(account)}>
                Редагувати
              </Menu.Item>
              {!account.archived && (
                <Menu.Item leftSection={<IconArrowsExchange size={15} />} onClick={() => setTransfer({ type: 'TRANSFER', accountId: account.id })}>
                  Переказати з рахунку
                </Menu.Item>
              )}
              <Menu.Item leftSection={account.archived ? <IconRestore size={15} /> : <IconArchive size={15} />} onClick={() => toggleArchive(account)}>
                {account.archived ? 'Повернути з архіву' : 'Архівувати'}
              </Menu.Item>
              <Menu.Item color="red" leftSection={<IconTrash size={15} />} onClick={() => confirmDelete(account)}>
                Видалити
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
        <Text fz={26} fw={700} mt="md" c={account.balance < 0 ? 'red' : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatMoney(account.balance, currency)}
        </Text>
        <Group justify="space-between" mt={4}>
          <Text size="xs" c="dimmed">
            Початковий баланс: {formatMoney(account.initialBalance, currency)}
          </Text>
          {account.archived && <Badge size="xs" color="gray">архів</Badge>}
        </Group>
      </Paper>
    );
  };

  return (
    <>
      <PageHeader
        title="Рахунки"
        description={`Загальний баланс активних рахунків: ${formatMoney(total, currency)}`}
        actions={
          <>
            <Button variant="default" leftSection={<IconArrowsExchange size={16} />} onClick={() => setTransfer({ type: 'TRANSFER' })}>
              Переказ
            </Button>
            <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
              Новий рахунок
            </Button>
          </>
        }
      />
      {isLoading ? (
        <SectionLoader />
      ) : active.length === 0 && archived.length === 0 ? (
        <EmptyState icon={IconWallet} title="Рахунків ще немає" description="Додайте готівку, банківську картку або накопичувальний рахунок." />
      ) : (
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>{active.map(card)}</SimpleGrid>
          {archived.length > 0 && (
            <Box>
              <Text fw={600} c="dimmed" mb="sm">
                Архів
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>{archived.map(card)}</SimpleGrid>
            </Box>
          )}
        </Stack>
      )}

      <Modal opened={creating || editing !== null} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Редагувати рахунок' : 'Новий рахунок'} centered>
        {(creating || editing) && <AccountForm account={editing} onDone={() => { setCreating(false); setEditing(null); }} />}
      </Modal>
      <TransactionFormModal opened={transfer !== null} defaults={transfer ?? undefined} onClose={() => setTransfer(null)} />
    </>
  );
}

function AccountForm({ account, onDone }: { account: Account | null; onDone: () => void }) {
  const form = useForm({
    initialValues: {
      name: account?.name ?? '',
      type: (account?.type ?? 'CARD') as AccountType,
      initialBalance: account?.initialBalance ?? (0 as number | string),
      color: account?.color ?? PALETTE[3],
      archived: account?.archived ?? false,
    },
    validate: {
      name: (value) => (value.trim() ? null : 'Вкажіть назву'),
      color: (value) => (/^#[0-9a-fA-F]{6}$/.test(value) ? null : 'Колір у форматі #RRGGBB'),
    },
  });
  const save = useEntityMutation(
    'accounts',
    (input: AccountInput) => (account ? accountsApi.update(account.id, input) : accountsApi.create(input)),
    { success: account ? 'Рахунок оновлено' : 'Рахунок створено', onSuccess: onDone },
  );

  return (
    <form
      onSubmit={form.onSubmit((values) =>
        save.mutate({ ...values, name: values.name.trim(), initialBalance: Number(values.initialBalance || 0), version: account?.version }),
      )}
    >
      <Stack>
        <TextInput label="Назва" placeholder="Наприклад: Картка ПриватБанку" data-autofocus withAsterisk {...form.getInputProps('name')} />
        <Select
          label="Тип"
          data={(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((type) => ({ value: type, label: ACCOUNT_TYPE_LABELS[type] }))}
          allowDeselect={false}
          {...form.getInputProps('type')}
        />
        <NumberInput
          label="Початковий баланс"
          description="Сума на рахунку на момент початку обліку"
          decimalScale={2}
          thousandSeparator=" "
          decimalSeparator=","
          hideControls
          {...form.getInputProps('initialBalance')}
        />
        <ColorInput label="Колір" swatches={PALETTE} swatchesPerRow={8} format="hex" {...form.getInputProps('color')} />
        {account && <Checkbox label="Архівний рахунок (не враховується в загальному балансі)" {...form.getInputProps('archived', { type: 'checkbox' })} />}
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Скасувати
          </Button>
          <Button type="submit" loading={save.isPending}>
            Зберегти
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
