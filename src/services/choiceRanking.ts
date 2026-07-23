export const MAX_RANKED_CHOICES = 3;

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
