import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockLoadNotifications = jest.fn();
const mockSubscribeToNotificationState = jest.fn();
let mockNotificationStateListener: (() => void) | undefined;

jest.mock('@react-navigation/native', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(effect, [effect]);
    },
  };
});
jest.mock('../src/services/notificationService', () => ({
  loadNotifications: (...args: unknown[]) => mockLoadNotifications(...args),
  deleteNotifications: jest.fn().mockResolvedValue(undefined),
  markNotificationsRead: jest.fn().mockResolvedValue(undefined),
  markAllNotificationsRead: jest.fn().mockResolvedValue(undefined),
  subscribeToNotificationState: (listener: () => void) =>
    mockSubscribeToNotificationState(listener),
}));
jest.mock('../src/services/circleService', () => ({
  loadPendingRoomInvitations: jest.fn().mockResolvedValue([]),
}));
jest.mock(
  'react-native-gesture-handler/ReanimatedSwipeable',
  () =>
    function MockSwipeable({ children }: { children: React.ReactNode }) {
      const ReactModule = jest.requireActual<typeof React>('react');
      const { View } = jest.requireActual('react-native');
      return ReactModule.createElement(View, null, children);
    },
);

import { NotificationsScreen } from '../src/screens/NotificationsScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

describe('Notifications inbox refresh', () => {
  beforeEach(() => {
    mockLoadNotifications.mockReset();
    mockSubscribeToNotificationState.mockReset();
    mockNotificationStateListener = undefined;
    mockSubscribeToNotificationState.mockImplementation(listener => {
      mockNotificationStateListener = listener;
      return { remove: jest.fn() };
    });
  });

  test('reloads a mounted inbox when notification state changes', async () => {
    mockLoadNotifications.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 7,
        kind: 'connection_request',
        title: 'New Choosr connection',
        body: 'Someone wants to add you to their Circle.',
        payload: { connection_id: 'connection-7' },
        createdAt: '2026-07-24T15:00:00.000Z',
        readAt: null,
      },
    ]);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <NotificationsScreen
            navigation={
              {
                goBack: jest.fn(),
                navigate: jest.fn(),
              } as never
            }
            route={{ key: 'notifications', name: 'Notifications' } as never}
          />
        </SafeAreaProvider>,
      );
    });

    await ReactTestRenderer.act(async () => {
      mockNotificationStateListener?.();
    });

    expect(mockLoadNotifications).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({
        children: 'New Choosr connection',
      }),
    ).toBeDefined();

    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
