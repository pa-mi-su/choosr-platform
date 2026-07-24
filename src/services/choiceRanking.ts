export const MAX_RANKED_CHOICES = 3;

export function requiredRankedChoiceCount(acceptedChoiceCount: number): number {
  return Math.min(
    Math.max(Math.trunc(acceptedChoiceCount), 0),
    MAX_RANKED_CHOICES,
  );
}

export function hasCompleteChoiceRanking(
  rankedChoiceCount: number,
  acceptedChoiceCount: number,
): boolean {
  return rankedChoiceCount === requiredRankedChoiceCount(acceptedChoiceCount);
}

export function rankingPointsDescription(acceptedChoiceCount: number): string {
  const rankedCount = requiredRankedChoiceCount(acceptedChoiceCount);
  const descriptions = Array.from(
    { length: rankedCount },
    (_, index) =>
      `#${index + 1} is worth ${3 - index} ${index === 2 ? 'point' : 'points'}`,
  );
  if (descriptions.length < 2) return descriptions[0] ?? '';
  if (descriptions.length === 2)
    return `${descriptions[0]} and ${descriptions[1]}.`;
  return `${descriptions.slice(0, -1).join(', ')}, and ${descriptions.at(-1)}.`;
}

/**
 * Adds a choice at the next available rank, or removes it and compacts the
 * remaining ranks. The returned array is always a new value.
 */
export function toggleRankedChoice(
  rankedItemIds: readonly string[],
  itemId: string,
  limit = MAX_RANKED_CHOICES,
): string[] {
  if (rankedItemIds.includes(itemId)) {
    return rankedItemIds.filter(value => value !== itemId);
  }
  if (rankedItemIds.length >= limit) {
    return [...rankedItemIds];
  }
  return [...rankedItemIds, itemId];
}

export function rankForChoice(
  rankedItemIds: readonly string[],
  itemId: string,
): number | undefined {
  const index = rankedItemIds.indexOf(itemId);
  return index === -1 ? undefined : index + 1;
}
