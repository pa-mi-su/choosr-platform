import { getMatchResultAction } from '../src/services/matchResult';
import type { DecisionItem } from '../src/types/domain';

const watchItem: DecisionItem = {
  id: 'arrival',
  mode: 'watch',
  title: 'Arrival',
  kicker: 'A FILM TOGETHER',
  meta: '2016',
  description: 'Science fiction drama.',
  background: '#39464C',
  accent: '#E9D9BE',
  tags: ['Sci-Fi'],
};

describe('getMatchResultAction', () => {
  it('provides a useful watch action when the deck has no provider link', () => {
    expect(getMatchResultAction(watchItem)).toEqual({
      label: 'Find where to watch',
      url: 'https://www.google.com/search?q=Arrival%20where%20to%20watch',
    });
  });

  it('preserves the item action for local decisions', () => {
    const action = {
      label: 'Find sushi nearby',
      url: 'https://www.google.com/maps/search/?api=1&query=sushi',
    };
    expect(getMatchResultAction({ ...watchItem, mode: 'eat', action })).toEqual(
      action,
    );
  });
});
