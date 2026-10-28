import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LockProvider, useLock } from './LockProvider';
import { loadLockConfig, saveLockConfig } from './lockStore';

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, email: 'olena@example.com', displayName: 'Олена' }, logout }),
}));
vi.mock('./pin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pin')>()),
  hashPin: vi.fn(async (pin: string) => ({ hash: `hash-${pin}`, salt: 'salt', iterations: 1, length: pin.length })),
  verifyPin: vi.fn(async (pin: string, stored: { hash: string }) => stored.hash === `hash-${pin}`),
}));
vi.mock('./biometric', () => ({
  registerBiometric: vi.fn(async () => 'credential-1'),
  verifyBiometric: vi.fn(async () => true),
}));

function Controls() {
  const lock = useLock();
  const [checked, setChecked] = useState('-');
  return (
    <div>
      <span data-testid="enabled">{String(lock.enabled)}</span>
      <span data-testid="timeout">{lock.config?.timeoutMinutes ?? '-'}</span>
      <span data-testid="biometric">{lock.config?.biometricCredentialId ?? '-'}</span>
      <span data-testid="checked">{checked}</span>
      <button onClick={() => void lock.setPin('2580')}>set-pin</button>
      <button onClick={lock.lock}>lock</button>
      <button onClick={lock.disable}>disable</button>
      <button onClick={() => lock.setTimeoutMinutes(15)}>timeout</button>
      <button onClick={() => void lock.enableBiometric()}>biometric-on</button>
      <button onClick={lock.disableBiometric}>biometric-off</button>
      <button onClick={() => void lock.checkPin('2580').then((ok) => setChecked(String(ok)))}>check</button>
    </div>
  );
}

const renderLock = () =>
  render(
    <MantineProvider env="test">
      <LockProvider>
        <Controls />
      </LockProvider>
    </MantineProvider>,
  );

const pinConfig = { pin: { hash: 'hash-2580', salt: 'salt', iterations: 1, length: 4 }, timeoutMinutes: 5 };

describe('LockProvider (REQ-4.4)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  beforeEach(() => logout.mockClear());

  it('does not lock without a PIN and locks on demand after the PIN is set', async () => {
    const user = userEvent.setup();
    renderLock();
    expect(screen.getByTestId('enabled').textContent).toBe('false');

    await user.click(screen.getByText('set-pin'));
    expect(await screen.findByText('true')).toBeInTheDocument();
    expect(loadLockConfig(7)?.pin.hash).toBe('hash-2580');

    await user.click(screen.getByText('check'));
    expect(await screen.findByTestId('checked')).toHaveTextContent('true');

    await user.click(screen.getByText('lock'));
    expect(screen.getByText('FinTrack заблоковано')).toBeInTheDocument();
    await user.click(document.querySelector('input') as HTMLInputElement);
    await user.keyboard('2580');
    expect(await screen.findByTestId('enabled')).toHaveTextContent('true');
  });

  it('starts locked when a PIN is configured on this device', () => {
    saveLockConfig(7, pinConfig);
    renderLock();
    expect(screen.getByText('FinTrack заблоковано')).toBeInTheDocument();
    expect(screen.getByText(/Олена, введіть/)).toBeInTheDocument();
  });

  it('manages timeout, biometrics and disabling', async () => {
    const user = userEvent.setup();
    renderLock();
    await user.click(screen.getByText('set-pin'));
    await user.click(screen.getByText('timeout'));
    expect(screen.getByTestId('timeout')).toHaveTextContent('15');
    await user.click(screen.getByText('biometric-on'));
    expect(await screen.findByText('credential-1')).toBeInTheDocument();
    await user.click(screen.getByText('biometric-off'));
    expect(screen.getByTestId('biometric')).toHaveTextContent('-');
    await user.click(screen.getByText('disable'));
    expect(screen.getByTestId('enabled')).toHaveTextContent('false');
    expect(loadLockConfig(7)).toBeNull();
  });

  it('locks after inactivity', async () => {
    vi.useFakeTimers();
    renderLock();
    await act(async () => {
      fireEvent.click(screen.getByText('set-pin'));
    });
    expect(screen.getByTestId('enabled')).toHaveTextContent('true');
    act(() => {
      vi.advanceTimersByTime(5 * 60_000 + 10);
    });
    expect(screen.getByText('FinTrack заблоковано')).toBeInTheDocument();
  });

  it('locks when the app returns from background after the timeout', async () => {
    renderLock();
    await act(async () => {
      fireEvent.click(screen.getByText('set-pin'));
    });
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const setHidden = (hidden: boolean) => {
      Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    };
    setHidden(true);
    now.mockReturnValue(1_000_000 + 60_000);
    setHidden(false);
    expect(screen.queryByText('FinTrack заблоковано')).toBeNull();

    setHidden(true);
    now.mockReturnValue(1_000_000 + 60_000 + 6 * 60_000);
    setHidden(false);
    expect(screen.getByText('FinTrack заблоковано')).toBeInTheDocument();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  it('requires the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useLock())).toThrow('useLock must be used inside LockProvider');
  });
});
