import type { SwipeDirection } from '../types/domain';

type Input = {
  direction: SwipeDirection;
  itemId: string;
  index: number;
  deckSize: number;
  partnerLikes: ReadonlySet<string>;
};
export type SwipeOutcome = 'match' | 'next' | 'no-match';

export function getSwipeOutcome(input: Input): SwipeOutcome {
  if (input.direction === 'right' && input.partnerLikes.has(input.itemId)) {
    return 'match';
  }
  return input.index >= input.deckSize - 1 ? 'no-match' : 'next';
}
