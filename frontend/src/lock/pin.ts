/**
 * REQ-4.4: PIN-код зберігається лише на пристрої і лише у вигляді хешу PBKDF2-SHA256 з сіллю (Web Crypto API).
 */
export interface PinHash {
  hash: string;
  salt: string;
  iterations: number;
  length: number;
}

const DEFAULT_ITERATIONS = 150_000;

export function isCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export async function hashPin(
  pin: string,
  salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(16)),
  iterations = DEFAULT_ITERATIONS,
): Promise<PinHash> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return { hash: toBase64(new Uint8Array(bits)), salt: toBase64(salt), iterations, length: pin.length };
}

export async function verifyPin(pin: string, stored: PinHash): Promise<boolean> {
  const candidate = await hashPin(pin, fromBase64(stored.salt), stored.iterations);
  return constantTimeEqual(candidate.hash, stored.hash);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
