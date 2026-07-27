import notifee, { EventType } from '@notifee/react-native';
import {
  deleteToken,
  getAPNSToken,
  getToken,
  hasPermission,
  onMessage,
  registerDeviceForRemoteMessages,
  requestPermission,
} from '@react-native-firebase/messaging';

const mockRpc = jest.fn<
  Promise<{ data?: unknown; error: null }>,
  [name: string, args?: unknown]
>(() => Promise.resolve({ error: null }));
const mockInvoke = jest.fn<
  Promise<{
    data: {
      processed: number;
      delivered: number;
      failed: number;
      recipientsWithoutDevices: number;
      invalidTokensRemoved: number;
    };
    error: null;
  }>,
  [name: string, options?: unknown]
>(() =>
  Promise.resolve({
    data: {
      processed: 0,
      delivered: 0,
      failed: 0,
      recipientsWithoutDevices: 0,
      invalidTokensRemoved: 0,
    },
    error: null,
  }),
);

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: (name: string, args?: unknown) => mockRpc(name, args),
    functions: {
      invoke: (name: string, options?: unknown) => mockInvoke(name, options),
    },
  },
}));
jest.mock('../src/services/anonymousAuth', () => ({
  ensureAnonymousSession: jest.fn(() =>
    Promise.resolve({ user: { id: 'push-user' } }),
  ),
}));

import {
  enablePushNotifications,
  isPushPermissionEnabled,
  refreshPushRegistration,
  registerPushListeners,
} from '../src/services/pushNotifications';

