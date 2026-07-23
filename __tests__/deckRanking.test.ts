import {
  cappedCardDwellMs,
  MAX_CARD_DWELL_MS,
} from '../src/services/cardDwell';
import { shuffleDecisionDeck } from '../src/services/deckService';
import type { DecisionItem } from '../src/types/domain';

const item = (id: string): DecisionItem => ({
  id,
  mode: 'eat',
  title: id,
  kicker: 'PICK FOOD',
  meta: 'Nearby',
  description: id,
  background: '#000000',
  accent: '#ffffff',
  tags: ['Food'],
});

describe('discovery deck ranking inputs', () => {
  it('shuffles a copied deck without mutating provider order', () => {
    const original = [item('one'), item('two'), item('three')];
    const randomValues = [0, 0];
    const shuffled = shuffleDecisionDeck(
      original,
      () => randomValues.shift() ?? 0,
    );

    expect(shuffled.map(value => value.id)).toEqual(['two', 'three', 'one']);
    expect(original.map(value => value.id)).toEqual(['one', 'two', 'three']);
  });

  it('caps active consideration time and rejects invalid measurements', () => {
    expect(cappedCardDwellMs(10_432.4)).toBe(10_432);
    expect(cappedCardDwellMs(MAX_CARD_DWELL_MS + 20_000)).toBe(
      MAX_CARD_DWELL_MS,
    );
    expect(cappedCardDwellMs(-10)).toBe(0);
    expect(cappedCardDwellMs(Number.NaN)).toBe(0);
  });
});
