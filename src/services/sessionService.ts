import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import type {
  DecisionItem,
  DecisionMode,
  SwipeDirection,
} from '../types/domain';
import type { Json, SessionStatus } from '../types/database';
import type { Database } from '../types/database';
import { ensureAnonymousSession } from './anonymousAuth';
import { parseDecisionItem } from './decisionItemParser';

export type RoomCredentials = {
  sessionId: string;
  accessCode: string;
  inviteToken: string;
  expiresAt: string;
};

export type DecisionRoom = {
  sessionId: string;
  accessCode: string;
  mode: DecisionMode;
  status: SessionStatus;
  roundNumber: number;
  expiresAt: string;
  participantCount: number;
};

export type RoomOutcome = {
  status: SessionStatus;
  roundNumber: number;
  matchedItemId: string | null;
};

export type RoomHistoryItem = DecisionRoom & {
  createdAt: string;
  totalChoices: number;
  completedChoices: number;
  matchedItemId: string | null;
};

export type RoomSubscriptionTable = 'sessions' | 'participants' | 'matches';
export type DecisionSubmissionOutcome =
  Database['public']['Functions']['submit_swipe']['Returns'][number];
export type RankingSubmissionOutcome =
  Database['public']['Functions']['submit_rankings']['Returns'][number];

const toItemPayload = (item: DecisionItem): Json => ({
  id: item.id,
  mode: item.mode,
  title: item.title,
  kicker: item.kicker,
  meta: item.meta,
  description: item.description,
  background: item.background,
  accent: item.accent,
  tags: item.tags,
  ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
  ...(item.action ? { action: item.action } : {}),
  ...(item.attribution ? { attribution: item.attribution } : {}),
});

export async function createDecisionRoom(input: {
  mode: DecisionMode;
  items: DecisionItem[];
  region?: string;
}): Promise<RoomCredentials> {
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc('create_decision_session', {
    p_mode: input.mode,
    p_items: input.items.map(toItemPayload),
    p_region: input.region ?? 'US',
  });

  if (error) {
    throw error;
  }
  const room = data[0];
  if (!room) {
    throw new Error('Supabase did not return the created room.');
  }
  return {
    sessionId: room.session_id,
    accessCode: room.access_code,
    inviteToken: room.invite_token,
    expiresAt: room.expires_at,
  };
}

export async function createLocationDecisionRoom(input: {
  mode: 'eat' | 'do';
  latitude: number;
  longitude: number;
  locationLabel: string;
  region?: string;
}): Promise<RoomCredentials> {
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc(
    'create_location_decision_session',
    {
      p_mode: input.mode,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_location_label: input.locationLabel,
      p_region: input.region ?? 'US',
    },
  );
  if (error) throw error;
  const room = data[0];
  if (!room) {
    throw new Error('Supabase did not return the created location room.');
  }
  return {
    sessionId: room.session_id,
    accessCode: room.access_code,
    inviteToken: room.invite_token,
    expiresAt: room.expires_at,
  };
}

export async function joinDecisionRoom(input: {
  accessCode?: string;
  inviteToken?: string;
}): Promise<{
  sessionId: string;
  status: SessionStatus;
  roundNumber: number;
  expiresAt: string;
}> {
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc('join_session', {
    p_access_code: input.accessCode ?? null,
    p_invite_token: input.inviteToken ?? null,
  });
  if (error) {
    throw error;
  }
  const room = data[0];
  if (!room) {
    throw new Error('Supabase did not return the joined room.');
  }
  return {
    sessionId: room.session_id,
    status: room.status,
    roundNumber: room.round_number,
    expiresAt: room.expires_at,
  };
}

export async function loadDecisionRoom(
  sessionId: string,
): Promise<DecisionRoom> {
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, access_code, mode, status, round_number, expires_at')
    .eq('id', sessionId)
    .single();
  if (sessionError) {
    throw sessionError;
  }

  const { count, error: participantError } = await supabase
    .from('participants')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  if (participantError) {
    throw participantError;
  }

  return {
    sessionId: session.id,
    accessCode: session.access_code,
    mode: session.mode,
    status: session.status,
    roundNumber: session.round_number,
    expiresAt: session.expires_at,
    participantCount: count ?? 0,
  };
}

