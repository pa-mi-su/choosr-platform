import { parseDecisionItem } from '../src/services/decisionItemParser';

const validItem = {
  id: 'sushi',
  mode: 'eat',
  title: 'Sushi',
  kicker: 'DINNER TOGETHER',
  meta: 'Fresh · Shareable',
  description: 'Find a sushi restaurant together.',
  background: '#173F42',
  accent: '#78D6C6',
  tags: ['Nearby', 'Food'],
  action: {
    label: 'Find sushi',
    url: 'https://www.google.com/maps/search/?api=1&query=sushi',
  },
};

describe('decision item parser', () => {
  it('accepts a complete provider item', () => {
    expect(parseDecisionItem(validItem)).toEqual(validItem);
  });

  it('rejects a malformed provider payload', () => {
    expect(() => parseDecisionItem({ ...validItem, title: null })).toThrow(
      'Invalid decision item field: title.',
    );
  });

  it('rejects unsafe action schemes', () => {
    expect(() =>
      parseDecisionItem({
        ...validItem,
        action: { label: 'Open', url: 'http://insecure.example' },
      }),
    ).toThrow('Decision item action must use HTTPS.');
  });

  it('rejects invalid presentation colors', () => {
    expect(() =>
      parseDecisionItem({ ...validItem, background: 'transparent' }),
    ).toThrow('Invalid decision item field: background.');
  });
});
