import AsyncStorage from '@react-native-async-storage/async-storage';
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

// Supabase can store a full session (and PKCE state), which may exceed SecureStore's value limit.
// Only the fixed-size encryption key goes in SecureStore; app storage holds authenticated ciphertext.
const encryptionKeyName = (key: string) => `${key}.encryption-key`;

let pending: Promise<void> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export const nativeSessionStorage = {
  getItem: (key: string): Promise<string | null> =>
    serialize(async () => {
      const encrypted = await AsyncStorage.getItem(key);
      if (encrypted === null) return null;

      const encodedKey = await SecureStore.getItemAsync(encryptionKeyName(key));
      if (encodedKey === null) {
        // Android restore can retain ciphertext without its Keystore-backed key.
        await AsyncStorage.removeItem(key);
        return null;
      }

      try {
        const encryptionKey = await AESEncryptionKey.import(encodedKey, 'hex');
        const sealed = AESSealedData.fromCombined(encrypted);
        const plaintext = await aesDecryptAsync(sealed, encryptionKey, {
          additionalData: new TextEncoder().encode(key),
        });
        return new TextDecoder().decode(plaintext);
      } catch {
        throw new Error('Unable to read the encrypted auth session');
      }
    }),

  setItem: (key: string, value: string): Promise<void> =>
    serialize(async () => {
      const keyName = encryptionKeyName(key);
      let encodedKey = await SecureStore.getItemAsync(keyName);
      if (encodedKey === null) {
        const newKey = await AESEncryptionKey.generate();
        encodedKey = await newKey.encoded('hex');
        await SecureStore.setItemAsync(keyName, encodedKey);
      }

      const encryptionKey = await AESEncryptionKey.import(encodedKey, 'hex');
      const sealed = await aesEncryptAsync(new TextEncoder().encode(value), encryptionKey, {
        additionalData: new TextEncoder().encode(key),
      });
      await AsyncStorage.setItem(key, await sealed.combined('base64'));
    }),

  removeItem: (key: string): Promise<void> =>
    serialize(async () => {
      await AsyncStorage.removeItem(key);
      await SecureStore.deleteItemAsync(encryptionKeyName(key));
    }),
};
