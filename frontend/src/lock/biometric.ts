import { fromBase64, toBase64 } from './pin';

/**
 * REQ-4.4: біометрія через WebAuthn з вбудованим автентифікатором пристрою
 * (Windows Hello, Touch ID / Face ID, відбиток пальця на Android). Перевірка відбувається локально на клієнті.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.isSecureContext || typeof PublicKeyCredential === 'undefined') {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function registerBiometric(userId: number, userName: string): Promise<string> {
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'FinTrack' },
      user: {
        id: new TextEncoder().encode(`fintrack-${userId}`),
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged',
      },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error('Біометричні дані не зареєстровано');
  }
  return toBase64(new Uint8Array(credential.rawId));
}

/** true — користувач підтвердив особу біометрією (прапорець UV в authenticatorData). */
export async function verifyBiometric(credentialId: string): Promise<boolean> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: fromBase64(credentialId), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!assertion) {
    return false;
  }
  const authenticatorData = new Uint8Array((assertion.response as AuthenticatorAssertionResponse).authenticatorData);
  const USER_VERIFIED = 0x04;
  return (authenticatorData[32] & USER_VERIFIED) !== 0;
}
