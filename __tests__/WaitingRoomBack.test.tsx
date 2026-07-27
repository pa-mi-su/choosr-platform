import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockCreateLocationDecisionRoom = jest.fn();

jest.mock('../src/hooks/useRoomSync', () => ({
  useRoomSync: jest.fn(),
}));
jest.mock('../src/services/sessionService', () => ({
  createDecisionRoom: jest.fn(),
  createLocationDecisionRoom: (...args: unknown[]) =>
    mockCreateLocationDecisionRoom(...args),
  loadDecisionRoom: jest.fn(),
}));
jest.mock('../src/services/circleService', () => ({
  circleErrorMessage: jest.fn(() => 'Invitation unavailable.'),
  inviteCirclePerson: jest.fn(),
}));
jest.mock('../src/services/roomFlow', () => ({
  roomErrorMessage: jest.fn(() => 'Room unavailable.'),
}));

import { WaitingScreen } from '../src/screens/WaitingScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

describe('waiting room navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLocationDecisionRoom.mockResolvedValue({
      sessionId: 'waiting-session',
      accessCode: 'N4BB4KML',
      inviteToken: 'private-invite',
      expiresAt: '2026-07-27T12:00:00.000Z',
    });
  });

  test('Back returns to the main choice screen without cancelling the room', async () => {
    const replace = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <WaitingScreen
            navigation={{ replace, popToTop: jest.fn() } as never}
            route={{
              key: 'waiting',
              name: 'Waiting',
              params: {
                mode: 'do',
                searchArea: 'Orlando, Florida',
                searchLatitude: 28.5383,
                searchLongitude: -81.3792,
              },
            }}
          />
        </SafeAreaProvider>,
      );
    });

    expect(renderer.root.findByProps({ children: 'N4BB4KML' })).toBeDefined();
    renderer.root.findByProps({ accessibilityLabel: 'Back' }).props.onPress();

    expect(replace).toHaveBeenCalledWith('ChooseHome');

    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  test('persists the creator cuisine preference in a food room', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <WaitingScreen
            navigation={{ replace: jest.fn(), popToTop: jest.fn() } as never}
            route={{
              key: 'waiting-food',
              name: 'Waiting',
              params: {
                mode: 'eat',
                searchArea: 'Orlando, Florida',
                searchLatitude: 28.5383,
                searchLongitude: -81.3792,
                cuisineFilter: 'mexican',
              },
            }}
          />
        </SafeAreaProvider>,
      );
    });

    expect(mockCreateLocationDecisionRoom).toHaveBeenCalledWith({
      mode: 'eat',
      latitude: 28.5383,
      longitude: -81.3792,
      locationLabel: 'Orlando, Florida',
      cuisineFilter: 'mexican',
    });

    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