describe('push notification reliability', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockRpc.mockImplementation(name =>
      Promise.resolve({
        data:
          name === 'has_registered_push_token'
            ? true
            : name === 'push_token_status'
            ? 'active'
            : undefined,
        error: null,
      }),
    );
    (hasPermission as jest.Mock).mockResolvedValue(1);
    (requestPermission as jest.Mock).mockResolvedValue(1);
    (notifee.getNotificationSettings as jest.Mock).mockResolvedValue({
      authorizationStatus: 1,
      ios: {
        alert: 1,
        lockScreen: 1,
        notificationCenter: 1,
      },
    });
    mockInvoke.mockResolvedValue({
      data: {
        processed: 0,
        delivered: 0,
        failed: 0,
        recipientsWithoutDevices: 0,
        invalidTokensRemoved: 0,
      },
      error: null,
    });
  });

  test('shows a visible notification while Choosr is foregrounded', async () => {
    let receiveMessage:
      | ((message: {
          messageId: string;
          notification: { title: string; body: string };
          data: { kind: string; route: string };
        }) => void)
      | undefined;
    (onMessage as jest.Mock).mockImplementation(
      (_messaging, listener: typeof receiveMessage) => {
        receiveMessage = listener;
        return jest.fn();
      },
    );
    const onForeground = jest.fn();
    const unsubscribe = registerPushListeners({
      onOpen: jest.fn(),
      onForeground,
    });

    receiveMessage?.({
      messageId: 'room-invite-1',
      notification: {
        title: "You're invited",
        body: 'Open Choosr to choose together.',
      },
      data: { kind: 'room_invitation', route: 'Circle' },
    });
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(onForeground).toHaveBeenCalledTimes(1);
    expect(notifee.displayNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'remote-room-invite-1',
        title: "You're invited",
        body: 'Open Choosr to choose together.',
        data: { kind: 'room_invitation', route: 'Circle' },
        ios: {
          foregroundPresentationOptions: {
            alert: true,
            badge: true,
            sound: true,
            banner: true,
            list: true,
          },
        },
      }),
    );

    unsubscribe();
  });

  test('routes a tap on a foreground notification', async () => {
    let receiveLocalEvent:
      | ((event: {
          type: number;
          detail: { notification: { data: Record<string, string> } };
        }) => void)
      | undefined;
    (notifee.onForegroundEvent as jest.Mock).mockImplementation(listener => {
      receiveLocalEvent = listener;
      return jest.fn();
    });
    const onOpen = jest.fn();
    const unsubscribe = registerPushListeners({
      onOpen,
      onForeground: jest.fn(),
    });

    receiveLocalEvent?.({
      type: EventType.PRESS,
      detail: {
        notification: {
          data: { kind: 'room_invitation', route: 'Circle' },
        },
      },
    });

    expect(onOpen).toHaveBeenCalledWith({
      data: { kind: 'room_invitation', route: 'Circle' },
    });
    await new Promise<void>(resolve => setImmediate(resolve));
    unsubscribe();
  });

  test('waits for APNs before registering the current Firebase token without destructive rotation', async () => {
    await expect(refreshPushRegistration()).resolves.toEqual({
      permission: 'enabled',
      delivery: 'ready',
    });

    expect(registerDeviceForRemoteMessages).toHaveBeenCalledTimes(1);
    expect(getAPNSToken).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(deleteToken).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('register_push_token', {
      p_platform: 'ios',
      p_token: 'test-firebase-token-long-enough',
    });

    await expect(refreshPushRegistration()).resolves.toEqual({
      permission: 'enabled',
      delivery: 'ready',
    });
    expect(registerDeviceForRemoteMessages).toHaveBeenCalledTimes(2);
    expect(getAPNSToken).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(deleteToken).not.toHaveBeenCalled();
  });

  test('rotates only a token the provider has explicitly invalidated', async () => {
    let statusChecks = 0;
    mockRpc.mockImplementation(name =>
      Promise.resolve({
        data:
          name === 'has_registered_push_token'
            ? true
            : name === 'push_token_status'
            ? ++statusChecks === 1
              ? 'invalidated'
              : 'active'
            : undefined,
        error: null,
      }),
    );
    (getToken as jest.Mock)
      .mockResolvedValueOnce('provider-rejected-firebase-token')
      .mockResolvedValueOnce('replacement-firebase-token-long-enough');

    await expect(refreshPushRegistration()).resolves.toEqual({
      permission: 'enabled',
      delivery: 'ready',
    });

    expect(deleteToken).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('register_push_token', {
      p_platform: 'ios',
      p_token: 'replacement-firebase-token-long-enough',
    });
  });

  test('always asks iOS to register for remote messages instead of trusting cached native state', async () => {
    await expect(refreshPushRegistration()).resolves.toEqual({
      permission: 'enabled',
      delivery: 'ready',
    });

    expect(requestPermission).not.toHaveBeenCalled();
    expect(registerDeviceForRemoteMessages).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('register_push_token', {
      p_platform: 'ios',
      p_token: 'test-firebase-token-long-enough',
    });
  });

  test('retries Firebase registration without deleting the existing installation', async () => {
    const timeoutSpy = jest
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation((callback: (...args: never[]) => void) => {
        callback();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });
    (getToken as jest.Mock)
      .mockRejectedValueOnce(
        Object.assign(new Error('APNs not ready'), {
          code: 'messaging/unknown',
        }),
      )
      .mockResolvedValueOnce('recovered-firebase-token-long-enough');

    try {
      await expect(refreshPushRegistration()).resolves.toEqual({
        permission: 'enabled',
        delivery: 'ready',
      });

      expect(registerDeviceForRemoteMessages).toHaveBeenCalledTimes(2);
      expect(deleteToken).not.toHaveBeenCalled();
      expect(mockRpc).toHaveBeenCalledWith('register_push_token', {
        p_platform: 'ios',
        p_token: 'recovered-firebase-token-long-enough',
      });
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  test('waits through a cold-launch APNs callback before requesting FCM token', async () => {
    const timeoutSpy = jest
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation((callback: (...args: never[]) => void) => {
        callback();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });
    (getAPNSToken as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('ready-apns-token');

    try {
      await expect(refreshPushRegistration()).resolves.toEqual({
        permission: 'enabled',
        delivery: 'ready',
      });

      expect(getAPNSToken).toHaveBeenCalledTimes(3);
      expect(getToken).toHaveBeenCalledTimes(1);
      expect(deleteToken).not.toHaveBeenCalled();
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  test('retries a missing server endpoint without deleting the iOS token', async () => {
    let healthChecks = 0;
    mockRpc.mockImplementation(name =>
      Promise.resolve({
        data:
          name === 'has_registered_push_token'
            ? ++healthChecks >= 2
            : name === 'push_token_status'
            ? 'active'
            : undefined,
        error: null,
      }),
    );

    await expect(refreshPushRegistration()).resolves.toEqual({
      permission: 'enabled',
      delivery: 'ready',
    });

    expect(deleteToken).not.toHaveBeenCalled();
    expect(
      mockRpc.mock.calls.filter(([name]) => name === 'register_push_token'),
    ).toHaveLength(2);
  });

  test('separates enabled OS permission from an unavailable server endpoint', async () => {
    mockRpc.mockImplementation(name =>
      Promise.resolve({
        data:
          name === 'has_registered_push_token'
            ? false
            : name === 'push_token_status'
            ? 'active'
            : undefined,
        error: null,
      }),
    );

    await expect(isPushPermissionEnabled()).resolves.toBe(true);
    await expect(refreshPushRegistration()).resolves.toEqual({
      permission: 'enabled',
      delivery: 'unavailable',
    });
  });

  test('accepts provisional iOS authorization without requiring every presentation surface', async () => {
    (hasPermission as jest.Mock).mockResolvedValue(2);
    (notifee.getNotificationSettings as jest.Mock).mockResolvedValue({
      authorizationStatus: 2,
      ios: {
        alert: 1,
        lockScreen: 0,
        notificationCenter: 0,
      },
    });

    await expect(isPushPermissionEnabled()).resolves.toBe(true);
    await expect(refreshPushRegistration()).resolves.toEqual({
      permission: 'enabled',
      delivery: 'ready',
    });

    expect(mockRpc).toHaveBeenCalledWith('register_push_token', {
      p_platform: 'ios',
      p_token: 'test-firebase-token-long-enough',
    });
  });

  test('does not report iOS alerts enabled when every visible presentation surface is disabled', async () => {
    (notifee.getNotificationSettings as jest.Mock).mockResolvedValue({
      authorizationStatus: 1,
      ios: {
        alert: 0,
        lockScreen: 0,
        notificationCenter: 0,
      },
    });

    await expect(isPushPermissionEnabled()).resolves.toBe(false);
  });

  test('opens iOS notification settings when authorization exists but visible alerts are disabled', async () => {
    (notifee.getNotificationSettings as jest.Mock).mockResolvedValue({
      authorizationStatus: 1,
      ios: {
        alert: 0,
        lockScreen: 0,
        notificationCenter: 0,
      },
    });

    await expect(enablePushNotifications()).resolves.toBe(false);

    expect(notifee.openNotificationSettings).toHaveBeenCalledTimes(1);
    expect(registerDeviceForRemoteMessages).not.toHaveBeenCalled();
  });

  test('does not attempt endpoint registration when OS permission is disabled', async () => {
    (hasPermission as jest.Mock).mockResolvedValue(0);

    await expect(refreshPushRegistration()).resolves.toEqual({
      permission: 'disabled',
      delivery: 'unavailable',
    });
    expect(registerDeviceForRemoteMessages).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalledWith(
      'register_push_token',
      expect.anything(),
    );
    expect(mockRpc).toHaveBeenCalledWith('report_push_registration', {
      p_platform: 'ios',
      p_status: 'unavailable',
      p_stage: 'permission',
      p_code: 'permission_disabled',
      p_app_version: '1.0.0',
      p_build_number: '1',
    });
  });
});
