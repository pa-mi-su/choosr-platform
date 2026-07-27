import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockOpenDecision = jest.fn();
const mockListInvitations = jest.fn();
const mockDeclineInvitation = jest.fn();
const mockEnsureAnonymousSession = jest.fn();

jest.mock('@react-navigation/native', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(effect, [effect]);
    },
  };
});
jest.mock('../src/chat/runtime', () => ({
  chatSession: {
    active: undefined,
    reconcileOrphanedRemoteChat: jest.fn().mockResolvedValue(false),
    consumeOrphanedChatDestructionNotice: jest.fn().mockReturnValue(false),
    listPendingDecisionInvitations: (...args: unknown[]) =>
      mockListInvitations(...args),
    openDecision: (...args: unknown[]) => mockOpenDecision(...args),
    declineDecisionInvitation: (...args: unknown[]) =>
      mockDeclineInvitation(...args),
  },
}));
jest.mock('../src/services/anonymousAuth', () => ({
  ensureAnonymousSession: (...args: unknown[]) =>
    mockEnsureAnonymousSession(...args),
}));

import { ChatHomeScreen } from '../src/screens/ChatHomeScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

describe('matched-room private chat invitations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureAnonymousSession.mockResolvedValue({ user: { id: 'recipient' } });
    mockOpenDecision.mockResolvedValue(undefined);
    mockDeclineInvitation.mockResolvedValue(undefined);
    mockListInvitations.mockResolvedValue([
      {
        roomId: '40000000-0000-4000-8000-000000000001',
        decisionSessionId: '50000000-0000-4000-8000-000000000001',
        inviterDisplayName: 'Maria',
        inviterPhotoUrl: null,
        matchedItemTitle: 'The Ravenous Pig',
        createdAt: '2026-07-27T14:00:00.000Z',
        expiresAt: '2026-07-28T14:00:00.000Z',
      },
    ]);
  });

  test('shows a durable invitation and accepts the matched encrypted chat', async () => {
    const navigate = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <ChatHomeScreen
            navigation={{ navigate, replace: jest.fn() } as never}
            route={{ key: 'chat-home', name: 'ChatHome' } as never}
          />
        </SafeAreaProvider>,
      );
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockListInvitations).toHaveBeenCalledTimes(1);
    expect(
      renderer.root.findAll(
        node => node.children.join('') === 'Maria wants to chat',
      ),
    ).toHaveLength(1);
    expect(
      renderer.root.findAll(
        node => node.children.join('') === 'About your match: The Ravenous Pig',
      ),
    ).toHaveLength(1);

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Accept' })
        .props.onPress();
    });

    expect(mockOpenDecision).toHaveBeenCalledWith(
      'recipient',
      '50000000-0000-4000-8000-000000000001',
      'Maria',
    );
    expect(navigate).toHaveBeenCalledWith('ChatRoom');

    await ReactTestRenderer.act(() => renderer.unmount());
  });

  test('returns a waiting matched chat to its waiting room, not link sharing', async () => {
    const runtime = jest.requireMock('../src/chat/runtime').chatSession;
    runtime.active = {
      roomId: '40000000-0000-4000-8000-000000000001',
      role: 'creator',
      status: 'inviting',
      expiresAt: '2026-07-28T14:00:00.000Z',
      publicKey: `${'A'.repeat(43)}=`,
      decisionSessionId: '50000000-0000-4000-8000-000000000001',
      peerDisplayName: 'Maria',
    };
    runtime.reconcileOrphanedRemoteChat.mockResolvedValue(true);
    mockListInvitations.mockResolvedValue([]);
    const navigate = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <ChatHomeScreen
            navigation={{ navigate, replace: jest.fn() } as never}
            route={{ key: 'chat-home', name: 'ChatHome' } as never}
          />
        </SafeAreaProvider>,
      );
    });

    renderer.root
      .findByProps({ accessibilityLabel: 'Continue active private chat' })
      .props.onPress();
    expect(navigate).toHaveBeenCalledWith('ChatRoom');

    await ReactTestRenderer.act(() => renderer.unmount());
    runtime.active = undefined;
    runtime.reconcileOrphanedRemoteChat.mockResolvedValue(false);
  });
});
