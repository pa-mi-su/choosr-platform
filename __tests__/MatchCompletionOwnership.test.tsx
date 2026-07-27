import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockAcknowledgeDecisionRoom = jest.fn();

jest.mock('../src/hooks/useRoomSync', () => ({
  useRoomSync: jest.fn(),
}));
jest.mock('../src/services/sessionService', () => ({
  acknowledgeDecisionRoom: (...args: unknown[]) =>
    mockAcknowledgeDecisionRoom(...args),
  loadDecisionRoom: jest.fn(),
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
