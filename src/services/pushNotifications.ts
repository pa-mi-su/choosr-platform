import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AuthorizationStatus,
  getInitialNotification,
  getMessaging,
  getToken,
  hasPermission,
  isDeviceRegisteredForRemoteMessages,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  registerDeviceForRemoteMessages,
  requestPermission,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform, type Permission } from 'react-native';

import { supabase } from '../lib/supabase';
import { ensureAnonymousSession } from './anonymousAuth';
import { registerAndroidPushInstallation } from './androidPushRegistration';

const PUSH_ENABLED_KEY = 'choosr.push.enabled';
const ANDROID_NOTIFICATION_PERMISSION =
  'android.permission.POST_NOTIFICATIONS' as Permission;
const DISPATCH_RETRY_DELAYS_MS = [0, 400, 1200] as const;

export type NotificationDispatchSummary = {
  processed: number;
  delivered: number;
  failed: number;
  recipientsWithoutDevices: number;
  invalidTokensRemoved: number;
};

async function registerToken(token: string): Promise<void> {
  await ensureAnonymousSession();
  const { error } = await supabase.rpc('register_push_token', {
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    p_token: token,
  });
  if (error) throw error;
  await dispatchPendingNotifications();
}

async function requestPlatformPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (Number(Platform.Version) < 33) return true;
    const result = await PermissionsAndroid.request(
      ANDROID_NOTIFICATION_PERMISSION,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  const status = await requestPermission(getMessaging(), {
    alert: true,
    badge: true,
    sound: true,
    provisional: false,
  });
  return (
    status === AuthorizationStatus.AUTHORIZED ||
    status === AuthorizationStatus.PROVISIONAL
  );
}

async function hasPlatformPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (Number(Platform.Version) < 33) return true;
    return PermissionsAndroid.check(ANDROID_NOTIFICATION_PERMISSION);
  }
  const status = await hasPermission(getMessaging());
  return (
    status === AuthorizationStatus.AUTHORIZED ||
    status === AuthorizationStatus.PROVISIONAL
  );
}

const diagnosticCode = (error: unknown): string => {
  if (typeof error === 'object' && error && 'code' in error) {
    const code = String(error.code);
    return /^[a-z0-9_./-]{1,80}$/i.test(code) ? code : 'unknown';
  }
  return error instanceof Error ? error.name : 'unknown';
};

const logPushFailure = (context: string, error: unknown): void => {
  if (__DEV__) {
    console.warn(`[push:${context}] ${diagnosticCode(error)}`);
  }
};

async function syncCurrentToken(): Promise<void> {
  if (Platform.OS === 'android') {
    await registerToken(await registerAndroidPushInstallation());
    return;
  }

  const messaging = getMessaging();
  if (
    Platform.OS === 'ios' &&
    !isDeviceRegisteredForRemoteMessages(messaging)
  ) {
    await registerDeviceForRemoteMessages(messaging);
  }
  await registerToken(await getToken(messaging));
}

export async function enablePushNotifications(): Promise<boolean> {
  try {
    if (!(await requestPlatformPermission())) return false;
    await syncCurrentToken();
    await AsyncStorage.setItem(PUSH_ENABLED_KEY, 'true');
    return true;
  } catch (error) {
    logPushFailure('enable', error);
    return false;
  }
}

export async function refreshPushRegistration(): Promise<boolean> {
  try {
    if (!(await hasPlatformPermission())) return false;
    await syncCurrentToken();
    await AsyncStorage.setItem(PUSH_ENABLED_KEY, 'true');
    return true;
  } catch (error) {
    logPushFailure('refresh', error);
    return false;
  }
}

export async function isPushEnabled(): Promise<boolean> {
  return hasPlatformPermission();
}

export function registerPushListeners(input: {
  onOpen: (message: RemoteMessage) => void;
  onForeground: (message: RemoteMessage) => void;
}): () => void {
  const messaging = getMessaging();
  const unsubscribeOpen = onNotificationOpenedApp(messaging, input.onOpen);
  const unsubscribeMessage = onMessage(messaging, input.onForeground);
  const unsubscribeToken = onTokenRefresh(messaging, token => {
    registerToken(token).catch(error => logPushFailure('token-refresh', error));
  });

  getInitialNotification(messaging)
    .then(message => {
      if (message) input.onOpen(message);
    })
    .catch(error => logPushFailure('initial-notification', error));

  refreshPushRegistration().catch(error => logPushFailure('startup', error));

  return () => {
    unsubscribeOpen();
    unsubscribeMessage();
    unsubscribeToken();
  };
}

export async function dispatchPendingNotifications(): Promise<
  NotificationDispatchSummary | undefined
> {
  let lastError: unknown;
  for (const delayMs of DISPATCH_RETRY_DELAYS_MS) {
    if (delayMs) {
      await new Promise<void>(resolve => setTimeout(resolve, delayMs));
    }
    try {
      const { data, error } =
        await supabase.functions.invoke<NotificationDispatchSummary>(
          'dispatch-notifications',
          { body: {} },
        );
      if (error) throw error;
      return data ?? undefined;
    } catch (error) {
      lastError = error;
    }
  }
  logPushFailure('dispatch', lastError);
  return undefined;
}
