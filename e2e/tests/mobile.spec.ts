import { expect, test } from '@playwright/test';
import { registerUser, signIn } from './helpers';

test('мобільна версія: навігація через меню без горизонтального прокручування', async ({ page, request }) => {
  const account = await registerUser(request);
  await signIn(page, account);
  await page.goto('/');
  await expect(page.getByText(`Вітаємо, ${account.name}!`)).toBeVisible();

  for (const section of ['Операції', 'Рахунки', 'Регулярні платежі', 'Бюджети', 'Категорії', 'Аналітика і звіти', 'Налаштування']) {
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page.getByRole('link', { name: section, exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: section })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `горизонтальне прокручування на сторінці «${section}»`).toBeLessThanOrEqual(0);
  }
});
