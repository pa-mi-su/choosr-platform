import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
}));
jest.mock('../src/services/notificationService', () => ({
  loadUnreadNotificationCount: jest.fn().mockResolvedValue(0),
  subscribeToNotificationState: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('../src/chat/runtime', () => ({
  chatSession: {
    active: undefined,
    reconcileOrphanedRemoteChat: jest.fn().mockResolvedValue(false),
  },
}));

import { ChatHomeScreen } from '../src/screens/ChatHomeScreen';
import { HomeScreen } from '../src/screens/HomeScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

async function expectBackToGateway(
  screen: React.JSX.Element,
  navigate: jest.Mock,
): Promise<void> {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>{screen}</SafeAreaProvider>,
    );
  });

  renderer?.root.findByProps({ testID: 'back-to-choosr' }).props.onPress();
  expect(navigate).toHaveBeenCalledWith('Home');

  await ReactTestRenderer.act(() => renderer?.unmount());
}

test('Choose home has an explicit route back to the Choosr gateway', async () => {
  const navigate = jest.fn();
  await expectBackToGateway(
    <HomeScreen
      navigation={{ navigate } as never}
      route={{ key: 'choose-home', name: 'ChooseHome' } as never}
    />,
    navigate,
  );
});

test('Chat home has an explicit route back to the Choosr gateway', async () => {
  const navigate = jest.fn();
  await expectBackToGateway(
    <ChatHomeScreen
      navigation={{ navigate } as never}
      route={{ key: 'chat-home', name: 'ChatHome' } as never}
    />,
    navigate,
  );
});

test('Chat home exposes only authenticated quick-link and QR entry', async () => {
  const navigate = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ChatHomeScreen
          navigation={{ navigate } as never}
          route={{ key: 'chat-home', name: 'ChatHome' } as never}
        />
      </SafeAreaProvider>,
    );
  });

  renderer?.root
    .findByProps({ accessibilityLabel: 'Start a Quick Chat' })
    .props.onPress();
  expect(navigate).toHaveBeenCalledWith('ChatInvite', { focus: 'share' });

  renderer?.root
    .findByProps({ accessibilityLabel: 'Scan a QR' })
    .props.onPress();
  expect(navigate).toHaveBeenCalledWith('ChatScan');

  expect(() =>
    renderer?.root.findByProps({ accessibilityLabel: 'Enter a code' }),
  ).toThrow();

  await ReactTestRenderer.act(() => renderer?.unmount());
});
