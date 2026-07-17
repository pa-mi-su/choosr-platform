import type {
  DecisionItem,
  DecisionMode,
  DecisionModeDefinition,
} from '../types/domain';

const mapsSearch = (query: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query,
  )}`;

export const decisionModes: DecisionModeDefinition[] = [
  {
    id: 'watch',
    icon: '▶',
    eyebrow: 'WATCH TOGETHER',
    title: 'What should we watch?',
    description: 'Movies you can both say yes to.',
    prompt: 'Would you watch this?',
    matchSubtitle: 'Tonight’s watch is settled.',
  },
  {
    id: 'eat',
    icon: '◆',
    eyebrow: 'EAT TOGETHER',
    title: 'What should we eat?',
    description: 'Match on a cuisine, then find it nearby.',
    prompt: 'Would you eat this?',
    matchSubtitle: 'Dinner is decided.',
  },
  {
    id: 'do',
    icon: '✦',
    eyebrow: 'GO TOGETHER',
    title: 'What should we do?',
    description: 'Easy ideas for getting out together.',
    prompt: 'Would you do this?',
    matchSubtitle: 'You have a plan.',
  },
];

export const modeById = Object.fromEntries(
  decisionModes.map(mode => [mode.id, mode]),
) as Record<DecisionMode, DecisionModeDefinition>;

export const decisionDecks: Record<DecisionMode, DecisionItem[]> = {
  watch: [
    {
      id: 'past-lives',
      mode: 'watch',
      title: 'Past Lives',
      kicker: 'A FILM TOGETHER',
      meta: '2023 · 1h 46m · ★ 7.8',
      description:
        'Two childhood friends reunite and confront destiny, love, and the choices that shape a life.',
      background: '#20344A',
      accent: '#F0B7A4',
      tags: ['Drama', 'Romance', 'Paramount+'],
    },
    {
      id: 'arrival',
      mode: 'watch',
      title: 'Arrival',
      kicker: 'A FILM TOGETHER',
      meta: '2016 · 1h 56m · ★ 7.9',
      description:
        'A linguist communicates with mysterious visitors and discovers language can transform time.',
      background: '#39464C',
      accent: '#E9D9BE',
      tags: ['Sci-Fi', 'Drama', 'Prime Video'],
    },
    {
      id: 'grand-budapest',
      mode: 'watch',
      title: 'The Grand Budapest Hotel',
      kicker: 'A FILM TOGETHER',
      meta: '2014 · 1h 40m · ★ 8.1',
      description:
        'A legendary concierge and his lobby boy are swept into a stylish caper.',
      background: '#A84963',
      accent: '#F4C9B8',
      tags: ['Comedy', 'Adventure', 'Hulu'],
    },
    {
      id: 'spiderverse',
      mode: 'watch',
      title: 'Into the Spider-Verse',
      kicker: 'A FILM TOGETHER',
      meta: '2018 · 1h 57m · ★ 8.4',
      description:
        'A Brooklyn teenager meets heroes from other dimensions and learns to wear the mask.',
      background: '#422B61',
      accent: '#EF4B65',
      tags: ['Animation', 'Action', 'Netflix'],
    },
  ],
  eat: [
    ['pizza', 'Pizza night', 'Comfort food · Casual', '#7A3428', '#FFC857'],
    ['sushi', 'Sushi', 'Fresh · Shareable', '#173F42', '#78D6C6'],
    ['tacos', 'Tacos', 'Casual · Flavorful', '#7D4E1D', '#FFD166'],
    ['thai', 'Thai food', 'Noodles · Curry', '#5D284A', '#FF8FAB'],
    ['italian', 'Italian', 'Pasta · Date night', '#3B4D2F', '#C7D59F'],
    ['burgers', 'Burgers', 'Classic · Casual', '#493548', '#F4B860'],
  ].map(([id, title, meta, background, accent]) => ({
    id,
    mode: 'eat' as const,
    title,
    kicker: 'DINNER TOGETHER',
    meta,
    description: `Match on ${title.toLowerCase()}, then open nearby options and pick the place.`,
    background,
    accent,
    tags: ['Nearby', 'Dine-in', 'Takeout'],
    action: {
      label: `Find nearby ${title.toLowerCase()}`,
      url: mapsSearch(`${title} restaurants near me`),
    },
  })),
  do: [
    ['coffee', 'Coffee date', 'Relaxed · Nearby', '#5A3E36', '#D6B18A'],
    ['cocktails', 'Drinks', 'Evening · Social', '#392D50', '#C6A7FF'],
    ['bowling', 'Bowling', 'Playful · Indoors', '#24394B', '#67D5FF'],
    ['museum', 'Museum', 'Culture · Explore', '#4B3A2A', '#E9C46A'],
    ['park', 'A walk in the park', 'Free · Outdoors', '#244B3A', '#70D6A6'],
    ['live-music', 'Live music', 'Night out · Local', '#54243B', '#FF6B8A'],
  ].map(([id, title, meta, background, accent]) => ({
    id,
    mode: 'do' as const,
    title,
    kicker: 'A PLAN TOGETHER',
    meta,
    description: `A simple shared plan: ${title.toLowerCase()} somewhere close by.`,
    background,
    accent,
    tags: ['Tonight', 'Nearby', 'Together'],
    action: {
      label: `Find ${title.toLowerCase()} nearby`,
      url: mapsSearch(`${title} near me`),
    },
  })),
};

export const simulatedPartnerLikes: Record<
  DecisionMode,
  ReadonlySet<string>
> = {
  watch: new Set(['past-lives', 'arrival', 'spiderverse']),
  eat: new Set(['sushi', 'tacos', 'italian']),
  do: new Set(['coffee', 'bowling', 'live-music']),
};

export function buildPreviewDeck(
  mode: DecisionMode,
  searchArea?: string,
): DecisionItem[] {
  const area = searchArea?.trim();
  if (mode === 'watch' || !area) {
    return decisionDecks[mode];
  }
  return decisionDecks[mode].map(item => ({
    ...item,
    action: item.action
      ? {
          ...item.action,
          url: mapsSearch(
            `${item.title}${mode === 'eat' ? ' restaurants' : ''} in ${area}`,
          ),
        }
      : undefined,
  }));
}
