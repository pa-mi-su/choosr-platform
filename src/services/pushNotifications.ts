import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AuthorizationStatus,
  getInitialNotification,
  getMessaging,
  getToken,
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
  } catch {
    return false;
  }
}

export async function refreshPushRegistration(): Promise<boolean> {
  if ((await AsyncStorage.getItem(PUSH_ENABLED_KEY)) !== 'true') return false;
  try {
    await syncCurrentToken();
    return true;
  } catch {
    return false;
  }
}

export async function isPushEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(PUSH_ENABLED_KEY)) === 'true';
}

export function registerPushListeners(input: {
  onOpen: (message: RemoteMessage) => void;
  onForeground: (message: RemoteMessage) => void;
}): () => void {
  const messaging = getMessaging();
  const unsubscribeOpen = onNotificationOpenedApp(messaging, input.onOpen);
  const unsubscribeMessage = onMessage(messaging, input.onForeground);
  const unsubscribeToken = onTokenRefresh(messaging, token => {
    registerToken(token).catch(() => undefined);
  });

  getInitialNotification(messaging)
    .then(message => {
      if (message) input.onOpen(message);
    })
    .catch(() => undefined);

  refreshPushRegistration().catch(() => undefined);

  return () => {
    unsubscribeOpen();
    unsubscribeMessage();
    unsubscribeToken();
  };
}

export async function dispatchPendingNotifications(): Promise<void> {
  await supabase.functions
    .invoke('dispatch-notifications', { body: {} })
    .catch(() => undefined);
}
