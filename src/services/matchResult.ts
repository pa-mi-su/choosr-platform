import type { DecisionItem } from '../types/domain';

export type MatchResultAction = {
  label: string;
  url: string;
};

const googleSearch = (query: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(query)}`;

/** Returns the useful next step after a room reaches its terminal match. */
export function getMatchResultAction(
  item: DecisionItem,
): MatchResultAction | null {
  if (item.action) {
    return item.action;
  }

  if (item.mode === 'watch') {
    return {
      label: 'Find where to watch',
      url: googleSearch(`${item.title} where to watch`),
    };
  }

  return null;
}
