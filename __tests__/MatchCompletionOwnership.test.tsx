import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockAcknowledgeDecisionRoom = jest.fn();
const mockOpenDecision = jest.fn();
const mockReconcileChat = jest.fn();
const mockEnsureAnonymousSession = jest.fn();

jest.mock('../src/hooks/useRoomSync', () => ({
  useRoomSync: jest.fn(),
}));
jest.mock('../src/services/sessionService', () => ({
  acknowledgeDecisionRoom: (...args: unknown[]) =>
    mockAcknowledgeDecisionRoom(...args),
  loadDecisionRoom: jest.fn(),
}));
jest.mock('../src/chat/runtime', () => ({
  chatSession: {
    active: undefined,
    openDecision: (...args: unknown[]) => mockOpenDecision(...args),
    reconcileOrphanedRemoteChat: (...args: unknown[]) =>
      mockReconcileChat(...args),
  },
}));
jest.mock('../src/services/anonymousAuth', () => ({
  ensureAnonymousSession: (...args: unknown[]) =>
    mockEnsureAnonymousSession(...args),
}));

import { MatchScreen } from '../src/screens/MatchScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

describe('completed room ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAcknowledgeDecisionRoom.mockResolvedValue(undefined);
    mockOpenDecision.mockResolvedValue(undefined);
    mockReconcileChat.mockResolvedValue(false);
    mockEnsureAnonymousSession.mockResolvedValue({ user: { id: 'user-1' } });
  });

  test('opens the matched pair private chat without a transferable invite', async () => {
    const navigate = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <MatchScreen
            navigation={{ popToTop: jest.fn(), navigate } as never}
            route={{
              key: 'match-chat',
              name: 'Match',
              params: {
                sessionId: 'matched-session',
                item: {
                  id: 'choice-1',
                  mode: 'eat',
                  title: 'Tacos',
                  kicker: 'PICK FOOD',
                  meta: 'Nearby',
                  description: 'A shared result',
                  background: '#20344A',
                  accent: '#F0B7A4',
                  tags: ['Food'],
                  action: {
                    label: 'Open Tacos in Google Maps',
                    url: 'https://maps.google.com/?q=tacos',
                  },
                },
              },
            }}
          />
        </SafeAreaProvider>,
      );
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Start private chat' })
        .props.onPress();
    });

    expect(mockReconcileChat).toHaveBeenCalledTimes(1);
    expect(mockOpenDecision).toHaveBeenCalledWith('user-1', 'matched-session');
    expect(navigate).toHaveBeenCalledWith('ChatRoom');
    expect(
      renderer.root.findByProps({
        accessibilityLabel: 'Open Tacos in Google Maps',
      }),
    ).toBeDefined();

    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  test('Done acknowledges only the current participant result', async () => {
    const popToTop = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <MatchScreen
            navigation={{ popToTop, navigate: jest.fn() } as never}
            route={{
              key: 'match',
              name: 'Match',
              params: {
                sessionId: 'matched-session',
                item: {
                  id: 'choice-1',
                  mode: 'do',
                  title: 'Bowling',
                  kicker: 'PICK AN ACTIVITY',
                  meta: 'Nearby',
                  description: 'A shared result',
                  background: '#20344A',
                  accent: '#F0B7A4',
                  tags: ['Activity'],
                },
              },
            }}
          />
        </SafeAreaProvider>,
      );
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Done' }).props.onPress();
    });

    expect(mockAcknowledgeDecisionRoom).toHaveBeenCalledWith('matched-session');
    expect(popToTop).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  test('historical result identifies the partner and goes back to the list', async () => {
    const goBack = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <MatchScreen
            navigation={{ goBack, popToTop: jest.fn() } as never}
            route={{
              key: 'match-history',
              name: 'Match',
              params: {
                sessionId: 'matched-session',
                openedFromHistory: true,
                partnerDisplayName: 'Alex',
                partnerPhotoUrl: null,
                item: {
                  id: 'choice-1',
                  mode: 'do',
                  title: 'Bowling',
                  kicker: 'PICK AN ACTIVITY',
                  meta: 'Nearby',
                  description: 'A shared result',
                  background: '#20344A',
                  accent: '#F0B7A4',
                  tags: ['Activity'],
                },
              },
            }}
          />
        </SafeAreaProvider>,
      );
    });

    expect(renderer.root.findByProps({ children: 'CHOSE WITH' })).toBeDefined();
    expect(renderer.root.findByProps({ children: 'Alex' })).toBeDefined();
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: 'Done' }),
    ).toHaveLength(0);

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Go back' })
        .props.onPress();
    });

    expect(goBack).toHaveBeenCalledTimes(1);
    expect(mockAcknowledgeDecisionRoom).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
