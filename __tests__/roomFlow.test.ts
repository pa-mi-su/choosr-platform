import {
  findFirstUnswipedIndex,
  getRoomDestination,
  loadItemsWithFallback,
  normalizeRoomCode,
  roomErrorMessage,
} from '../src/services/roomFlow';

describe('real room flow', () => {
  it('uses a fallback deck when live discovery is temporarily unavailable', async () => {
    await expect(
      loadItemsWithFallback(
        () => Promise.reject(new Error('Failed to fetch')),
        ['fallback'],
      ),
    ).resolves.toEqual(['fallback']);
  });

  it('keeps a non-empty live discovery deck', async () => {
    await expect(
      loadItemsWithFallback(() => Promise.resolve(['live']), ['fallback']),
    ).resolves.toEqual(['live']);
  });

  it('does not treat a waiting room as joined', () => {
    expect(getRoomDestination('waiting', null)).toBe('waiting');
  });

  it('routes only authoritative match state to a match', () => {
    expect(getRoomDestination('matched', 'arrival')).toBe('matched');
    expect(getRoomDestination('matched', null)).toBe('waiting');
  });

  it('routes terminal room closure back out of the room flow', () => {
    expect(getRoomDestination('cancelled', null)).toBe('closed');
    expect(getRoomDestination('expired', null)).toBe('closed');
  });

  it('resumes at the first item without a persisted swipe', () => {
    expect(
      findFirstUnswipedIndex(
        ['arrival', 'past-lives', 'spiderverse'],
        new Set(['arrival', 'past-lives']),
      ),
    ).toBe(2);
  });

  it('reports a finished local deck when every swipe is persisted', () => {
    expect(findFirstUnswipedIndex(['arrival'], new Set(['arrival']))).toBe(-1);
  });

  it('normalizes ambiguous and invalid room-code characters', () => {
    expect(normalizeRoomCode('abci-l0o2-34567')).toBe('ABCL2345');
  });

  it('maps backend room errors to useful UI copy', () => {
    expect(roomErrorMessage(new Error('room_not_found'))).toContain(
      'not found',
    );
    expect(roomErrorMessage(new Error('room_full'))).toContain(
      'no longer available',
    );
    expect(
      roomErrorMessage(new Error('participant_locations_too_far')),
    ).toContain('within 60 miles');
  });
});
