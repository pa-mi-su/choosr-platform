import { supabase } from '../lib/supabase';
import { decisionDecks } from '../data/decisions';
import type { DecisionItem, DecisionMode } from '../types/domain';
import { ensureAnonymousSession } from './anonymousAuth';
import { withRequestTimeout } from './requestTimeout';

const DECK_REQUEST_TIMEOUT_MS = 20_000;

export type DiscoveryInput = {
  mode: DecisionMode;
  latitude?: number;
  longitude?: number;
  postalCode?: string;
  radiusMeters?: number;
  maxResults?: number;
  region?: string;
};

export function shuffleDecisionDeck(
  items: DecisionItem[],
  random: () => number = Math.random,
): DecisionItem[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

export async function fetchLiveDecisionDeck(
  input: DiscoveryInput,
): Promise<DecisionItem[]> {
  await ensureAnonymousSession();
  const { data, error } = await withRequestTimeout(
    supabase.functions.invoke<{
      mode: DecisionMode;
      items: DecisionItem[];
    }>('build-deck', { body: input }),
    DECK_REQUEST_TIMEOUT_MS,
    'Nearby choices search',
  );
  if (error) {
    throw error;
  }
  if (!data?.items.length) {
    throw new Error('The content provider returned an empty deck.');
  }
  return shuffleDecisionDeck(data.items);
}

export function getPreviewDecisionDeck(mode: DecisionMode): DecisionItem[] {
  return decisionDecks[mode];
}
