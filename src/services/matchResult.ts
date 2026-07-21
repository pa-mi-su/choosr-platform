import type { DecisionItem } from '../types/domain';

export type MatchResultAction = {
  label: string;
  url: string;
};

/** Returns the useful next step after a room reaches its terminal match. */
export function getMatchResultAction(
  item: DecisionItem,
): MatchResultAction | null {
  if (item.action) {
    return item.action;
  }

  return null;
}
