import { Button, Checkbox, Collapse, Group, Modal, NumberInput, SegmentedControl, Select, Stack, Switch, Text, Textarea } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { recurringApi, transactionsApi } from '../api/endpoints';
import { useEntityMutation, useLookups } from '../api/hooks';
import type { Frequency, Transaction, TransactionInput, TransactionType } from '../api/types';
import { useCurrency } from '../auth/AuthContext';
import { categoryOptions } from '../utils/categories';
import { formatMoney } from '../utils/format';

export interface TransactionDefaults {
  type?: TransactionType;
  accountId?: number;
  toAccountId?: number;
  categoryId?: number;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  transaction?: Transaction | null;
  defaults?: TransactionDefaults;
}

/** REQ-1.1: ручне додавання/редагування доходу, витрати або переказу (REQ-1.3 — одразу як регулярної операції). */
export function TransactionFormModal({ opened, onClose, transaction, defaults }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={transaction ? 'Редагувати операцію' : 'Нова операція'} size="lg" centered>
      {opened && <TransactionForm transaction={transaction} defaults={defaults} onDone={onClose} />}
    </Modal>
  );
}

interface FormValues {
  type: TransactionType;
  amount: number | string;
  date: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  note: string;
  recurring: boolean;
  frequency: Frequency;
  autoCreate: boolean;
}

