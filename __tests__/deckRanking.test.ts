import {
  rankForChoice,
  toggleRankedChoice,
} from '../src/services/choiceRanking';
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

  it('builds and compacts a private top-three ranking', () => {
    let ranked = toggleRankedChoice([], 'one');
    ranked = toggleRankedChoice(ranked, 'two');
    ranked = toggleRankedChoice(ranked, 'three');
    expect(toggleRankedChoice(ranked, 'four')).toEqual(ranked);
    expect(rankForChoice(ranked, 'two')).toBe(2);

    ranked = toggleRankedChoice(ranked, 'two');
    expect(ranked).toEqual(['one', 'three']);
    expect(rankForChoice(ranked, 'three')).toBe(2);
  });
});
