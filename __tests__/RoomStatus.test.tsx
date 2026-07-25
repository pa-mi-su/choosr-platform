import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockCancelDecisionRoom = jest.fn();
const mockLoadDecisionRoom = jest.fn();

jest.mock('../src/hooks/useRoomSync', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  return {
    useRoomSync: ({ refresh }: { refresh: () => Promise<void> }) => {
      ReactModule.useEffect(() => {
        refresh().catch(() => undefined);
      }, [refresh]);
    },
  };
});
jest.mock('../src/services/sessionService', () => ({
  cancelDecisionRoom: (...args: unknown[]) => mockCancelDecisionRoom(...args),
  loadDecisionRoom: (...args: unknown[]) => mockLoadDecisionRoom(...args),
}));
jest.mock('../src/services/roomFlow', () => ({
  roomErrorMessage: jest.fn(() => 'Room unavailable.'),
}));

import { RoomStatusScreen } from '../src/screens/RoomStatusScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

describe('Room Status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadDecisionRoom.mockResolvedValue({
      sessionId: 'waiting-session',
      accessCode: 'N4BB4KML',
      mode: 'do',
      status: 'waiting',
      roundNumber: 1,
      expiresAt: '2026-07-26T12:00:00.000Z',
      participantCount: 1,
    });
    mockCancelDecisionRoom.mockResolvedValue(undefined);
  });

  test('shows live waiting details and lets the participant cancel', async () => {
    const goBack = jest.fn();
    const alert = jest.spyOn(Alert, 'alert');
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <RoomStatusScreen
            navigation={{ goBack, replace: jest.fn() } as never}
            route={{
              key: 'room-status',
              name: 'RoomStatus',
              params: { sessionId: 'waiting-session' },
            }}
          />
        </SafeAreaProvider>,
      );
    });

    expect(
      renderer.root.findByProps({ children: 'WAITING FOR PARTNER' }),
    ).toBeDefined();
    expect(renderer.root.findByProps({ children: 'N4BB4KML' })).toBeDefined();

    renderer.root
      .findByProps({ accessibilityLabel: 'Cancel room' })
      .props.onPress();
    const cancelButton = alert.mock.calls[0][2]?.find(
      button => button.text === 'Cancel room',
    );
    await ReactTestRenderer.act(async () => {
      await cancelButton?.onPress?.();
    });

    expect(mockCancelDecisionRoom).toHaveBeenCalledWith('waiting-session');
    expect(goBack).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
