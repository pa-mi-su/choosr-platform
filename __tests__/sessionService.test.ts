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
  cancelDecisionRoom,
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
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.gt.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockResolvedValue(value);
  builder.maybeSingle.mockResolvedValue(value);
  builder.single.mockResolvedValue(value);
  builder.then = resolve => resolve(value);
  return builder;
};

describe('loadRoomHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureAnonymousSession.mockResolvedValue({});
  });

  it('loads active rooms and only the match from the current round', async () => {
    const session = {
      id: 'session-1',
      access_code: 'ABCDEFGH',
      mode: 'custom',
      status: 'active',
      round_number: 2,
      expires_at: '2026-07-23T00:00:00.000Z',
      created_at: '2026-07-22T00:00:00.000Z',
    };
    const sessions = queryResult({ data: [session], error: null });
    const participants = queryResult({ count: 2, error: null });
    const items = queryResult({ count: 4, error: null });
    const swipes = queryResult({ count: 2, error: null });
    const match = queryResult({
      data: { item_id: 'choice-2' },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') return sessions;
      if (table === 'participants') return participants;
      if (table === 'session_items') return items;
      if (table === 'swipes') return swipes;
      if (table === 'matches') return match;
      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(loadRoomHistory()).resolves.toEqual([
      expect.objectContaining({
        sessionId: 'session-1',
        roundNumber: 2,
        matchedItemId: 'choice-2',
      }),
    ]);
    expect(match.eq).toHaveBeenCalledWith('session_id', 'session-1');
    expect(match.eq).toHaveBeenCalledWith('round', 2);
    expect(sessions.in).toHaveBeenCalledWith('status', ['waiting', 'active']);
    expect(sessions.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
  });

  it('returns an empty history as a successful result', async () => {
    mockFrom.mockReturnValue(queryResult({ data: [], error: null }));

    await expect(loadRoomHistory()).resolves.toEqual([]);
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
