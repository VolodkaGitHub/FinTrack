import { defineConfig, devices } from '@playwright/test';

/**
 * Тести запускаються проти вже піднятого стеку: `docker compose up -d --build --wait`.
 * Локально використовується встановлений Google Chrome, у CI — Chromium від Playwright.
 */
const channel = process.env.CI ? undefined : 'chrome';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8088',
    locale: 'uk-UA',
    timezoneId: 'Europe/Kyiv',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'api', testMatch: /api\.spec\.ts/ },
    { name: 'desktop', testMatch: /journeys\.spec\.ts/, use: { ...devices['Desktop Chrome'], channel } },
    { name: 'mobile', testMatch: /mobile\.spec\.ts/, use: { ...devices['Pixel 7'], channel } },
  ],
});