export async function loadRoomHistory(): Promise<RoomHistoryItem[]> {
  await ensureAnonymousSession();
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select(
      'id, access_code, mode, status, round_number, expires_at, created_at',
    )
    .in('status', ['waiting', 'active'])
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;

  return Promise.all(
    sessions.map(async session => {
      const [participants, items, swipes, match] = await Promise.all([
        supabase
          .from('participants')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', session.id),
        supabase
          .from('session_items')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', session.id)
          .eq('round', session.round_number),
        supabase
          .from('swipes')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', session.id)
          .eq('round', session.round_number),
        supabase
          .from('matches')
          .select('item_id')
          .eq('session_id', session.id)
          .eq('round', session.round_number)
          .maybeSingle(),
      ]);
      const queryError =
        participants.error ?? items.error ?? swipes.error ?? match.error;
      if (queryError) throw queryError;
      return {
        sessionId: session.id,
        accessCode: session.access_code,
        mode: session.mode,
        status: session.status,
        roundNumber: session.round_number,
        expiresAt: session.expires_at,
        createdAt: session.created_at,
        participantCount: participants.count ?? 0,
        totalChoices: items.count ?? 0,
        completedChoices: swipes.count ?? 0,
        matchedItemId: match.data?.item_id ?? null,
      };
    }),
  );
}

export async function loadRoomOutcome(sessionId: string): Promise<RoomOutcome> {
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('status, round_number')
    .eq('id', sessionId)
    .single();
  if (sessionError) {
    throw sessionError;
  }

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('item_id')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (matchError) {
    throw matchError;
  }

  return {
    status: session.status,
    roundNumber: session.round_number,
    matchedItemId: match?.item_id ?? null,
  };
}

export async function loadDecisionDeck(
  sessionId: string,
  round: number,
): Promise<DecisionItem[]> {
  const { data, error } = await supabase
    .from('session_items')
    .select('item_payload')
    .eq('session_id', sessionId)
    .eq('round', round)
    .order('position');
  if (error) {
    throw error;
  }
  return data.map(row => parseDecisionItem(row.item_payload));
}

export async function submitDecision(input: {
  sessionId: string;
  round: number;
  itemId: string;
  direction: SwipeDirection;
}): Promise<DecisionSubmissionOutcome | undefined> {
  const { data, error } = await supabase.rpc('submit_swipe', {
    p_session_id: input.sessionId,
    p_round: input.round,
    p_item_id: input.itemId,
    p_direction: input.direction,
  });
  if (error) {
    throw error;
  }
  return data[0];
}

function isAmbiguousNetworkFailure(cause: unknown): boolean {
  const message =
    cause instanceof Error
      ? cause.message
      : typeof cause === 'object' && cause && 'message' in cause
      ? String(cause.message)
      : String(cause);
  return /failed to fetch|network request failed|fetch failed|load failed/i.test(
    message,
  );
}

/**
 * A mobile connection can drop after PostgreSQL commits a swipe but before the
 * RPC response reaches the device. Reconcile that ambiguous result against the
 * caller's private swipe rows so a persisted final choice moves to the waiting
 * screen instead of presenting a false submission error.
 */
