import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockLoadRoomHistory = jest.fn();
const mockReadCachedRoomHistory = jest.fn();
const mockLoadPendingRoomInvitations = jest.fn();
const mockReadCachedCircleSnapshot = jest.fn();
const mockAnswerRoomInvitation = jest.fn();

jest.mock('@react-navigation/native', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(effect, [effect]);
    },
  };
});
jest.mock('../src/services/sessionService', () => ({
  loadRoomHistory: (...args: unknown[]) => mockLoadRoomHistory(...args),
  readCachedRoomHistory: (...args: unknown[]) =>
    mockReadCachedRoomHistory(...args),
}));
jest.mock('../src/services/circleService', () => ({
  answerRoomInvitation: (...args: unknown[]) =>
    mockAnswerRoomInvitation(...args),
  circleErrorMessage: jest.fn(() => 'Invitation unavailable.'),
  loadPendingRoomInvitations: (...args: unknown[]) =>
    mockLoadPendingRoomInvitations(...args),
  readCachedCircleSnapshot: (...args: unknown[]) =>
    mockReadCachedCircleSnapshot(...args),
}));

import { ActiveRoomsScreen } from '../src/screens/ActiveRoomsScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

describe('Active Rooms invitations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadCachedRoomHistory.mockResolvedValue(null);
    mockReadCachedCircleSnapshot.mockResolvedValue(null);
    mockLoadRoomHistory.mockResolvedValue([]);
    mockLoadPendingRoomInvitations.mockResolvedValue([
      {
        invitationId: 'invite-1',
        sessionId: 'session-1',
        senderDisplayName: 'Alex',
        senderHandle: 'alex',
        mode: 'custom',
        expiresAt: '2026-07-26T12:00:00.000Z',
      },
    ]);
    mockAnswerRoomInvitation.mockResolvedValue({
      sessionId: 'session-1',
      roundNumber: 1,
    });
  });

  test('keeps a pending invite discoverable independently of the inbox', async () => {
    const replace = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <ActiveRoomsScreen
            navigation={
              { goBack: jest.fn(), navigate: jest.fn(), replace } as never
            }
            route={{ key: 'rooms', name: 'ActiveRooms' } as never}
          />
        </SafeAreaProvider>,
      );
    });

    expect(
      renderer.root.findByProps({ children: 'ROOM INVITE' }),
    ).toBeDefined();
    expect(
      renderer.root.findByProps({ accessibilityLabel: 'Join' }),
    ).toBeDefined();

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Join' }).props.onPress();
    });

    expect(mockAnswerRoomInvitation).toHaveBeenCalledWith('invite-1', true);
    expect(replace).toHaveBeenCalledWith('Swipe', {
      sessionId: 'session-1',
      roundNumber: 1,
      mode: 'custom',
    });

    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  test('opens a waiting room so its status can be viewed or cancelled', async () => {
    mockLoadRoomHistory.mockResolvedValue([
      {
        sessionId: 'waiting-session',
        accessCode: 'N4BB4KML',
        mode: 'do',
        status: 'waiting',
        roundNumber: 1,
        expiresAt: '2026-07-26T12:00:00.000Z',
        participantCount: 1,
        createdAt: '2026-07-25T12:00:00.000Z',
        totalChoices: 0,
        completedChoices: 0,
        matchedItemId: null,
      },
    ]);
    mockLoadPendingRoomInvitations.mockResolvedValue([]);
    const navigate = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <ActiveRoomsScreen
            navigation={
              { goBack: jest.fn(), navigate, replace: jest.fn() } as never
            }
            route={{ key: 'rooms', name: 'ActiveRooms' } as never}
          />
        </SafeAreaProvider>,
      );
    });

    expect(
      renderer.root.findByProps({ children: 'View status' }),
    ).toBeDefined();
    renderer.root
      .findByProps({
        accessibilityLabel:
          'Pick an activity. Waiting for a partner. View room status.',
      })
      .props.onPress();

    expect(navigate).toHaveBeenCalledWith('RoomStatus', {
      sessionId: 'waiting-session',
    });

    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
