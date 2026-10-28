import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { tokenStore } from './auth/tokens';

vi.mock('./api/endpoints', async () => (await import('./test/apiMock')).endpoints);
vi.mock('@stomp/stompjs', () => ({
  Client: class {
    connectHeaders = {};
    activate() {}
    deactivate() {
      return Promise.resolve();
    }
    subscribe() {
      return { unsubscribe() {} };
    }
  },
}));

describe('App routing', () => {
  it('sends anonymous users to the login page', async () => {
    render(<App />);
    expect(await screen.findByText('Вхід до FinTrack')).toBeInTheDocument();
  });

  it('opens every module of the application for a signed-in user', async () => {
    const user = userEvent.setup();
    tokenStore.set({ accessToken: 'access', refreshToken: 'refresh' });
    render(<App />);
    // сторінки завантажуються ліниво (окремі чанки) — під навантаженням це може тривати кілька секунд
    expect(await screen.findByText('Вітаємо, Олена!', undefined, { timeout: 20_000 })).toBeInTheDocument();

    for (const page of ['Операції', 'Рахунки', 'Регулярні платежі', 'Бюджети', 'Категорії', 'Аналітика і звіти', 'Налаштування']) {
      await user.click(screen.getByRole('link', { name: page }));
      expect(await screen.findByRole('heading', { level: 2, name: page }, { timeout: 20_000 })).toBeInTheDocument();
    }
  }, 60_000);
});
