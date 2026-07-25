const mockGetSession = jest.fn();
const mockGetUser = jest.fn();
const mockSignOut = jest.fn();
const mockSignInAnonymously = jest.fn();

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      getUser: (...args: unknown[]) => mockGetUser(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      signInAnonymously: (...args: unknown[]) => mockSignInAnonymously(...args),
    },
  },
}));

import { ensureAnonymousSession } from '../src/services/anonymousAuth';

const session = {
  user: { id: 'anonymous-user-1' },
};

describe('ensureAnonymousSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session },
      error: null,
    });
    mockGetUser.mockResolvedValue({
      data: { user: session.user },
      error: null,
    });
  });

  it('deduplicates concurrent verification and reuses a recent result', async () => {
    const [first, second, third] = await Promise.all([
      ensureAnonymousSession(),
      ensureAnonymousSession(),
      ensureAnonymousSession(),
    ]);

    expect(first).toBe(session);
    expect(second).toBe(session);
    expect(third).toBe(session);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    await ensureAnonymousSession();

    expect(mockGetSession).toHaveBeenCalledTimes(2);
    expect(mockGetUser).toHaveBeenCalledTimes(1);
  });

  it('keeps a valid local session usable during a verification outage', async () => {
    const outageSession = {
      user: { id: 'anonymous-user-outage' },
    };
    mockGetSession.mockResolvedValueOnce({
      data: { session: outageSession },
      error: null,
    });
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: new TypeError('Network request failed'),
    });

    await expect(ensureAnonymousSession()).resolves.toBe(outageSession);
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockSignInAnonymously).not.toHaveBeenCalled();
  });
});
