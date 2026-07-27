import notifee, {
  AndroidImportance,
  EventType,
  IOSNotificationSetting,
} from '@notifee/react-native';
import {
  AuthorizationStatus,
  deleteToken,
  getAPNSToken,
  getInitialNotification,
  getMessaging,
  getToken,
  hasPermission,
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

import { env } from '../config/generatedEnv';
import { supabase } from '../lib/supabase';
import { ensureAnonymousSession } from './anonymousAuth';
import { registerAndroidPushInstallation } from './androidPushRegistration';

const ANDROID_NOTIFICATION_PERMISSION =
  'android.permission.POST_NOTIFICATIONS' as Permission;
const DISPATCH_RETRY_DELAYS_MS = [0, 400, 1200] as const;
const IOS_APNS_RETRY_DELAYS_MS = [0, 250, 750, 1500, 3000] as const;
const TOKEN_SYNC_RETRY_DELAYS_MS = [0, 500, 1500] as const;
const PUSH_CHANNEL_ID = 'choosr-invitations';

let pendingTokenSynchronization: Promise<void> | undefined;

type PushStage =
  | 'permission'
  | 'apns_registration'
  | 'apns_token'
  | 'fcm_token'
  | 'server_registration';

type StagedPushError = Error & { pushStage?: PushStage };
type PushTokenStatus = 'active' | 'invalidated' | 'missing';

export type PushRegistrationHealth =
  | { permission: 'disabled'; delivery: 'unavailable' }
  | { permission: 'enabled'; delivery: 'ready' | 'unavailable' };

export type NotificationDispatchSummary = {
  processed: number;
  delivered: number;
  failed: number;
  recipientsWithoutDevices: number;
  invalidTokensRemoved: number;
};

async function registerToken(token: string): Promise<PushTokenStatus> {
  await ensureAnonymousSession();
  const { error } = await supabase.rpc('register_push_token', {
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    p_token: token,
  });
  if (error) throw error;
  await dispatchPendingNotifications();
  const { data: status, error: statusError } = await supabase.rpc(
    'push_token_status',
    { p_token: token },
  );
  if (statusError) throw statusError;
  return status;
}

async function reportPushRegistration(
  status: 'ready' | 'unavailable',
  stage: PushStage,
  code: string,
): Promise<void> {
  try {
    await ensureAnonymousSession();
    await supabase.rpc('report_push_registration', {
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
      p_status: status,
      p_stage: stage,
      p_code: code,
      p_app_version: env.appVersion,
      p_build_number: env.buildNumber,
    });
  } catch (error) {
    logPushFailure('health-report', error);
  }
}

async function reportPushFailure(error: unknown): Promise<void> {
  await reportPushRegistration(
    'unavailable',
    error instanceof Error && (error as StagedPushError).pushStage
      ? (error as StagedPushError).pushStage!
      : 'server_registration',
    diagnosticCode(error),
  );
}

async function hasServerPushEndpoint(): Promise<boolean> {
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc('has_registered_push_token');
  if (error) throw error;
  return data;
}

async function requestPlatformPermission(
  openSettingsWhenDenied = false,
): Promise<boolean> {
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
  if (
    status !== AuthorizationStatus.AUTHORIZED &&
    status !== AuthorizationStatus.PROVISIONAL
  ) {
    if (openSettingsWhenDenied) {
      await notifee.openNotificationSettings().catch(() => undefined);
    }
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

async function hasVisibleNotificationPresentation(): Promise<boolean> {
  if (Platform.OS !== 'ios') return hasDeliveryPermission();
  if (!(await hasDeliveryPermission())) return false;
  const settings = await notifee.getNotificationSettings();
  return (
    settings.ios.alert === IOSNotificationSetting.ENABLED ||
    settings.ios.lockScreen === IOSNotificationSetting.ENABLED ||
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
  // Keep the message free of tokens and user data so registration failures
  // remain visible in production device logs without exposing credentials.
  console.warn(`[push:${context}] ${diagnosticCode(error)}`);
};

const wait = (milliseconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, milliseconds));

async function atPushStage<T>(
  stage: PushStage,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error) {
      (error as StagedPushError).pushStage = stage;
    }
    throw error;
  }
}

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
    const token = await atPushStage('fcm_token', () =>
      registerAndroidPushInstallation(),
    );
    const status = await atPushStage('server_registration', () =>
      registerToken(token),
    );
    if (status !== 'active') {
      const error = new Error('FCM rejected the Android installation token.');
      error.name = 'push/fcm-token-rejected';
      (error as StagedPushError).pushStage = 'fcm_token';
      throw error;
    }
    await reportPushRegistration('ready', 'server_registration', 'ok');
    return;
  }

  const messaging = getMessaging();
  // Registration is idempotent. Never delete the current FCM installation as
  // part of recovery: if obtaining its replacement fails, the server loses the
  // only endpoint it could still deliver to. Firebase owns the APNs binding and
  // getToken surfaces readiness failures for the retry loop below.
  await atPushStage('apns_registration', () =>
    registerDeviceForRemoteMessages(messaging),
  );
  // FCM cannot create a usable iOS installation until Apple has returned the
  // APNs token. On a cold launch that callback is asynchronous, so a direct
  // getToken call can fail before registration has had time to complete.
  await atPushStage('apns_token', waitForIosApnsToken);
  let token = await atPushStage('fcm_token', () => getToken(messaging));
  let status = await atPushStage('server_registration', () =>
    registerToken(token),
  );
  if (status === 'invalidated') {
    // This is not speculative token churn: the delivery worker has retained
    // FCM's canonical UNREGISTERED result for this exact token. Rotate once,
    // after APNs is ready, so Firebase cannot return the rejected cache entry.
    await atPushStage('fcm_token', () => deleteToken(messaging));
    token = await atPushStage('fcm_token', () => getToken(messaging));
    status = await atPushStage('server_registration', () =>
      registerToken(token),
    );
  }
  if (status !== 'active') {
    const error = new Error('FCM rejected the iOS installation token.');
    error.name = 'push/fcm-token-rejected';
    (error as StagedPushError).pushStage = 'fcm_token';
    throw error;
  }
  await reportPushRegistration('ready', 'server_registration', 'ok');
}

