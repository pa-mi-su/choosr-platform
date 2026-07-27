const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockEnsureAnonymousSession = jest.fn();

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

jest.mock('../src/services/anonymousAuth', () => ({
  ensureAnonymousSession: () => mockEnsureAnonymousSession(),
}));

import {
  acknowledgeDecisionRoom,
  cancelDecisionRoom,
  createLocationDecisionRoom,
  dismissAllCompletedRooms,
  dismissCompletedRoom,
  loadRoomHistory,
  submitDecisionReliably,
} from '../src/services/sessionService';

const queryResult = (value: unknown) => {
  const builder: Record<string, jest.Mock> & {
    then?: (resolve: (result: unknown) => void) => void;
  } = {
    select: jest.fn(),
    eq: jest.fn(),
    in: jest.fn(),
    gt: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    maybeSingle: jest.fn(),
    single: jest.fn(),
    abortSignal: jest.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.gt.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockResolvedValue(value);
  builder.maybeSingle.mockResolvedValue(value);
  builder.single.mockResolvedValue(value);
  builder.abortSignal.mockResolvedValue(value);
  builder.then = resolve => resolve(value);
  return builder;
};

describe('loadRoomHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureAnonymousSession.mockResolvedValue({
      user: { id: 'anonymous-user-1' },
    });
  });

  it('loads active rooms and only the match from the current round', async () => {
    const session = {
      session_id: 'session-1',
      access_code: 'ABCDEFGH',
      mode: 'custom',
      status: 'active',
      round_number: 2,
      expires_at: '2026-07-23T00:00:00.000Z',
      created_at: '2026-07-22T00:00:00.000Z',
      participant_count: 2,
      total_choices: 4,
      completed_choices: 2,
      matched_item_id: 'choice-2',
      partner_display_name: 'Alex',
      partner_avatar_path: null,
    };
    const history = queryResult({ data: [session], error: null });
    mockRpc.mockReturnValue(history);

    await expect(loadRoomHistory()).resolves.toEqual([
      expect.objectContaining({
        sessionId: 'session-1',
        roundNumber: 2,
        matchedItemId: 'choice-2',
        partnerDisplayName: 'Alex',
        partnerPhotoUrl: null,
      }),
    ]);
    expect(mockRpc).toHaveBeenCalledWith('list_active_room_history');
    expect(history.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('returns an empty history as a successful result', async () => {
    mockRpc.mockReturnValue(queryResult({ data: [], error: null }));

    await expect(loadRoomHistory()).resolves.toEqual([]);
  });
});

describe('completed room history controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureAnonymousSession.mockResolvedValue({
      user: { id: 'anonymous-user-1' },
    });
    mockRpc.mockResolvedValue({ data: 1, error: null });
  });

  it('deletes one completed result only for the current participant', async () => {
    await expect(dismissCompletedRoom('session-1')).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith('dismiss_completed_room', {
      p_session_id: 'session-1',
    });
  });

  it('deletes all completed results only for the current participant', async () => {
    await expect(dismissAllCompletedRooms()).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith('dismiss_all_completed_rooms');
  });
});

describe('cancelDecisionRoom', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cancels the room through the participant-authorized RPC', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await expect(cancelDecisionRoom('session-1')).resolves.toBeUndefined();

    expect(mockRpc).toHaveBeenCalledWith('cancel_session', {
      p_session_id: 'session-1',
    });
  });

  it('surfaces cancellation failures', async () => {
    const error = new Error('not_a_session_participant');
    mockRpc.mockResolvedValue({ error });

    await expect(cancelDecisionRoom('session-1')).rejects.toBe(error);
  });
});

describe('acknowledgeDecisionRoom', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureAnonymousSession.mockResolvedValue({
      user: { id: 'anonymous-user-1' },
    });
  });

  it('records that the current participant viewed a completed result', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await expect(acknowledgeDecisionRoom('session-1')).resolves.toBeUndefined();

    expect(mockRpc).toHaveBeenCalledWith('acknowledge_room_completion', {
      p_session_id: 'session-1',
    });
  });
});

describe('createLocationDecisionRoom', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureAnonymousSession.mockResolvedValue({});
  });

  it('creates a waiting room without exposing the location through a deck', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          session_id: 'session-1',
          access_code: 'ABCDEFGH',
          invite_token: 'private-token',
          expires_at: '2026-07-25T00:00:00.000Z',
        },
      ],
      error: null,
    });

    await expect(
      createLocationDecisionRoom({
        mode: 'do',
        latitude: 28.5383,
        longitude: -81.3792,
        locationLabel: 'Orlando, Florida',
      }),
    ).resolves.toEqual({
      sessionId: 'session-1',
      accessCode: 'ABCDEFGH',
      inviteToken: 'private-token',
      expiresAt: '2026-07-25T00:00:00.000Z',
    });
    expect(mockRpc).toHaveBeenCalledWith('create_location_decision_session', {
      p_mode: 'do',
      p_latitude: 28.5383,
      p_longitude: -81.3792,
      p_location_label: 'Orlando, Florida',
      p_region: 'US',
    });
  });
});

describe('submitDecisionReliably', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('recovers a committed swipe when the RPC response is lost', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('Network request failed'),
    });
    const swipes = queryResult({
      data: [{ item_id: 'choice-2' }],
      error: null,
    });
    const session = queryResult({
      data: { status: 'active', round_number: 1 },
      error: null,
    });
    const match = queryResult({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'swipes') return swipes;
      if (table === 'sessions') return session;
      if (table === 'matches') return match;
      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(
      submitDecisionReliably({
        sessionId: 'session-1',
        round: 1,
        itemId: 'choice-2',
        direction: 'right',
      }),
    ).resolves.toEqual({
      outcome: 'next',
      match_id: null,
      matched_item_id: null,
    });
  });

  it('recovers the authoritative terminal outcome after a lost response', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('Failed to fetch'),
    });
    const swipes = queryResult({
      data: [{ item_id: 'choice-2' }],
      error: null,
    });
    const session = queryResult({
      data: { status: 'completed', round_number: 1 },
      error: null,
    });
    const match = queryResult({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'swipes') return swipes;
      if (table === 'sessions') return session;
      if (table === 'matches') return match;
      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(
      submitDecisionReliably({
        sessionId: 'session-1',
        round: 1,
        itemId: 'choice-2',
        direction: 'left',
      }),
    ).resolves.toEqual({
      outcome: 'no-match',
      match_id: null,
      matched_item_id: null,
    });
  });

  it('keeps a real submission failure visible when no swipe was committed', async () => {
    const networkError = new Error('Network request failed');
    mockRpc.mockResolvedValue({ data: null, error: networkError });
    mockFrom.mockReturnValue(
      queryResult({
        data: [],
        error: null,
      }),
    );

    await expect(
      submitDecisionReliably({
        sessionId: 'session-1',
        round: 1,
        itemId: 'choice-2',
        direction: 'right',
      }),
    ).rejects.toBe(networkError);
  });
});
