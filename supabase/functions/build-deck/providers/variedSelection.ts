type PlaceCandidate = {
  id: string;
  primaryType?: string;
};

const QUALITY_POOL_LIMIT = 15;

function takeWeighted<T>(candidates: T[], random: () => number): T | undefined {
  if (!candidates.length) return undefined;
  // Rank-based weighting keeps the strongest places more likely without
  // deterministically returning the same five for every identical search.
  const weightTotal = (candidates.length * (candidates.length + 1)) / 2;
  let target = random() * weightTotal;
  for (let index = 0; index < candidates.length; index += 1) {
    target -= candidates.length - index;
    if (target < 0) return candidates[index];
  }
  return candidates.at(-1);
}

export function variedQualitySelection<T extends PlaceCandidate>(
  qualityRankedCandidates: T[],
  resultLimit: number,
  random: () => number = Math.random,
): T[] {
  const pool = qualityRankedCandidates.slice(0, QUALITY_POOL_LIMIT);
  const selected: T[] = [];
  const typeCounts = new Map<string, number>();

  while (pool.length && selected.length < resultLimit) {
    const diversePool = pool.filter(candidate => {
      const type = candidate.primaryType ?? 'other';
      return (typeCounts.get(type) ?? 0) < 2;
    });
    const eligible = diversePool.length ? diversePool : pool;
    const chosen = takeWeighted(eligible, random);
    if (!chosen) break;
    selected.push(chosen);
    const type = chosen.primaryType ?? 'other';
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    pool.splice(
      pool.findIndex(candidate => candidate.id === chosen.id),
      1,
    );
  }

  return selected;
}
