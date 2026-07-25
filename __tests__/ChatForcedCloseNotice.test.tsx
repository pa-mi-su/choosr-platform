import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockReconcile = jest.fn().mockResolvedValue(false);
const mockConsumeNotice = jest.fn().mockReturnValue(true);

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: (effect: () => void | (() => void)) =>
    jest.requireActual('react').useEffect(effect, [effect]),
}));
jest.mock('../src/chat/runtime', () => ({
  chatSession: {
    active: undefined,
    reconcileOrphanedRemoteChat: () => mockReconcile(),
    consumeOrphanedChatDestructionNotice: () => mockConsumeNotice(),
  },
}));

import { ChatHomeScreen } from '../src/screens/ChatHomeScreen';

test('explains when an unreadable chat is destroyed after the app was closed', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, right: 0, bottom: 34, left: 0 },
        }}
      >
        <ChatHomeScreen
          navigation={{ navigate: jest.fn(), replace: jest.fn() } as never}
          route={{ key: 'chat-home', name: 'ChatHome' } as never}
        />
      </SafeAreaProvider>,
    );
  });

  expect(alert).toHaveBeenCalledWith(
    'Previous chat destroyed',
    expect.stringContaining('temporary encryption keys were erased'),
  );

  await ReactTestRenderer.act(() => renderer?.unmount());
  alert.mockRestore();
});
