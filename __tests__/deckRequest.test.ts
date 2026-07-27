import { parseDeckRequest } from '../supabase/functions/build-deck/types';

describe('local deck request ownership', () => {
  test('allows an invited participant to prepare from the room creator location', () => {
    expect(
      parseDeckRequest({
        mode: 'do',
        sessionId: '10000000-0000-0000-0000-000000000001',
      }),
    ).toEqual({
      mode: 'do',
      region: 'US',
      sessionId: '10000000-0000-0000-0000-000000000001',
    });
  });

  test('still requires a location for a standalone local deck', () => {
    expect(() => parseDeckRequest({ mode: 'eat' })).toThrow(
      'A valid latitude and longitude are required',
    );
  });
});
