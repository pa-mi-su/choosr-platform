import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

let mockRealtimeChange: (() => void) | undefined;
const mockUnsubscribe = jest.fn().mockRejectedValue(new Error('offline'));

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
    subscribe: jest.fn((onChange: () => void) => {
      mockRealtimeChange = onChange;
      return { unsubscribe: mockUnsubscribe };
    }),
    send: jest.fn(),
    destroy: jest.fn(),
  },
}));

import { ChatRoomScreen } from '../src/screens/ChatRoomScreen';

test('messaging is immediately encrypted and comparison details are optional', async () => {
  const popTo = jest.fn();
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
          navigation={{ popTo, replace: jest.fn() } as never}
          route={{ key: 'chat-room', name: 'ChatRoom' } as never}
        />
      </SafeAreaProvider>,
    );
  });

  expect(
    renderer?.root.findByProps({ accessibilityLabel: 'Private message' }).props
      .editable,
  ).not.toBe(false);
  expect(() =>
    renderer?.root.findByProps({
      accessibilityLabel: 'Chat safety number 1234 5678 9012',
    }),
  ).toThrow();

  await ReactTestRenderer.act(() => {
    renderer?.root
      .findByProps({ accessibilityLabel: 'Encryption details' })
      .props.onPress();
  });

  expect(
    renderer?.root.findByProps({
      accessibilityLabel: 'Chat safety number 1234 5678 9012',
    }),
  ).toBeDefined();
  expect(() =>
    renderer?.root.findByProps({
      accessibilityLabel: 'Mark connection as verified',
    }),
  ).toThrow();
  expect(
    renderer?.root.findByProps({ accessibilityLabel: 'End & Destroy' }),
  ).toBeDefined();
  renderer?.root
    .findByProps({ testID: 'back-to-private-chat' })
    .props.onPress();
  expect(popTo).toHaveBeenCalledWith('ChatHome');

  await ReactTestRenderer.act(() => renderer?.unmount());
  await Promise.resolve();
  expect(mockUnsubscribe).toHaveBeenCalled();
});

test('a waiting matched chat has no composer until the other person accepts', async () => {
  const runtime = jest.requireMock('../src/chat/runtime').chatSession;
  runtime.active.status = 'inviting';
  runtime.active.peerDisplayName = 'Maria';
  runtime.refreshStatus.mockResolvedValue('inviting');

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
          navigation={{ popTo: jest.fn(), replace: jest.fn() } as never}
          route={{ key: 'waiting-chat', name: 'ChatRoom' } as never}
        />
      </SafeAreaProvider>,
    );
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(
    renderer?.root.findAll(
      node => node.children.join('') === 'Waiting for Maria to join.',
    ),
  ).toHaveLength(1);
  expect(() =>
    renderer?.root.findByProps({ accessibilityLabel: 'Private message' }),
  ).toThrow();
  expect(() =>
    renderer?.root.findByProps({
      accessibilityLabel: 'Send encrypted message',
    }),
  ).toThrow();

  await ReactTestRenderer.act(() => renderer?.unmount());
  runtime.active.status = 'active';
  delete runtime.active.peerDisplayName;
  runtime.refreshStatus.mockResolvedValue('active');
});

test('serializes concurrent realtime refreshes and exits a destroyed chat once', async () => {
  const runtime = jest.requireMock('../src/chat/runtime').chatSession;
  runtime.refreshStatus.mockClear();
  mockRealtimeChange = undefined;
  let resolveStatus!: (status: 'destroyed') => void;
  runtime.refreshStatus.mockImplementation(
    () =>
      new Promise(resolve => {
        resolveStatus = resolve;
      }),
  );
  const replace = jest.fn();
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
          navigation={{ popTo: jest.fn(), replace } as never}
          route={{ key: 'destroyed-chat', name: 'ChatRoom' } as never}
        />
      </SafeAreaProvider>,
    );
  });

  await ReactTestRenderer.act(async () => {
    mockRealtimeChange?.();
    mockRealtimeChange?.();
    expect(runtime.refreshStatus).toHaveBeenCalledTimes(1);
    resolveStatus('destroyed');
    await Promise.resolve();
  });

  expect(replace).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledWith('ChatHome');
  await ReactTestRenderer.act(() => renderer?.unmount());
  runtime.refreshStatus.mockResolvedValue('active');
});
