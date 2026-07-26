import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockRefreshPushRegistration = jest.fn();

jest.mock('@react-navigation/native', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(effect, [effect]);
    },
  };
});
jest.mock('../src/services/pushNotifications', () => ({
  refreshPushRegistration: (...args: unknown[]) =>
    mockRefreshPushRegistration(...args),
}));
jest.mock('../src/services/notificationService', () => ({
  loadUnreadNotificationCount: jest.fn().mockResolvedValue(1),
  subscribeToNotificationState: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('../src/services/sessionService', () => ({
  loadRoomHistory: jest.fn().mockResolvedValue([]),
}));
jest.mock('../src/services/circleService', () => ({
  loadPendingRoomInvitations: jest.fn().mockResolvedValue([]),
}));
jest.mock('../src/chat/runtime', () => ({
  chatSession: {
    active: undefined,
    reconcileOrphanedRemoteChat: jest.fn().mockResolvedValue(false),
    consumeOrphanedChatDestructionNotice: jest.fn().mockReturnValue(false),
  },
}));

import { ChoosrHomeScreen } from '../src/screens/ChoosrHomeScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

describe('push registration ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefreshPushRegistration.mockResolvedValue({
      permission: 'enabled',
      delivery: 'unavailable',
    });
  });

  test('does not show a settings warning or start registration from the gateway', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <ChoosrHomeScreen
            navigation={{ navigate: jest.fn() } as never}
            route={{ key: 'home', name: 'Home' } as never}
          />
        </SafeAreaProvider>,
      );
    });

    expect(() =>
      renderer.root.findByProps({
        children: 'Room alerts need attention',
      }),
    ).toThrow();
    expect(mockRefreshPushRegistration).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
