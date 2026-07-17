import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import type {
  DecisionItem,
  DecisionMode,
  SwipeDirection,
} from '../types/domain';
import type { Json, SessionStatus } from '../types/database';
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
  ...(item.action ? { action: item.action } : {}),
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
}) {
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
  onChange: () => void,
): RealtimeChannel {
  return supabase
    .channel(`room:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${sessionId}`,
      },
      onChange,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'participants',
        filter: `session_id=eq.${sessionId}`,
      },
      onChange,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'matches',
        filter: `session_id=eq.${sessionId}`,
      },
      onChange,
    )
    .subscribe();
}

export async function unsubscribeFromRoom(channel: RealtimeChannel) {
  await supabase.removeChannel(channel);
}