function TransactionForm({ transaction, defaults, onDone }: { transaction?: Transaction | null; defaults?: TransactionDefaults; onDone: () => void }) {
  const { accounts, categories, categoryById } = useLookups();
  const currency = useCurrency();
  const activeAccounts = accounts.filter(
    (a) => !a.archived || a.id === transaction?.accountId || a.id === transaction?.toAccountId,
  );
  const accountOptions = activeAccounts.map((a) => ({ value: String(a.id), label: `${a.name} · ${formatMoney(a.balance, currency)}` }));

  const form = useForm<FormValues>({
    initialValues: {
      type: transaction?.type ?? defaults?.type ?? 'EXPENSE',
      amount: transaction?.amount ?? '',
      date: transaction?.date ?? dayjs().format('YYYY-MM-DD'),
      accountId: String(transaction?.accountId ?? defaults?.accountId ?? activeAccounts[0]?.id ?? ''),
      toAccountId: String(transaction?.toAccountId ?? defaults?.toAccountId ?? ''),
      categoryId: String(transaction?.categoryId ?? defaults?.categoryId ?? ''),
      note: transaction?.note ?? '',
      recurring: false,
      frequency: 'MONTHLY',
      autoCreate: true,
    },
    validate: {
      amount: (value) => (Number(value) > 0 ? null : 'Вкажіть суму, більшу за нуль'),
      date: (value) => (value ? null : 'Вкажіть дату'),
      accountId: (value) => (value ? null : 'Оберіть рахунок'),
      toAccountId: (value, values) =>
        values.type !== 'TRANSFER' ? null : !value ? 'Оберіть рахунок зарахування' : value === values.accountId ? 'Оберіть інший рахунок' : null,
      categoryId: (value, values) => (values.type === 'TRANSFER' || value ? null : 'Оберіть категорію'),
      note: (value) => (value.length > 500 ? 'Нотатка задовга' : null),
    },
  });

  const values = form.values;
  const options = useMemo(
    () => (values.type === 'TRANSFER' ? [] : categoryOptions(categories, values.type)),
    [categories, values.type],
  );

  const create = useEntityMutation('transactions', (input: TransactionInput) => transactionsApi.create(input), {
    success: 'Операцію додано',
    onSuccess: onDone,
  });
  const update = useEntityMutation('transactions', (input: TransactionInput) => transactionsApi.update(transaction!.id, input), {
    success: 'Зміни збережено',
    onSuccess: onDone,
  });
  const createRecurring = useEntityMutation('recurring', recurringApi.create, {
    success: 'Регулярну операцію створено',
    onSuccess: onDone,
  });

  const submit = form.onSubmit((v) => {
    const input: TransactionInput = {
      type: v.type,
      amount: Number(v.amount),
      date: v.date,
      accountId: Number(v.accountId),
      toAccountId: v.type === 'TRANSFER' ? Number(v.toAccountId) : null,
      categoryId: v.type === 'TRANSFER' ? null : Number(v.categoryId),
      note: v.note.trim() || null,
      version: transaction?.version,
    };
    if (transaction) {
      update.mutate(input);
    } else if (v.recurring && v.type !== 'TRANSFER') {
      const category = categoryById.get(Number(v.categoryId));
      createRecurring.mutate({
        name: (v.note.trim() || category?.name || 'Регулярна операція').slice(0, 100),
        type: v.type,
        amount: Number(v.amount),
        accountId: Number(v.accountId),
        categoryId: Number(v.categoryId),
        note: v.note.trim() || null,
        frequency: v.frequency,
        intervalCount: 1,
        startDate: v.date,
        autoCreate: v.autoCreate,
      });
    } else {
      create.mutate(input);
    }
  });

  const pending = create.isPending || update.isPending || createRecurring.isPending;

  return (
    <form onSubmit={submit}>
      <Stack gap="sm">
        <SegmentedControl
          fullWidth
          value={values.type}
          onChange={(type) => {
            form.setFieldValue('type', type as TransactionType);
            form.setFieldValue('categoryId', '');
          }}
          data={[
            { value: 'EXPENSE', label: 'Витрата' },
            { value: 'INCOME', label: 'Дохід' },
            { value: 'TRANSFER', label: 'Переказ' },
          ]}
          color={values.type === 'INCOME' ? 'teal' : values.type === 'EXPENSE' ? 'red' : 'blue'}
        />
        <Group grow align="flex-start">
          <NumberInput
            label="Сума"
            placeholder="0,00"
            data-autofocus
            min={0}
            decimalScale={2}
            thousandSeparator=" "
            decimalSeparator=","
            allowNegative={false}
            hideControls
            withAsterisk
            {...form.getInputProps('amount')}
          />
          <DateInput label="Дата" valueFormat="DD.MM.YYYY" withAsterisk {...form.getInputProps('date')} />
        </Group>
        <Group grow align="flex-start">
          <Select
            label={values.type === 'TRANSFER' ? 'З рахунку' : 'Рахунок'}
            data={accountOptions}
            allowDeselect={false}
            withAsterisk
            {...form.getInputProps('accountId')}
          />
          {values.type === 'TRANSFER' ? (
            <Select
              label="На рахунок"
              data={accountOptions.filter((o) => o.value !== values.accountId)}
              withAsterisk
              {...form.getInputProps('toAccountId')}
            />
          ) : (
            <Select
              label="Категорія"
              placeholder="Оберіть категорію"
              data={options}
              searchable
              nothingFoundMessage="Категорію не знайдено"
              withAsterisk
              {...form.getInputProps('categoryId')}
            />
          )}
        </Group>
        <Textarea label="Нотатка" placeholder="Наприклад: продукти на тиждень" autosize minRows={2} maxRows={4} {...form.getInputProps('note')} />

        {!transaction && values.type !== 'TRANSFER' && (
          <>
            <Checkbox
              label="Повторювати регулярно (підписка, комунальні платежі, зарплата)"
              {...form.getInputProps('recurring', { type: 'checkbox' })}
            />
            <Collapse in={values.recurring}>
              <Group grow align="flex-end">
                <Select
                  label="Періодичність"
                  data={[
                    { value: 'DAILY', label: 'Щодня' },
                    { value: 'WEEKLY', label: 'Щотижня' },
                    { value: 'MONTHLY', label: 'Щомісяця' },
                    { value: 'YEARLY', label: 'Щороку' },
                  ]}
                  allowDeselect={false}
                  {...form.getInputProps('frequency')}
                />
                <Switch
                  label="Створювати автоматично"
                  description="Інакше — лише нагадування"
                  {...form.getInputProps('autoCreate', { type: 'checkbox' })}
                />
              </Group>
              <Text size="xs" c="dimmed" mt={6}>
                {values.autoCreate
                  ? 'Перша операція буде записана на обрану дату, наступні — автоматично за розкладом.'
                  : 'FinTrack нагадає про платіж у потрібний день, а додати його можна одним натисканням.'}
              </Text>
            </Collapse>
          </>
        )}

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onDone}>
            Скасувати
          </Button>
          <Button type="submit" loading={pending}>
            {transaction ? 'Зберегти' : 'Додати'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
