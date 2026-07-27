import {
  flushPendingNotificationNavigation,
  navigationRef,
  openFromNotification,
} from '../src/navigation/navigationRef';

describe('notification tap navigation', () => {
  const mockNavigate = jest
    .spyOn(navigationRef, 'navigate')
    .mockImplementation((() => undefined) as never);
  const mockIsReady = jest.spyOn(navigationRef, 'isReady');

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsReady.mockReturnValue(true);
  });

  it.each([
    ['room_invitation', 'ActiveRooms'],
    ['connection_request', 'Circle'],
    ['chat_message', 'ChatHome'],
  ] as const)('routes %s to %s', (kind, destination) => {
    openFromNotification({ data: { kind } } as never);
    expect(mockNavigate).toHaveBeenCalledWith(destination);
  });

  it('queues the exact destination until cold-start navigation is ready', () => {
    mockIsReady.mockReturnValue(false);
    openFromNotification({
      data: { kind: 'room_invitation', route: 'ActiveRooms' },
    } as never);
    expect(mockNavigate).not.toHaveBeenCalled();

    mockIsReady.mockReturnValue(true);
    flushPendingNotificationNavigation();
    expect(mockNavigate).toHaveBeenCalledWith('ActiveRooms');
  });
});
