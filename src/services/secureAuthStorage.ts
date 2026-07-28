import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

const serviceForKey = (key: string) => `com.pamisu.choosr.auth.${key}`;

/**
 * Supabase's native auth session contains a long-lived refresh token. Keep it
 * in the OS credential store and migrate an existing AsyncStorage session on
 * first read so upgrading the app does not silently create a new identity.
 */
export const secureAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const stored = await Keychain.getGenericPassword({
      service: serviceForKey(key),
    });
    if (stored) return stored.password;

    const legacyValue = await AsyncStorage.getItem(key);
    if (!legacyValue) return null;
    await secureAuthStorage.setItem(key, legacyValue);
    return legacyValue;
  },

  async setItem(key: string, value: string): Promise<void> {
    await Keychain.setGenericPassword(key, value, {
      service: serviceForKey(key),
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await AsyncStorage.removeItem(key);
  },

  async removeItem(key: string): Promise<void> {
    await Promise.all([
      Keychain.resetGenericPassword({ service: serviceForKey(key) }),
      AsyncStorage.removeItem(key),
    ]);
  },
};
