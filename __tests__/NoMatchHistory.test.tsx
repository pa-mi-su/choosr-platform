import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('../src/hooks/useRoomSync', () => ({
  useRoomSync: jest.fn(),
}));
jest.mock('../src/services/sessionService', () => ({
  acknowledgeDecisionRoom: jest.fn(),
  loadDecisionDeck: jest.fn(),
  loadDecisionRoom: jest.fn(),
  startDecisionRound: jest.fn(),
}));

import { NoMatchScreen } from '../src/screens/NoMatchScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

describe('completed no-match history', () => {
  test('is read-only, identifies the partner, and returns to the list', async () => {
    const goBack = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <NoMatchScreen
            navigation={{ goBack } as never}
            route={{
              key: 'no-match-history',
              name: 'NoMatch',
              params: {
                sessionId: 'completed-session',
                mode: 'do',
                openedFromHistory: true,
                partnerDisplayName: 'Jordan',
                partnerPhotoUrl: null,
              },
            }}
          />
        </SafeAreaProvider>,
      );
    });

    expect(renderer.root.findByProps({ children: 'CHOSE WITH' })).toBeDefined();
    expect(renderer.root.findByProps({ children: 'Jordan' })).toBeDefined();
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: 'End room' }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: 'Try another deck' }),
    ).toHaveLength(0);

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Go back' })
        .props.onPress();
    });

    expect(goBack).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
