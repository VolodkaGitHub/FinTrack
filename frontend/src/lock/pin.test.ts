// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hashPin, isValidPin, verifyPin } from './pin';

describe('PIN hashing (REQ-4.4)', () => {
  it('verifies the correct PIN and rejects a wrong one', async () => {
    const stored = await hashPin('2580', undefined, 1000);
    expect(stored.hash).not.toContain('2580');
    expect(stored.length).toBe(4);
    await expect(verifyPin('2580', stored)).resolves.toBe(true);
    await expect(verifyPin('2581', stored)).resolves.toBe(false);
  });

  it('uses a random salt for every hash', async () => {
    const first = await hashPin('1111', undefined, 1000);
    const second = await hashPin('1111', undefined, 1000);
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });

  it('accepts only 4–6 digits', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });
});
