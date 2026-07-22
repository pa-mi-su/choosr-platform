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

  it('accepts a custom photo choice with an HTTPS image', () => {
    const item = {
      id: 'custom-photo',
      mode: 'custom',
      title: 'Photo 1',
      kicker: validItem.kicker,
      meta: validItem.meta,
      description: validItem.description,
      background: validItem.background,
      accent: validItem.accent,
      tags: validItem.tags,
      imageUrl: 'https://example.com/photo.jpg',
    };
    expect(parseDecisionItem(item)).toEqual(item);
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

  it('rejects unsafe image schemes', () => {
    expect(() =>
      parseDecisionItem({
        ...validItem,
        imageUrl: 'http://insecure.example/photo.jpg',
      }),
    ).toThrow('Decision item image must use HTTPS.');
  });

  it('rejects invalid presentation colors', () => {
    expect(() =>
      parseDecisionItem({ ...validItem, background: 'transparent' }),
    ).toThrow('Invalid decision item field: background.');
  });
});
