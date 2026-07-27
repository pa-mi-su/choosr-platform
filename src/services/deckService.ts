import { supabase } from '../lib/supabase';
import type { DecisionItem } from '../types/domain';
import { ensureAnonymousSession } from './anonymousAuth';
import { withRequestTimeout } from './requestTimeout';

const DECK_REQUEST_TIMEOUT_MS = 30_000;

export type SharedLocationDeckStatus = 'waiting-for-location' | 'ready';

async function throwDeckFunctionError(error: unknown): Promise<never> {
  const context =
    typeof error === 'object' && error && 'context' in error
      ? error.context
      : undefined;
  if (context instanceof Response) {
    let payload: { error?: unknown } | undefined;
    try {
      payload = (await context.clone().json()) as { error?: unknown };
    } catch {
      // Fall through to the original invocation error when no JSON body exists.
    }
    if (typeof payload?.error === 'string' && payload.error.trim()) {
      throw new Error(payload.error);
    }
  }
  throw error;
}

export async function prepareSharedLocationDeck(input: {
  sessionId: string;
  mode: 'eat' | 'do';
}): Promise<SharedLocationDeckStatus> {
  await ensureAnonymousSession();
  const { data, error } = await withRequestTimeout(
    supabase.functions.invoke<{
      mode: 'eat' | 'do';
      status: SharedLocationDeckStatus;
      items: DecisionItem[];
    }>('build-deck', { body: input }),
    DECK_REQUEST_TIMEOUT_MS,
    'Shared nearby choices search',
  );
  if (error) await throwDeckFunctionError(error);
  if (data?.status !== 'waiting-for-location' && data?.status !== 'ready') {
    throw new Error('Choosr returned an invalid room preparation status.');
  }
  return data.status;
}
