export const MAX_CARD_DWELL_MS = 30_000;

export function cappedCardDwellMs(milliseconds: number): number {
  if (!Number.isFinite(milliseconds)) {
    return 0;
  }
  return Math.min(MAX_CARD_DWELL_MS, Math.max(0, Math.round(milliseconds)));
}
