import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { nativeSessionStorage } from '@/lib/supabase-session-storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => {
  const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
  const Buffer = require('node:buffer').Buffer;

  class AESEncryptionKey {
    readonly bytes: Uint8Array;

    constructor(value: Uint8Array) {
      this.bytes = value;
    }

    static async generate() {
      return new AESEncryptionKey(randomBytes(32));
    }

    static async import(hex: string) {
      return new AESEncryptionKey(Buffer.from(hex, 'hex'));
    }

    async encoded() {
      return Buffer.from(this.bytes).toString('hex');
    }
  }

  class AESSealedData {
    readonly bytes: Uint8Array;

    constructor(value: Uint8Array) {
      this.bytes = value;
    }

    static fromCombined(encoded: string) {
      return new AESSealedData(Buffer.from(encoded, 'base64'));
    }

    async combined() {
      return Buffer.from(this.bytes).toString('base64');
    }
  }

  return {
    AESEncryptionKey,
    AESSealedData,
    aesEncryptAsync: async (
      plaintext: Uint8Array,
      key: AESEncryptionKey,
      options: { additionalData: Uint8Array },
    ) => {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key.bytes, iv);
      cipher.setAAD(Buffer.from(options.additionalData));
      return new AESSealedData(
        Buffer.concat([
          iv,
          cipher.update(Buffer.from(plaintext)),
          cipher.final(),
          cipher.getAuthTag(),
        ]),
      );
    },
    aesDecryptAsync: async (
      sealed: AESSealedData,
      key: AESEncryptionKey,
      options: { additionalData: Uint8Array },
    ) => {
      const iv = sealed.bytes.subarray(0, 12);
      const tag = sealed.bytes.subarray(-16);
      const ciphertext = sealed.bytes.subarray(12, -16);
      const decipher = createDecipheriv('aes-256-gcm', key.bytes, iv);
      decipher.setAAD(Buffer.from(options.additionalData));
      decipher.setAuthTag(tag);
      return new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
    },
  };
});

const encryptedValues = new Map<string, string>();
const secureKeys = new Map<string, string>();
const authKey = 'sb-project-auth-token';

const decodeCombined = (encoded: string): Uint8Array =>
  Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));

const encodeCombined = (bytes: Uint8Array): string =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));

beforeEach(() => {
  encryptedValues.clear();
  secureKeys.clear();
  jest.clearAllMocks();

  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation(async (key) => encryptedValues.get(key) ?? null);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
    encryptedValues.set(key, value);
  });
  jest.mocked(AsyncStorage.removeItem).mockImplementation(async (key) => {
    encryptedValues.delete(key);
  });
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async (key) => secureKeys.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
    secureKeys.set(key, value);
  });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    secureKeys.delete(key);
  });
});

