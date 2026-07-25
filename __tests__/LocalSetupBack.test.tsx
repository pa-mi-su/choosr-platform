import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockCancelDecisionRoom = jest.fn();

jest.mock('@react-navigation/native', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(effect, [effect]);
    },
  };
});
jest.mock('../src/services/locationService', () => ({
  locationQueryHint: jest.fn(() => null),
  searchLocations: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../src/services/deckService', () => ({
  prepareSharedLocationDeck: jest.fn(),
}));
jest.mock('../src/services/roomFlow', () => ({
  roomErrorMessage: jest.fn(() => 'Room could not be closed.'),
}));
jest.mock('../src/services/sessionService', () => ({
  cancelDecisionRoom: (...args: unknown[]) => mockCancelDecisionRoom(...args),
}));

import { LocalSetupScreen } from '../src/screens/LocalSetupScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

describe('accepted location room back behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCancelDecisionRoom.mockResolvedValue(undefined);
  });

  test('confirms and atomically closes an accepted room for both people', async () => {
    const replace = jest.fn();
    const goBack = jest.fn();
    const alert = jest.spyOn(Alert, 'alert');
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <LocalSetupScreen
            navigation={{ goBack, replace } as never}
            route={{
              key: 'location',
              name: 'LocalSetup',
              params: {
                mode: 'do',
                sessionId: 'session-1',
                roundNumber: 1,
              },
            }}
          />
        </SafeAreaProvider>,
      );
    });

    renderer.root.findByProps({ accessibilityLabel: 'Back' }).props.onPress();

    expect(goBack).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'Leave this room?',
      expect.stringContaining('ends it for both people'),
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0][2];
    const leaveButton = buttons?.find(button => button.text === 'Leave room');
    await ReactTestRenderer.act(async () => {
      await leaveButton?.onPress?.();
    });

    expect(mockCancelDecisionRoom).toHaveBeenCalledWith('session-1');
    expect(replace).toHaveBeenCalledWith('ActiveRooms');

    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  test('keeps ordinary pre-room Back navigation unchanged', async () => {
    const goBack = jest.fn();
    const alert = jest.spyOn(Alert, 'alert');
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <LocalSetupScreen
            navigation={{ goBack, replace: jest.fn() } as never}
            route={{
              key: 'location',
              name: 'LocalSetup',
              params: { mode: 'eat' },
            }}
          />
        </SafeAreaProvider>,
      );
    });

    renderer.root.findByProps({ accessibilityLabel: 'Back' }).props.onPress();

    expect(goBack).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
