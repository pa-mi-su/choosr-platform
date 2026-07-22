const mockFrom = jest.fn();
const mockEnsureAnonymousSession = jest.fn();

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

jest.mock('../src/services/anonymousAuth', () => ({
  ensureAnonymousSession: () => mockEnsureAnonymousSession(),
}));

import { loadRoomHistory } from '../src/services/sessionService';

const queryResult = (value: unknown) => {
  const builder: Record<string, jest.Mock> & {
    then?: (resolve: (result: unknown) => void) => void;
  } = {
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    maybeSingle: jest.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockResolvedValue(value);
  builder.maybeSingle.mockResolvedValue(value);
  builder.then = resolve => resolve(value);
  return builder;
};

describe('loadRoomHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureAnonymousSession.mockResolvedValue({});
  });

  it('loads only the match from the current round', async () => {
    const session = {
      id: 'session-1',
      access_code: 'ABCDEFGH',
      mode: 'custom',
      status: 'completed',
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
  });

  it('returns an empty history as a successful result', async () => {
    mockFrom.mockReturnValue(queryResult({ data: [], error: null }));

    await expect(loadRoomHistory()).resolves.toEqual([]);
  });
});
