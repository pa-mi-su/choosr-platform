import {
  buildPreviewDeck,
  decisionDecks,
  decisionModes,
  simulatedPartnerLikes,
} from '../src/data/decisions';

describe('decision modes', () => {
  it('ships Watch, Eat, and Do as the initial modes', () => {
    expect(decisionModes.map(mode => mode.id)).toEqual(['watch', 'eat', 'do']);
  });

  it.each(['watch', 'eat', 'do'] as const)(
    '%s has a valid shared preview deck',
    mode => {
      const deck = decisionDecks[mode];
      expect(deck.length).toBeGreaterThanOrEqual(4);
      expect(new Set(deck.map(item => item.id)).size).toBe(deck.length);
      expect(deck.every(item => item.mode === mode)).toBe(true);
      expect(
        [...simulatedPartnerLikes[mode]].every(id =>
          deck.some(item => item.id === id),
        ),
      ).toBe(true);
    },
  );

  it.each(['eat', 'do'] as const)(
    '%s matches use key-free HTTPS Maps handoff',
    mode => {
      expect(
        decisionDecks[mode].every(
          item =>
            item.action?.url.startsWith(
              'https://www.google.com/maps/search/?api=1&query=',
            ) === true,
        ),
      ).toBe(true);
    },
  );

  it('scopes food Maps handoff to the chosen local area', () => {
    const [first] = buildPreviewDeck('eat', 'Downtown Toronto');
    expect(first.action?.url).toContain('Downtown%20Toronto');
    expect(first.action?.url).toContain('restaurants');
  });
});
