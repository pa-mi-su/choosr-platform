import { getSwipeOutcome } from '../src/services/swipeOutcome';

const partnerLikes = new Set(['arrival']);
describe('mutual matching', () => {
  it('matches when both partners like the movie', () =>
    expect(
      getSwipeOutcome({
        direction: 'right',
        itemId: 'arrival',
        index: 1,
        deckSize: 4,
        partnerLikes,
      }),
    ).toBe('match'));
  it('continues when choices do not match', () =>
    expect(
      getSwipeOutcome({
        direction: 'left',
        itemId: 'arrival',
        index: 1,
        deckSize: 4,
        partnerLikes,
      }),
    ).toBe('next'));
  it('finishes when the deck is exhausted', () =>
    expect(
      getSwipeOutcome({
        direction: 'right',
        itemId: 'moonlight',
        index: 3,
        deckSize: 4,
        partnerLikes,
      }),
    ).toBe('no-match'));
});
