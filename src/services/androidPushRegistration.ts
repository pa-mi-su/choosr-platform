import { NativeModules, Platform } from 'react-native';

interface AndroidPushRegistrationModule {
  register(): Promise<string>;
}

const nativeRegistration = NativeModules.ChoosrPushRegistration as
  | AndroidPushRegistrationModule
  | undefined;

export async function registerAndroidPushInstallation(): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('Android push registration is only available on Android.');
  }
  if (!nativeRegistration) {
    throw new Error('Android push registration native module is unavailable.');
  }

  return nativeRegistration.register();
}
