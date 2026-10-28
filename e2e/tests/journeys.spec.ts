import { devices, expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { authHeaders, confirmationLink, findId, registerUser, signIn, uniqueEmail } from './helpers';

const kyivDate = (format: 'iso' | 'ua') => {
  const iso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
  return format === 'iso' ? iso : iso.split('-').reverse().join('.');
};

async function addOperation(page: Page, amount: string, category: string, note: string, openFrom: 'Операція' | 'Нова операція' = 'Операція') {
  await page.getByRole('button', { name: openFrom, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Нова операція' });
  await dialog.getByLabel('Сума').fill(amount);
  await dialog.getByLabel('Категорія').click();
  await page.getByRole('option', { name: category, exact: true }).click();
  await dialog.getByLabel('Нотатка').fill(note);
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog).toBeHidden();
}

test('реєстрація з підтвердженням пошти, вихід і повторний вхід (REQ-4.1)', async ({ page, request }) => {
  const email = uniqueEmail('ui');
  await page.goto('/register');
  await page.getByLabel('Ім’я').fill('Тарас');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('secret123');
  await page.getByLabel('Повторіть пароль').fill('secret123');
  await page.getByRole('button', { name: 'Зареєструватися' }).click();
  await expect(page.getByText('Підтвердіть email')).toBeVisible();

  await page.goto(await confirmationLink(request, email));
  await expect(page.getByText('Вітаємо, Тарас!')).toBeVisible();

  await page.getByRole('button', { name: 'Меню користувача' }).click();
  await page.getByRole('menuitem', { name: 'Вийти' }).click();
  await expect(page.getByText('Вхід до FinTrack')).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('secret123');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByText('Вітаємо, Тарас!')).toBeVisible();
});

test('витрата зменшує залишок бюджету й надсилає сповіщення (REQ-1.1, REQ-2.2, REQ-2.3)', async ({ page, request }) => {
  const account = await registerUser(request);
  const groceries = await findId(request, account, '/api/categories', 'Продукти');
  await request.post('/api/budgets', {
    headers: authHeaders(account),
    data: { categoryId: groceries, amount: 1000, rollover: false, alertThreshold: 80 },
  });
  await signIn(page, account);
  await page.goto('/');
  await expect(page.getByText('Синхронізовано')).toBeVisible();

  await addOperation(page, '900', 'Продукти › Супермаркет', 'Закупівля на тиждень');
  await expect(page.getByText('Бюджет «Продукти» майже вичерпано').first()).toBeVisible();

  await page.getByRole('link', { name: 'Бюджети', exact: true }).click();
  await expect(page.getByText('Наближається до ліміту')).toBeVisible();
  await expect(page.getByText(/Залишок 100,00/)).toBeVisible();
  await page.getByRole('link', { name: 'Операції', exact: true }).click();
  await expect(page.getByText('Закупівля на тиждень')).toBeVisible();
});

test('зміни з телефону миттєво з’являються на ноутбуці, сеанс телефону можна завершити (REQ-4.2)', async ({ browser, request }) => {
  const account = await registerUser(request);
  const laptop = await (await browser.newContext()).newPage();
  const phone = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage();
  await signIn(laptop, account);
  await signIn(phone, account);

  await laptop.goto('/transactions');
  await expect(laptop.getByText('Нічого не знайдено')).toBeVisible();
  await phone.goto('/');
  await expect(phone.getByText(`Вітаємо, ${account.name}!`)).toBeVisible();
  await addOperation(phone, '125', 'Кафе та ресторани', 'Кава з телефону', 'Нова операція');

  // без перезавантаження сторінки на ноутбуці
  await expect(laptop.getByText('Кава з телефону')).toBeVisible();

  await laptop.goto('/settings');
  const phoneSession = laptop.getByText('Chrome · Android').locator('xpath=ancestor::div[.//button][1]');
  await phoneSession.getByRole('button', { name: 'Завершити' }).click();
  await expect(phone.getByText('Вхід до FinTrack')).toBeVisible();
});

test('доступ захищено PIN-кодом (REQ-4.4)', async ({ page, request }) => {
  const account = await registerUser(request);
  await signIn(page, account);
  await page.goto('/settings');
  const pins = page.locator('.mantine-PinInput-input');
  await pins.nth(0).click();
  await page.keyboard.type('2580');
  await pins.nth(4).click();
  await page.keyboard.type('2580');
  await page.getByRole('button', { name: 'Зберегти PIN' }).click();
  await expect(page.getByText('увімкнено')).toBeVisible();

  await page.getByRole('button', { name: 'Заблокувати зараз' }).click();
  await expect(page.getByText('FinTrack заблоковано')).toBeVisible();
  await page.locator('.mantine-PinInput-input').first().click();
  await page.keyboard.type('1111');
  await expect(page.getByText(/Невірний PIN-код/)).toBeVisible();
  await page.locator('.mantine-PinInput-input').first().click();
  await page.keyboard.type('2580');
  await expect(page.getByRole('heading', { name: 'Налаштування' })).toBeVisible();

  // після перезапуску застосунок знову вимагає PIN
  await page.reload();
  await expect(page.getByText('FinTrack заблоковано')).toBeVisible();
});

test('звіти PDF/Excel та експорт CSV завантажуються (REQ-3.3, REQ-4.3)', async ({ page, request }) => {
  const account = await registerUser(request);
  await request.post('/api/transactions', {
    headers: authHeaders(account),
    data: {
      type: 'EXPENSE', amount: 450, date: kyivDate('iso'),
      accountId: await findId(request, account, '/api/accounts', 'Готівка'),
      categoryId: await findId(request, account, '/api/categories', 'Кафе та ресторани'),
      note: 'Вечеря',
    },
  });
  await signIn(page, account);
  await page.goto('/analytics');
  await page.getByRole('tab', { name: 'Звіти' }).click();

  for (const [button, pattern, signature] of [
    ['Завантажити PDF', /^fintrack-report_.+\.pdf$/, '%PDF-'],
    ['Завантажити Excel', /^fintrack-report_.+\.xlsx$/, 'PK'],
  ] as const) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: button }).click()]);
    expect(download.suggestedFilename()).toMatch(pattern);
    const content = await readFile((await download.path())!);
    expect(content.subarray(0, signature.length).toString()).toBe(signature);
  }

  await page.getByRole('link', { name: 'Налаштування', exact: true }).click();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Завантажити CSV' }).click()]);
  expect(csv.suggestedFilename()).toMatch(/^fintrack-transactions_.+\.csv$/);
  const text = (await readFile((await csv.path())!)).toString('utf8');
  expect(text).toContain('date,type,amount,account,category,subcategory,to_account,note');
  expect(text).toContain('Вечеря');
});

test('імпорт банківської виписки з попереднім переглядом (REQ-4.3)', async ({ page, request }) => {
  const account = await registerUser(request);
  await signIn(page, account);
  await page.goto('/settings');
  const date = kyivDate('ua');
  const csv = `Дата;Сума;Опис\n${date};-1 250,40;Сільпо\n${date};500,00;Повернення боргу\n`;
  await page.locator('input[type="file"]').setInputFiles({ name: 'bank.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await page.getByRole('button', { name: 'Перевірити файл' }).click();
  await expect(page.getByText(/У файлі немає колонки рахунку/)).toBeVisible();

  await page.getByLabel('Рахунок за замовчуванням').first().click();
  await page.getByRole('option', { name: 'Банківська картка' }).click();
  await page.getByRole('button', { name: 'Перевірити файл' }).click();
  await page.getByRole('button', { name: 'Імпортувати 2 операцій' }).click();
  await expect(page.getByText('Імпорт завершено').first()).toBeVisible();

  await page.getByRole('link', { name: 'Операції', exact: true }).click();
  await expect(page.getByText('Сільпо')).toBeVisible();
  await expect(page.getByText('Повернення боргу')).toBeVisible();
});
