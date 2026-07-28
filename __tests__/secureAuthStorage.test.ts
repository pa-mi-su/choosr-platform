import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

import { secureAuthStorage } from '../src/services/secureAuthStorage';

const getGenericPassword = Keychain.getGenericPassword as jest.Mock;
const setGenericPassword = Keychain.setGenericPassword as jest.Mock;
const resetGenericPassword = Keychain.resetGenericPassword as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  getGenericPassword.mockResolvedValue(false);
});

test('migrates a legacy Supabase session into device-only secure storage', async () => {
  await AsyncStorage.setItem('supabase-auth-token', 'legacy-session');

  await expect(secureAuthStorage.getItem('supabase-auth-token')).resolves.toBe(
    'legacy-session',
  );
  expect(setGenericPassword).toHaveBeenCalledWith(
    'supabase-auth-token',
    'legacy-session',
    expect.objectContaining({
      accessible: 'WhenUnlockedThisDeviceOnly',
    }),
  );
  await expect(AsyncStorage.getItem('supabase-auth-token')).resolves.toBeNull();
});

test('prefers the OS credential store and clears both stores on sign-out', async () => {
  getGenericPassword.mockResolvedValue({
    username: 'supabase-auth-token',
    password: 'secure-session',
    service: 'test',
    storage: 'keychain',
  });

  await expect(secureAuthStorage.getItem('supabase-auth-token')).resolves.toBe(
    'secure-session',
  );
  await secureAuthStorage.removeItem('supabase-auth-token');
  expect(resetGenericPassword).toHaveBeenCalled();
});
