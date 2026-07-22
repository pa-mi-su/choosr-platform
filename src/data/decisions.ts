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
    id: 'do',
    icon: '✦',
    eyebrow: 'PICK AN ACTIVITY',
    title: 'Pick an activity',
    description: 'Find real things to do near a ZIP or postal code.',
    prompt: 'Would you do this?',
    matchSubtitle: 'You have a plan.',
  },
  {
    id: 'eat',
    icon: '◆',
    eyebrow: 'PICK FOOD',
    title: 'Pick food',
    description: 'Choose from real restaurants nearby.',
    prompt: 'Would you eat here?',
    matchSubtitle: 'Dinner is decided.',
  },
  {
    id: 'custom',
    icon: '＋',
    eyebrow: 'CUSTOM CHOICE',
    title: 'Create your own',
    description: 'Add text choices or upload photos for the room.',
    prompt: 'Is this your pick?',
    matchSubtitle: 'Your group picked a winner.',
  },
];

export const modeById = Object.fromEntries(
  decisionModes.map(mode => [mode.id, mode]),
) as Record<DecisionMode, DecisionModeDefinition>;

export const decisionDecks: Record<DecisionMode, DecisionItem[]> = {
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
  custom: [],
};

export function buildPreviewDeck(
  mode: DecisionMode,
  searchArea?: string,
): DecisionItem[] {
  if (mode === 'custom') return [];
  const area = searchArea?.trim();
  if (!area) {
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
