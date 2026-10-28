import { expect, test, type APIRequestContext } from '@playwright/test';
import { authHeaders, confirmationLink, findId, PASSWORD, registerUser, uniqueEmail, type TestAccount } from './helpers';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });

function client(request: APIRequestContext, account: TestAccount) {
  const headers = authHeaders(account);
  return {
    get: async (path: string) => (await request.get(path, { headers })).json(),
    post: (path: string, data: unknown) => request.post(path, { headers, data }),
    raw: (path: string) => request.get(path, { headers }),
  };
}

test('реєстрація вимагає підтвердження електронної пошти (REQ-4.1)', async ({ request }) => {
  const email = uniqueEmail('api');
  const registered = await request.post('/api/auth/register', { data: { email, password: PASSWORD, displayName: 'API' } });
  expect(registered.status()).toBe(202);
  const blocked = await request.post('/api/auth/login', { data: { email, password: PASSWORD } });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).code).toBe('EMAIL_NOT_VERIFIED');
  expect(await confirmationLink(request, email)).toContain('/verify-email?token=');
});

test('облік, бюджети, аналітика, звіти та CSV через REST API', async ({ request }) => {
  const account = await registerUser(request);
  const api = client(request, account);
  const card = await findId(request, account, '/api/accounts', 'Банківська картка');
  const cash = await findId(request, account, '/api/accounts', 'Готівка');
  const category = (name: string) => findId(request, account, '/api/categories', name);
  const date = today();

  expect((await api.post('/api/transactions', { type: 'INCOME', amount: 42000, date, accountId: card, categoryId: await category('Зарплата') })).status()).toBe(201);
  for (const [name, amount] of [['Супермаркет', 2450.75], ['Кафе та ресторани', 680], ['Таксі', 320]] as const) {
    expect((await api.post('/api/transactions', { type: 'EXPENSE', amount, date, accountId: card, categoryId: await category(name) })).status()).toBe(201);
  }
  expect((await api.post('/api/transactions', { type: 'TRANSFER', amount: 2000, date, accountId: card, toAccountId: cash })).status()).toBe(201);

  // REQ-1.2: окремі баланси рахунків
  const accounts = (await api.get('/api/accounts')) as Array<{ id: number; balance: number }>;
  expect(accounts.find((a) => a.id === card)?.balance).toBeCloseTo(42000 - 2450.75 - 680 - 320 - 2000, 2);
  expect(accounts.find((a) => a.id === cash)?.balance).toBe(2000);

  // REQ-1.4: фільтр за батьківською категорією включає підкатегорії
  const transport = await api.get(`/api/transactions?categoryId=${await category('Транспорт')}`);
  expect(transport.totalElements).toBe(1);

  // REQ-2.2 / 2.3: бюджет і сповіщення
  const budget = await api.post('/api/budgets', { categoryId: await category('Продукти'), amount: 3000, rollover: true, alertThreshold: 80 });
  expect((await budget.json()).state).toBe('WARNING');
  const notifications = await api.get('/api/notifications');
  expect(notifications.items[0].type).toBe('BUDGET_WARNING');

  // REQ-3.1 / 3.2 / 3.4
  const shares = (await api.get('/api/analytics/categories?type=EXPENSE')) as Array<{ percent: number }>;
  expect(shares.reduce((sum, item) => sum + item.percent, 0)).toBeCloseTo(100, 0);
  expect((await api.get('/api/analytics/monthly')).points).toHaveLength(12);
  expect(typeof (await api.get('/api/analytics/forecast')).projectedEndBalance).toBe('number');

  // REQ-3.3: звіти
  const from = `${date.slice(0, 8)}01`;
  const pdf = await api.raw(`/api/reports/summary?format=pdf&from=${from}&to=${date}`);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  const xlsx = await api.raw(`/api/reports/summary?format=xlsx&from=${from}&to=${date}`);
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe('PK');

  // REQ-4.3: експорт і повторний імпорт розпізнає дублікати
  const csv = await (await api.raw('/api/data/export')).body();
  const reimport = await request.post('/api/data/import?dryRun=true', {
    headers: authHeaders(account),
    multipart: { file: { name: 'export.csv', mimeType: 'text/csv', buffer: csv } },
  });
  const preview = await reimport.json();
  expect(preview.duplicateRows).toBe(preview.totalRows);

  // OpenAPI-документація
  const docs = await (await request.get('/v3/api-docs')).json();
  expect(Object.keys(docs.paths).length).toBeGreaterThan(25);
});

test('зміни доходять на інші пристрої через WebSocket (REQ-4.2)', async ({ request, baseURL }) => {
  const account = await registerUser(request);
  const api = client(request, account);
  const events: Array<{ entity: string; originClientId: string | null }> = [];
  const socket = new WebSocket(`${baseURL!.replace(/^http/, 'ws')}/ws`);
  await new Promise<void>((resolve, reject) => {
    socket.onerror = () => reject(new Error('WebSocket error'));
    socket.onmessage = (event) => {
      const frame = String(event.data);
      if (frame.startsWith('CONNECTED')) {
        socket.send('SUBSCRIBE\nid:sync\ndestination:/user/queue/sync\n\n\0');
        setTimeout(resolve, 500);
      } else if (frame.startsWith('MESSAGE')) {
        events.push(JSON.parse(frame.slice(frame.indexOf('\n\n') + 2).replace(/\0$/, '')));
      }
    };
    socket.onopen = () => socket.send(`CONNECT\naccept-version:1.2\nheart-beat:0,0\nAuthorization:Bearer ${account.accessToken}\n\n\0`);
  });

  const response = await request.post('/api/transactions', {
    headers: { ...authHeaders(account), 'X-Client-Id': 'phone' },
    data: {
      type: 'EXPENSE', amount: 85, date: today(),
      accountId: await findId(request, account, '/api/accounts', 'Готівка'),
      categoryId: await findId(request, account, '/api/categories', 'Кафе та ресторани'),
    },
  });
  expect(response.status()).toBe(201);
  await expect.poll(() => events.find((e) => e.entity === 'transactions')?.originClientId).toBe('phone');
  socket.close();
  expect(await api.get('/api/users/me')).toMatchObject({ email: account.email });
});
