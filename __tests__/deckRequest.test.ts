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
      cuisineFilter: 'all',
    });
  });

  test('still requires a location for a standalone local deck', () => {
    expect(() => parseDeckRequest({ mode: 'eat' })).toThrow(
      'A valid latitude and longitude are required',
    );
  });

  test('accepts a supported food cuisine and rejects unknown filters', () => {
    expect(
      parseDeckRequest({
        mode: 'eat',
        latitude: 28.5383,
        longitude: -81.3792,
        cuisineFilter: 'mexican',
      }),
    ).toEqual(
      expect.objectContaining({
        mode: 'eat',
        cuisineFilter: 'mexican',
      }),
    );
    expect(() =>
      parseDeckRequest({
        mode: 'eat',
        latitude: 28.5383,
        longitude: -81.3792,
        cuisineFilter: 'anything',
      }),
    ).toThrow('Invalid cuisineFilter');
  });
});
