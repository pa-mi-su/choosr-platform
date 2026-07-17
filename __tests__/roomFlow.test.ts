import {
  findFirstUnswipedIndex,
  getRoomDestination,
  normalizeRoomCode,
  roomErrorMessage,
} from '../src/services/roomFlow';

describe('real room flow', () => {
  it('does not treat a waiting room as joined', () => {
    expect(getRoomDestination('waiting', null)).toBe('waiting');
  });

  it('routes only authoritative match state to a match', () => {
    expect(getRoomDestination('matched', 'arrival')).toBe('matched');
    expect(getRoomDestination('matched', null)).toBe('waiting');
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
  });
});