async function syncCurrentToken(): Promise<void> {
  if (!pendingTokenSynchronization) {
    pendingTokenSynchronization = performTokenSynchronization().finally(() => {
      pendingTokenSynchronization = undefined;
    });
  }
  return pendingTokenSynchronization;
}

async function synchronizePushEndpoint(): Promise<void> {
  let lastError: unknown;
  for (const delayMilliseconds of TOKEN_SYNC_RETRY_DELAYS_MS) {
    if (delayMilliseconds) await wait(delayMilliseconds);
    try {
      await syncCurrentToken();
      if (await hasServerPushEndpoint()) return;
      const missingEndpoint = new Error(
        'Push registration did not reach the server.',
      );
      missingEndpoint.name = 'push/server-endpoint-missing';
      throw missingEndpoint;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
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
    if (!(await requestPlatformPermission(true))) {
      await reportPushRegistration(
        'unavailable',
        'permission',
        'permission_disabled',
      );
      return false;
    }
    if (!(await hasVisibleNotificationPresentation())) {
      await reportPushRegistration(
        'unavailable',
        'permission',
        'presentation_disabled',
      );
      await notifee.openNotificationSettings().catch(() => undefined);
      return false;
    }
    // Permission and endpoint registration are separate facts. Once the OS
    // grants permission, do not tell the user alerts are disabled merely
    // because APNs, FCM, or the network is temporarily unavailable.
    await synchronizePushEndpoint().catch(async error => {
      logPushFailure('enable-registration', error);
      await reportPushFailure(error);
    });
    return true;
  } catch (error) {
    logPushFailure('enable', error);
    return false;
  }
}

export async function refreshPushRegistration(): Promise<PushRegistrationHealth> {
  if (!(await hasDeliveryPermission())) {
    await reportPushRegistration(
      'unavailable',
      'permission',
      'permission_disabled',
    );
    return { permission: 'disabled', delivery: 'unavailable' };
  }
  try {
    await synchronizePushEndpoint();
    return { permission: 'enabled', delivery: 'ready' };
  } catch (error) {
    logPushFailure('refresh', error);
    await reportPushFailure(error);
    return { permission: 'enabled', delivery: 'unavailable' };
  }
}

export async function isPushPermissionEnabled(): Promise<boolean> {
  return hasVisibleNotificationPresentation();
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
