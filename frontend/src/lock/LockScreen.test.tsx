import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LockScreen } from './LockProvider';
import type { LockConfig } from './lockStore';

vi.mock('./pin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pin')>()),
  verifyPin: vi.fn(async (pin: string) => pin === '1234'),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: null, logout: vi.fn() }),
}));

const config: LockConfig = {
  pin: { hash: 'x', salt: 'y', iterations: 1, length: 4 },
  timeoutMinutes: 5,
};

function renderLockScreen(onUnlock = vi.fn(), onLogout = vi.fn()) {
  render(
    <MantineProvider>
      <LockScreen config={config} userId={42} userName="Олена" onUnlock={onUnlock} onLogout={onLogout} />
    </MantineProvider>,
  );
  return { onUnlock, onLogout };
}

const firstPinInput = () => document.querySelector('input') as HTMLInputElement;

describe('LockScreen (REQ-4.4)', () => {
  beforeEach(() => localStorage.clear());

  it('unlocks with the correct PIN', async () => {
    const { onUnlock } = renderLockScreen();
    const user = userEvent.setup();
    await user.click(firstPinInput());
    await user.keyboard('1234');
    await waitFor(() => expect(onUnlock).toHaveBeenCalled());
  });

  it('counts failed attempts and logs out after the limit', async () => {
    localStorage.setItem('fintrack.lock.42.attempts', '3');
    const { onUnlock, onLogout } = renderLockScreen();
    const user = userEvent.setup();

    await user.click(firstPinInput());
    await user.keyboard('0000');
    expect(await screen.findByText(/Залишилось спроб: 1/)).toBeInTheDocument();

    await user.click(firstPinInput());
    await user.keyboard('9999');
    await waitFor(() => expect(onLogout).toHaveBeenCalled());
    expect(onUnlock).not.toHaveBeenCalled();
  });
});
