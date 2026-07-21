import { getMatchResultAction } from '../src/services/matchResult';
import type { DecisionItem } from '../src/types/domain';

const localItem: DecisionItem = {
  id: 'sushi',
  mode: 'eat',
  title: 'Sushi',
  kicker: 'DINNER TOGETHER',
  meta: 'Fresh',
  description: 'Find sushi nearby.',
  background: '#39464C',
  accent: '#E9D9BE',
  tags: ['Nearby'],
};

describe('getMatchResultAction', () => {
  it('returns null when a decision item has no follow-up action', () => {
    expect(getMatchResultAction(localItem)).toBeNull();
  });

  it('preserves the item action for local decisions', () => {
    const action = {
      label: 'Find sushi nearby',
      url: 'https://www.google.com/maps/search/?api=1&query=sushi',
    };
    expect(getMatchResultAction({ ...localItem, action })).toEqual(action);
  });
});
