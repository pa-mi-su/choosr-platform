import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {
  AndroidImportance,
  AuthorizationStatus as NotifeeAuthorizationStatus,
  EventType,
  IOSNotificationSetting,
} from '@notifee/react-native';
import {
  AuthorizationStatus,
  getAPNSToken,
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
import {
  AppState,
  PermissionsAndroid,
  Platform,
  type Permission,
} from 'react-native';

import { supabase } from '../lib/supabase';
import { ensureAnonymousSession } from './anonymousAuth';
import { registerAndroidPushInstallation } from './androidPushRegistration';

const PUSH_ENABLED_KEY = 'choosr.push.enabled';
const ANDROID_NOTIFICATION_PERMISSION =
  'android.permission.POST_NOTIFICATIONS' as Permission;
const DISPATCH_RETRY_DELAYS_MS = [0, 400, 1200] as const;
const IOS_APNS_RETRY_DELAYS_MS = [0, 250, 750, 1500] as const;
const PUSH_CHANNEL_ID = 'choosr-invitations';

let pendingTokenSynchronization: Promise<void> | undefined;

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
  if (status !== AuthorizationStatus.AUTHORIZED) {
    await notifee.openNotificationSettings().catch(() => undefined);
    return false;
  }
  return true;
}

async function hasDeliveryPermission(): Promise<boolean> {
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

async function hasVisibleAlertPermission(): Promise<boolean> {
  if (!(await hasDeliveryPermission())) return false;
  if (Platform.OS !== 'ios') return true;

  const settings = await notifee.getNotificationSettings();
  return (
    settings.authorizationStatus === NotifeeAuthorizationStatus.AUTHORIZED &&
    settings.ios.alert === IOSNotificationSetting.ENABLED &&
    settings.ios.lockScreen === IOSNotificationSetting.ENABLED &&
    settings.ios.notificationCenter === IOSNotificationSetting.ENABLED
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

const wait = (milliseconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, milliseconds));

async function waitForIosApnsToken(): Promise<void> {
  const messaging = getMessaging();
  for (const delayMilliseconds of IOS_APNS_RETRY_DELAYS_MS) {
    if (delayMilliseconds) await wait(delayMilliseconds);
    if (await getAPNSToken(messaging)) return;
  }
  const error = new Error('APNs token is not ready.');
  error.name = 'push/apns-token-unavailable';
  throw error;
}

async function performTokenSynchronization(): Promise<void> {
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
  await waitForIosApnsToken();
  await registerToken(await getToken(messaging));
}

async function syncCurrentToken(): Promise<void> {
  if (!pendingTokenSynchronization) {
    pendingTokenSynchronization = performTokenSynchronization().finally(() => {
      pendingTokenSynchronization = undefined;
    });
  }
  return pendingTokenSynchronization;
}

async function displayForegroundNotification(
  message: RemoteMessage,
): Promise<void> {
  const title = message.notification?.title;
  const body = message.notification?.body;
  if (!title || !body) return;

  const data = Object.fromEntries(
    Object.entries(message.data ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  const channelId =
    Platform.OS === 'android'
      ? await notifee.createChannel({
          id: PUSH_CHANNEL_ID,
          name: 'Choosr invitations',
          importance: AndroidImportance.HIGH,
        })
      : undefined;

  await notifee.displayNotification({
    ...(message.messageId
      ? { id: `remote-${message.messageId}`.slice(0, 64) }
      : {}),
    title,
    body,
    data,
    ...(channelId
      ? {
          android: {
            channelId,
            pressAction: { id: 'default' },
          },
        }
      : {}),
    ios: {
      foregroundPresentationOptions: {
        alert: true,
        badge: true,
        sound: true,
        banner: true,
        list: true,
      },
    },
  });
}

export async function enablePushNotifications(): Promise<boolean> {
  try {
    if (!(await requestPlatformPermission())) return false;
    await syncCurrentToken();
    if (!(await hasVisibleAlertPermission())) {
      await notifee.openNotificationSettings().catch(() => undefined);
      return false;
    }
    await AsyncStorage.setItem(PUSH_ENABLED_KEY, 'true');
    return true;
  } catch (error) {
    logPushFailure('enable', error);
    return false;
  }
}

export async function refreshPushRegistration(): Promise<boolean> {
  try {
    if (!(await hasDeliveryPermission())) return false;
    await syncCurrentToken();
    const alertsVisible = await hasVisibleAlertPermission();
    if (alertsVisible) {
      await AsyncStorage.setItem(PUSH_ENABLED_KEY, 'true');
    }
    return alertsVisible;
  } catch (error) {
    logPushFailure('refresh', error);
    return false;
  }
}

export async function isPushEnabled(): Promise<boolean> {
  return hasVisibleAlertPermission();
}

export function registerPushListeners(input: {
  onOpen: (message: RemoteMessage) => void;
  onForeground: (message: RemoteMessage) => void;
}): () => void {
  const messaging = getMessaging();
  const unsubscribeOpen = onNotificationOpenedApp(messaging, input.onOpen);
  const unsubscribeMessage = onMessage(messaging, message => {
    input.onForeground(message);
    displayForegroundNotification(message).catch(error =>
      logPushFailure('foreground-display', error),
    );
  });
  const unsubscribeToken = onTokenRefresh(messaging, token => {
    registerToken(token).catch(error => logPushFailure('token-refresh', error));
  });
  const unsubscribeLocalNotification = notifee.onForegroundEvent(
    ({ type, detail }) => {
      if (type !== EventType.PRESS || !detail.notification?.data) return;
      input.onOpen({ data: detail.notification.data } as RemoteMessage);
    },
  );
  const appState = AppState.addEventListener('change', state => {
    if (state === 'active') {
      refreshPushRegistration().catch(error =>
        logPushFailure('app-active', error),
      );
    }
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
    unsubscribeLocalNotification();
    appState.remove();
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
