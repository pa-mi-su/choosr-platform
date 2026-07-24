import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('../src/chat/runtime', () => ({
  chatSession: {
    active: {
      roomId: '10000000-0000-4000-8000-000000000001',
      role: 'creator',
      status: 'active',
      expiresAt: '2099-07-25T12:00:00.000Z',
      publicKey: `${'A'.repeat(43)}=`,
      peerPublicKey: `${'B'.repeat(43)}=`,
    },
    messages: [],
    safetyNumber: '1234 5678 9012',
    refreshStatus: jest.fn().mockResolvedValue('active'),
    refreshMessages: jest.fn().mockResolvedValue([]),
    subscribe: jest.fn(() => ({ unsubscribe: jest.fn() })),
    send: jest.fn(),
    destroy: jest.fn(),
  },
}));

import { ChatRoomScreen } from '../src/screens/ChatRoomScreen';

test('private messaging stays disabled until the safety number is confirmed', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, right: 0, bottom: 34, left: 0 },
        }}
      >
        <ChatRoomScreen
          navigation={{ replace: jest.fn() } as never}
          route={{ key: 'chat-room', name: 'ChatRoom' } as never}
        />
      </SafeAreaProvider>,
    );
  });

  expect(
    renderer?.root.findByProps({ accessibilityLabel: 'Private message' }).props
      .editable,
  ).toBe(false);
  expect(
    renderer?.root.findByProps({
      accessibilityLabel: 'Chat safety number 1234 5678 9012',
    }),
  ).toBeDefined();

  await ReactTestRenderer.act(() => {
    renderer?.root
      .findByProps({ accessibilityLabel: 'The safety numbers match' })
      .props.onPress();
  });

  expect(
    renderer?.root.findByProps({ accessibilityLabel: 'Private message' }).props
      .editable,
  ).toBe(true);
  expect(
    renderer?.root.findByProps({ accessibilityLabel: 'End & Destroy' }),
  ).toBeDefined();

  await ReactTestRenderer.act(() => renderer?.unmount());
});