describe('native Supabase auth storage', () => {
  it('round-trips a large Unicode session without placing it or its tokens in plain storage', async () => {
    const session = JSON.stringify({
      access_token: 'access-token-' + 'x'.repeat(5_000),
      refresh_token: 'refresh-token-secret',
      user: { name: 'José 👋' },
    });

    await nativeSessionStorage.setItem(authKey, session);

    expect(await nativeSessionStorage.getItem(authKey)).toBe(session);
    expect(encryptedValues.get(authKey)).not.toContain('access-token-');
    expect(encryptedValues.get(authKey)).not.toContain('refresh-token-secret');
    expect(secureKeys.get(`${authKey}.encryption-key`)).toMatch(/^[a-f0-9]{64}$/);
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
  });

  it('discards ciphertext when its secure key is unavailable after a restore', async () => {
    await nativeSessionStorage.setItem(authKey, 'session');
    secureKeys.clear();

    expect(await nativeSessionStorage.getItem(authKey)).toBeNull();
    expect(encryptedValues.has(authKey)).toBe(false);
  });

  it('uses a fresh IV for each encryption with the same key and stores it with the ciphertext and tag', async () => {
    await nativeSessionStorage.setItem(authKey, 'same-session');
    const firstKey = secureKeys.get(`${authKey}.encryption-key`);
    const first = decodeCombined(encryptedValues.get(authKey)!);

    await nativeSessionStorage.setItem(authKey, 'same-session');
    const second = decodeCombined(encryptedValues.get(authKey)!);

    expect(secureKeys.get(`${authKey}.encryption-key`)).toBe(firstKey);
    expect(first.length).toBe(12 + new TextEncoder().encode('same-session').length + 16);
    expect(second.length).toBe(first.length);
    expect(first.subarray(0, 12)).not.toEqual(second.subarray(0, 12));
    expect(await nativeSessionStorage.getItem(authKey)).toBe('same-session');
  });

  it('rejects tampered ciphertext with a safe error', async () => {
    await nativeSessionStorage.setItem(authKey, 'private-session');
    encryptedValues.set(authKey, 'dGFtcGVyZWQ=');

    await expect(nativeSessionStorage.getItem(authKey)).rejects.toThrow(
      'Unable to read the encrypted auth session',
    );
  });

  it.each([0, 12, -1])('rejects tampering at combined-data offset %i', async (offset) => {
    await nativeSessionStorage.setItem(authKey, 'private-session');
    const combined = decodeCombined(encryptedValues.get(authKey)!);
    const index = offset < 0 ? combined.length + offset : offset;
    combined[index] = combined[index]! ^ 1;
    encryptedValues.set(authKey, encodeCombined(combined));

    await expect(nativeSessionStorage.getItem(authKey)).rejects.toThrow(
      'Unable to read the encrypted auth session',
    );
  });

  it('rejects ciphertext copied under another storage key even with the same encryption key', async () => {
    await nativeSessionStorage.setItem(authKey, 'private-session');
    const otherKey = `${authKey}-other`;
    encryptedValues.set(otherKey, encryptedValues.get(authKey)!);
    secureKeys.set(`${otherKey}.encryption-key`, secureKeys.get(`${authKey}.encryption-key`)!);

    await expect(nativeSessionStorage.getItem(otherKey)).rejects.toThrow(
      'Unable to read the encrypted auth session',
    );
  });

  it('rejects malformed ciphertext and key material without returning a session', async () => {
    await nativeSessionStorage.setItem(authKey, 'private-session');
    encryptedValues.set(authKey, 'not a sealed AES-GCM value');
    await expect(nativeSessionStorage.getItem(authKey)).rejects.toThrow(
      'Unable to read the encrypted auth session',
    );

    await nativeSessionStorage.setItem(authKey, 'private-session');
    secureKeys.set(`${authKey}.encryption-key`, 'invalid-key');
    await expect(nativeSessionStorage.getItem(authKey)).rejects.toThrow(
      'Unable to read the encrypted auth session',
    );
  });

  it('does not write a session when saving its secure key fails, and allows a retry', async () => {
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('Keychain unavailable'));

    await expect(nativeSessionStorage.setItem(authKey, 'private-session')).rejects.toThrow();
    expect(encryptedValues.has(authKey)).toBe(false);

    await nativeSessionStorage.setItem(authKey, 'private-session');
    expect(await nativeSessionStorage.getItem(authKey)).toBe('private-session');
  });

  it('propagates encrypted storage write failures without storing plaintext', async () => {
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Storage unavailable'));

    await expect(nativeSessionStorage.setItem(authKey, 'private-session')).rejects.toThrow(
      'Storage unavailable',
    );
    expect(encryptedValues.has(authKey)).toBe(false);
    expect([...secureKeys.values()].every((value) => /^[a-f0-9]{64}$/.test(value))).toBe(true);
  });

  it('does not report a missing session if cleanup of ciphertext without a key fails', async () => {
    await nativeSessionStorage.setItem(authKey, 'private-session');
    secureKeys.clear();
    jest.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error('Removal unavailable'));

    await expect(nativeSessionStorage.getItem(authKey)).rejects.toThrow('Removal unavailable');
    expect(encryptedValues.has(authKey)).toBe(true);
  });

  it('reports each failed removal and allows removal to be retried', async () => {
    await nativeSessionStorage.setItem(authKey, 'private-session');
    jest.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error('Storage unavailable'));

    await expect(nativeSessionStorage.removeItem(authKey)).rejects.toThrow('Storage unavailable');
    expect(encryptedValues.has(authKey)).toBe(true);
    expect(secureKeys.has(`${authKey}.encryption-key`)).toBe(true);

    jest
      .mocked(SecureStore.deleteItemAsync)
      .mockRejectedValueOnce(new Error('Keychain unavailable'));
    await expect(nativeSessionStorage.removeItem(authKey)).rejects.toThrow('Keychain unavailable');
    expect(encryptedValues.has(authKey)).toBe(false);
    expect(secureKeys.has(`${authKey}.encryption-key`)).toBe(true);

    await nativeSessionStorage.removeItem(authKey);
    expect(secureKeys.has(`${authKey}.encryption-key`)).toBe(false);
  });

  it('serializes successive writes and removes both the ciphertext and key on sign-out', async () => {
    await Promise.all([
      nativeSessionStorage.setItem(authKey, 'first'),
      nativeSessionStorage.setItem(authKey, 'second'),
    ]);
    expect(await nativeSessionStorage.getItem(authKey)).toBe('second');

    await nativeSessionStorage.removeItem(authKey);
    expect(await nativeSessionStorage.getItem(authKey)).toBeNull();
    expect(encryptedValues.has(authKey)).toBe(false);
    expect(secureKeys.has(`${authKey}.encryption-key`)).toBe(false);
  });
});
