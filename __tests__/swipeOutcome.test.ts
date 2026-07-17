import { getSwipeOutcome } from '../src/services/swipeOutcome';

const partnerLikes = new Set(['arrival']);
describe('mutual matching', () => {
  it('matches when both partners like the movie', () =>
    expect(
      getSwipeOutcome({
        direction: 'right',
        movieId: 'arrival',
        index: 1,
        deckSize: 4,
        partnerLikes,
      }),
    ).toBe('match'));
  it('continues when choices do not match', () =>
    expect(
      getSwipeOutcome({
        direction: 'left',
        movieId: 'arrival',
        index: 1,
        deckSize: 4,
        partnerLikes,
      }),
    ).toBe('next'));
  it('finishes when the deck is exhausted', () =>
    expect(
      getSwipeOutcome({
        direction: 'right',
        movieId: 'moonlight',
        index: 3,
        deckSize: 4,
        partnerLikes,
      }),
    ).toBe('no-match'));
});
