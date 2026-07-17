import { supabase } from '../lib/supabase';
import { decisionDecks } from '../data/decisions';
import type { DecisionItem, DecisionMode } from '../types/domain';
import { ensureAnonymousSession } from './anonymousAuth';

export type DiscoveryInput = {
  mode: DecisionMode;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  region?: string;
};

export async function fetchLiveDecisionDeck(
  input: DiscoveryInput,
): Promise<DecisionItem[]> {
  await ensureAnonymousSession();
  const { data, error } = await supabase.functions.invoke<{
    mode: DecisionMode;
    items: DecisionItem[];
  }>('build-deck', { body: input });
  if (error) {
    throw error;
  }
  if (!data?.items.length) {
    throw new Error('The content provider returned an empty deck.');
  }
  return data.items;
}

export function getPreviewDecisionDeck(mode: DecisionMode): DecisionItem[] {
  return decisionDecks[mode];
}
