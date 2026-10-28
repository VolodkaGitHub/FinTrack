import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isBiometricAvailable, registerBiometric, verifyBiometric } from './biometric';

const create = vi.fn();
const get = vi.fn();

function assertionWithFlags(flags: number) {
  const authenticatorData = new Uint8Array(37);
  authenticatorData[32] = flags;
  return { response: { authenticatorData: authenticatorData.buffer } };
}

describe('biometric unlock (REQ-4.4)', () => {
  beforeEach(() => {
    create.mockReset();
    get.mockReset();
    Object.defineProperty(navigator, 'credentials', { value: { create, get }, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'PublicKeyCredential');
  });

  it('is available only with a user-verifying platform authenticator in a secure context', async () => {
    await expect(isBiometricAvailable()).resolves.toBe(false);

    const check = vi.fn(async () => true);
    Object.defineProperty(globalThis, 'PublicKeyCredential', {
      value: { isUserVerifyingPlatformAuthenticatorAvailable: check },
      configurable: true,
    });
    await expect(isBiometricAvailable()).resolves.toBe(true);

    check.mockRejectedValueOnce(new Error('not allowed'));
    await expect(isBiometricAvailable()).resolves.toBe(false);

    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    await expect(isBiometricAvailable()).resolves.toBe(false);
  });

  it('registers a platform credential that requires user verification', async () => {
    create.mockResolvedValue({ rawId: new Uint8Array([1, 2, 3]).buffer });
    await expect(registerBiometric(7, 'olena@example.com')).resolves.toBe('AQID');
    const options = create.mock.calls[0][0].publicKey;
    expect(options.authenticatorSelection).toMatchObject({ authenticatorAttachment: 'platform', userVerification: 'required' });
    expect(options.user.name).toBe('olena@example.com');

    create.mockResolvedValue(null);
    await expect(registerBiometric(7, 'olena@example.com')).rejects.toThrow('не зареєстровано');
  });

  it('accepts an assertion only when the user was verified', async () => {
    get.mockResolvedValueOnce(assertionWithFlags(0x05));
    await expect(verifyBiometric('AQID')).resolves.toBe(true);
    expect(Array.from(new Uint8Array(get.mock.calls[0][0].publicKey.allowCredentials[0].id))).toEqual([1, 2, 3]);

    get.mockResolvedValueOnce(assertionWithFlags(0x01));
    await expect(verifyBiometric('AQID')).resolves.toBe(false);

    get.mockResolvedValueOnce(null);
    await expect(verifyBiometric('AQID')).resolves.toBe(false);
  });
});
