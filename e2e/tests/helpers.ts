import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8026';
export const PASSWORD = 'secret123';

export interface TestAccount {
  email: string;
  password: string;
  name: string;
  accessToken: string;
}

export const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@fintrack.test`;

/** Посилання з листа підтвердження, який backend надіслав у Mailpit (REQ-4.1). */
export async function confirmationLink(request: APIRequestContext, email: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await request.get(`${MAILPIT_URL}/api/v1/search`, { params: { query: `to:${email}` } });
        const list = (await search.json()) as { messages?: Array<{ ID: string }> };
        if (!list.messages?.length) {
          return undefined;
        }
        const message = (await (await request.get(`${MAILPIT_URL}/api/v1/message/${list.messages[0].ID}`)).json()) as { Text: string };
        link = message.Text.match(/https?:\/\/\S+verify-email\?token=[\w-]+/)?.[0];
        return link;
      },
      { timeout: 20_000, message: `confirmation e-mail for ${email}` },
    )
    .toBeTruthy();
  return link!;
}

/** Реєстрація з підтвердженням пошти через API — підготовка даних для UI-сценаріїв. */
export async function registerUser(request: APIRequestContext, name = 'Олена'): Promise<TestAccount> {
  const email = uniqueEmail('e2e');
  const register = await request.post('/api/auth/register', { data: { email, password: PASSWORD, displayName: name } });
  expect(register.status()).toBe(202);
  const token = new URL(await confirmationLink(request, email)).searchParams.get('token');
  const verified = await request.post('/api/auth/verify-email', { data: { token } });
  expect(verified.ok()).toBeTruthy();
  const body = (await verified.json()) as { accessToken: string };
  return { email, password: PASSWORD, name, accessToken: body.accessToken };
}

export const authHeaders = (account: TestAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

export async function findId(request: APIRequestContext, account: TestAccount, path: string, name: string): Promise<number> {
  const items = (await (await request.get(path, { headers: authHeaders(account) })).json()) as Array<{ id: number; name: string }>;
  const item = items.find((candidate) => candidate.name === name);
  expect(item, `${name} in ${path}`).toBeDefined();
  return item!.id;
}

/** Вхід на «окремому пристрої»: власна сесія (refresh-токен) для кожної сторінки/контексту браузера. */
export async function signIn(page: Page, account: TestAccount): Promise<void> {
  const response = await page.request.post('/api/auth/login', { data: { email: account.email, password: account.password } });
  expect(response.ok()).toBeTruthy();
  const tokens = (await response.json()) as { accessToken: string; refreshToken: string };
  await page.addInitScript(([access, refresh]) => {
    if (!window.localStorage.getItem('fintrack.refreshToken')) {
      window.localStorage.setItem('fintrack.accessToken', access);
      window.localStorage.setItem('fintrack.refreshToken', refresh);
    }
  }, [tokens.accessToken, tokens.refreshToken]);
}