export async function submitDecisionReliably(input: {
  sessionId: string;
  round: number;
  itemId: string;
  direction: SwipeDirection;
}): Promise<DecisionSubmissionOutcome | undefined> {
  try {
    return await submitDecision(input);
  } catch (cause) {
    if (!isAmbiguousNetworkFailure(cause)) {
      throw cause;
    }

    let persistedItemIds: Set<string>;
    try {
      persistedItemIds = await loadOwnSwipeItemIds(
        input.sessionId,
        input.round,
      );
    } catch {
      throw cause;
    }
    if (!persistedItemIds.has(input.itemId)) {
      throw cause;
    }

    try {
      const room = await loadRoomOutcome(input.sessionId);
      if (room.status === 'matched' && room.matchedItemId) {
        return {
          outcome: 'match',
          match_id: null,
          matched_item_id: room.matchedItemId,
        };
      }
      if (room.status === 'completed') {
        return {
          outcome: 'no-match',
          match_id: null,
          matched_item_id: null,
        };
      }
    } catch {
      // Persistence is already confirmed. Realtime and polling will reconcile
      // a terminal result even if this secondary outcome read also drops.
    }

    return {
      outcome: 'next',
      match_id: null,
      matched_item_id: null,
    };
  }
}

export async function loadOwnSwipeItemIds(
  sessionId: string,
  round: number,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('swipes')
    .select('item_id')
    .eq('session_id', sessionId)
    .eq('round', round);
  if (error) {
    throw error;
  }
  return new Set(data.map(row => row.item_id));
}

export async function loadOwnAcceptedItemIds(
  sessionId: string,
  round: number,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('swipes')
    .select('item_id')
    .eq('session_id', sessionId)
    .eq('round', round)
    .eq('direction', 'right');
  if (error) {
    throw error;
  }
  return new Set(data.map(row => row.item_id));
}

export async function loadOwnRankingSubmission(
  sessionId: string,
  round: number,
): Promise<{ submitted: boolean; itemIds: string[] }> {
  const [submission, rankings] = await Promise.all([
    supabase
      .from('ranking_submissions')
      .select('participant_id')
      .eq('session_id', sessionId)
      .eq('round', round)
      .maybeSingle(),
    supabase
      .from('choice_rankings')
      .select('item_id, rank')
      .eq('session_id', sessionId)
      .eq('round', round)
      .order('rank'),
  ]);
  const error = submission.error ?? rankings.error;
  if (error) {
    throw error;
  }
  return {
    submitted: Boolean(submission.data),
    itemIds: (rankings.data ?? []).map(row => row.item_id),
  };
}

export async function submitDecisionRankings(input: {
  sessionId: string;
  round: number;
  itemIds: string[];
}): Promise<RankingSubmissionOutcome | undefined> {
  const { data, error } = await supabase.rpc('submit_rankings', {
    p_session_id: input.sessionId,
    p_round: input.round,
    p_item_ids: input.itemIds,
  });
  if (error) {
    throw error;
  }
  return data[0];
}

export async function startDecisionRound(input: {
  sessionId: string;
  items: DecisionItem[];
}): Promise<number> {
  const { data, error } = await supabase.rpc('start_decision_round', {
    p_session_id: input.sessionId,
    p_items: input.items.map(toItemPayload),
  });
  if (error) {
    throw error;
  }
  return data;
}

export async function touchRoomPresence(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('touch_presence', {
    p_session_id: sessionId,
  });
  if (error) {
    throw error;
  }
}

export async function cancelDecisionRoom(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_session', {
    p_session_id: sessionId,
  });
  if (error) {
    throw error;
  }
}

export function subscribeToRoom(
  sessionId: string,
  tables: readonly RoomSubscriptionTable[],
  onChange: () => void,
): RealtimeChannel {
  let channel = supabase.channel(
    `room:${sessionId}:${[...tables].sort().join('-')}`,
  );

  if (tables.includes('sessions')) {
    channel = channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${sessionId}`,
      },
      onChange,
    );
  }
  if (tables.includes('participants')) {
    channel = channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'participants',
        filter: `session_id=eq.${sessionId}`,
      },
      onChange,
    );
  }
  if (tables.includes('matches')) {
    channel = channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'matches',
        filter: `session_id=eq.${sessionId}`,
      },
      onChange,
    );
  }

  return channel.subscribe();
}

export async function unsubscribeFromRoom(channel: RealtimeChannel) {
  await supabase.removeChannel(channel);
}
