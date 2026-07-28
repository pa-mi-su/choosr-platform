import { supabase } from '../lib/supabase';
import type { DecisionMode } from '../types/domain';
import { ensureAnonymousSession } from './anonymousAuth';
import { dispatchPendingNotifications } from './pushNotifications';
import { readOfflineSnapshot, writeOfflineSnapshot } from './offlineSnapshot';
import { profilePhotoUrl } from './profilePhotoService';
import { photoFailureMessage } from './photoUploadService';
import { withSupabaseReadRetry } from './requestTimeout';
import { serviceFailureMessage } from './serviceError';

const CIRCLE_REQUEST_TIMEOUT_MS = 7_000;
const CIRCLE_CACHE_KEY = '@choosr/circle/v1';
const CIRCLE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export type ChoosrProfile = {
  userId: string;
  displayName: string;
  handle: string;
  avatarPath: string | null;
  photoUrl: string | null;
};

export type CirclePerson = {
  connectionId: string;
  personUserId: string;
  displayName: string;
  handle: string;
  avatarPath: string | null;
  photoUrl: string | null;
  status: 'pending' | 'accepted' | 'declined';
  direction: 'incoming' | 'outgoing';
};

export type PendingRoomInvitation = {
  invitationId: string;
  sessionId: string;
  senderDisplayName: string;
  senderHandle: string;
  mode: DecisionMode;
  expiresAt: string;
};

export type CircleSnapshot = {
  profile: ChoosrProfile | null;
  people: CirclePerson[];
  invitations: PendingRoomInvitation[];
};
type StoredCircleSnapshot = {
  userId: string;
  snapshot: CircleSnapshot;
};

export async function readCachedCircleSnapshot(): Promise<CircleSnapshot | null> {
  const [{ data }, stored] = await Promise.all([
    supabase.auth.getSession(),
    readOfflineSnapshot<StoredCircleSnapshot>(
      CIRCLE_CACHE_KEY,
      CIRCLE_CACHE_MAX_AGE_MS,
    ),
  ]);
  if (!stored || stored.userId !== data.session?.user.id) return null;
  const now = Date.now();
  return {
    ...stored.snapshot,
    invitations: stored.snapshot.invitations.filter(
      invitation => Date.parse(invitation.expiresAt) > now,
    ),
  };
}

async function updateCachedRoomInvitations(
  userId: string,
  update: (current: PendingRoomInvitation[]) => PendingRoomInvitation[],
): Promise<void> {
  const stored = await readOfflineSnapshot<StoredCircleSnapshot>(
    CIRCLE_CACHE_KEY,
    CIRCLE_CACHE_MAX_AGE_MS,
  );
  if (!stored || stored.userId !== userId) return;
  await writeOfflineSnapshot<StoredCircleSnapshot>(CIRCLE_CACHE_KEY, {
    ...stored,
    snapshot: {
      ...stored.snapshot,
      invitations: update(stored.snapshot.invitations),
    },
  });
}

export async function loadCircleSnapshot(): Promise<CircleSnapshot> {
  const authenticatedSession = await ensureAnonymousSession();
  const profile = await loadOwnProfile();
  const [people, invitations] = profile
    ? await Promise.all([loadCircle(), loadPendingRoomInvitations()])
    : [[], []];
  const snapshot = { profile, people, invitations };
  await writeOfflineSnapshot<StoredCircleSnapshot>(CIRCLE_CACHE_KEY, {
    userId: authenticatedSession.user.id,
    snapshot,
  });
  return snapshot;
}

export async function loadOwnProfile(): Promise<ChoosrProfile | null> {
  await ensureAnonymousSession();
  const { data, error } = await withSupabaseReadRetry(
    signal => supabase.rpc('get_choosr_profile').abortSignal(signal),
    {
      timeoutMilliseconds: CIRCLE_REQUEST_TIMEOUT_MS,
      operation: 'Circle profile lookup',
      backoffMilliseconds: 250,
    },
  );
  if (error) {
    throw error;
  }
  const profile = data[0];
  return profile
    ? {
        userId: profile.user_id,
        displayName: profile.display_name,
        handle: profile.handle,
        avatarPath: profile.avatar_path,
        photoUrl: profilePhotoUrl(profile.avatar_path),
      }
    : null;
}

export async function saveOwnProfile(input: {
  displayName: string;
  handle: string;
}): Promise<ChoosrProfile> {
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc('upsert_choosr_profile', {
    p_display_name: input.displayName,
    p_handle: normalizeHandle(input.handle),
  });
  if (error) {
    throw error;
  }
  const profile = data[0];
  if (!profile) {
    throw new Error('Profile was not returned.');
  }
  return {
    userId: profile.user_id,
    displayName: profile.display_name,
    handle: profile.handle,
    avatarPath: null,
    photoUrl: null,
  };
}

export async function loadCircle(): Promise<CirclePerson[]> {
  await ensureAnonymousSession();
  const { data, error } = await withSupabaseReadRetry(
    signal => supabase.rpc('list_circle').abortSignal(signal),
    {
      timeoutMilliseconds: CIRCLE_REQUEST_TIMEOUT_MS,
      operation: 'Circle lookup',
      backoffMilliseconds: 250,
    },
  );
  if (error) {
    throw error;
  }
  return data.map(person => ({
    connectionId: person.connection_id,
    personUserId: person.person_user_id,
    displayName: person.display_name,
    handle: person.handle,
    avatarPath: person.avatar_path,
    photoUrl: profilePhotoUrl(person.avatar_path),
    status: person.status,
    direction: person.direction,
  }));
}

export async function requestConnection(handle: string): Promise<void> {
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc('send_connection_request', {
    p_handle: normalizeHandle(handle),
  });
  if (error) {
    throw error;
  }
  if (!data) throw new Error('connection_request_unavailable');
  await dispatchPendingNotifications();
}

export async function answerConnection(
  connectionId: string,
  accept: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('respond_connection', {
    p_connection_id: connectionId,
    p_accept: accept,
  });
  if (error) {
    throw error;
  }
}

export async function removeCircleConnection(
  connectionId: string,
): Promise<void> {
  await ensureAnonymousSession();
  const { error } = await supabase.rpc('remove_circle_connection', {
    p_connection_id: connectionId,
  });
  if (error) throw error;
}

export async function reportCircleUser(
  userId: string,
  reason: 'spam' | 'harassment' | 'unsafe_content' | 'impersonation' | 'other',
): Promise<void> {
  await ensureAnonymousSession();
  const { error } = await supabase.rpc('report_user', {
    p_reported_user_id: userId,
    p_reason: reason,
    p_details: null,
  });
  if (error) throw error;
}

export async function createCircleInvite(): Promise<{
  inviteToken: string;
  expiresAt: string;
}> {
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc('create_circle_invite');
  if (error) {
    throw error;
  }
  const invite = data[0];
  if (!invite) {
    throw new Error('Circle invitation was not returned.');
  }
  return {
    inviteToken: invite.invite_token,
    expiresAt: invite.expires_at,
  };
}

export async function redeemCircleInvite(inviteToken: string): Promise<void> {
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc('redeem_circle_invite', {
    p_invite_token: inviteToken,
  });
  if (error) {
    throw error;
  }
  if (!data) throw new Error('circle_invite_unavailable');
}

export async function inviteCirclePerson(
  sessionId: string,
  connectionId: string,
): Promise<void> {
  const { error } = await supabase.rpc('invite_connection_to_session', {
    p_session_id: sessionId,
    p_connection_id: connectionId,
  });
  if (error) {
    throw error;
  }
  await dispatchPendingNotifications();
}

export async function loadPendingRoomInvitations(): Promise<
  PendingRoomInvitation[]
> {
  const authenticatedSession = await ensureAnonymousSession();
  const { data, error } = await withSupabaseReadRetry(
    signal => supabase.rpc('list_pending_room_invitations').abortSignal(signal),
    {
      timeoutMilliseconds: CIRCLE_REQUEST_TIMEOUT_MS,
      operation: 'Room invitation lookup',
      backoffMilliseconds: 250,
    },
  );
  if (error) {
    throw error;
  }
  const invitations = data.map(invitation => ({
    invitationId: invitation.invitation_id,
    sessionId: invitation.session_id,
    senderDisplayName: invitation.sender_display_name,
    senderHandle: invitation.sender_handle,
    mode: invitation.mode,
    expiresAt: invitation.expires_at,
  }));
  await updateCachedRoomInvitations(
    authenticatedSession.user.id,
    () => invitations,
  );
  return invitations;
}

export async function answerRoomInvitation(
  invitationId: string,
  accept: boolean,
): Promise<{
  sessionId: string;
  roundNumber: number;
  mode?: DecisionMode;
} | null> {
  const { data, error } = await supabase.rpc('respond_room_invitation', {
    p_invitation_id: invitationId,
    p_accept: accept,
  });
  if (error) {
    throw error;
  }
  const { data: authData } = await supabase.auth.getSession();
  if (authData.session?.user.id) {
    await updateCachedRoomInvitations(authData.session.user.id, current =>
      current.filter(invitation => invitation.invitationId !== invitationId),
    );
  }
  const room = data[0];
  return room
    ? { sessionId: room.session_id, roundNumber: room.round_number }
    : null;
}

export async function dismissRoomInvitation(
  invitationId: string,
): Promise<void> {
  const authenticatedSession = await ensureAnonymousSession();
  try {
    const { error } = await supabase.rpc('respond_room_invitation', {
      p_invitation_id: invitationId,
      p_accept: false,
    });
    if (error && !error.message.includes('invitation_unavailable')) {
      throw error;
    }
  } finally {
    await updateCachedRoomInvitations(authenticatedSession.user.id, current =>
      current.filter(invitation => invitation.invitationId !== invitationId),
    );
  }
}

export function normalizeHandle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
}

export function circleErrorMessage(error: unknown): string {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : '';
  if (message.includes('handle_taken')) return 'That handle is already taken.';
  if (message.includes('profile_not_found'))
    return 'No Choosr user has that handle.';
  if (message.includes('connection_already_exists'))
    return 'That person is already in your Circle.';
  if (message.includes('connection_unavailable'))
    return 'That Circle connection is no longer available.';
  if (message.includes('connection_request_unavailable'))
    return 'That person could not be added. Check the Choosr name and try again later.';
  if (message.includes('cannot_connect_to_self'))
    return 'Choose somebody other than yourself.';
  if (message.includes('circle_invite_expired'))
    return 'That Circle invitation has expired.';
  if (message.includes('circle_invite_used'))
    return 'That Circle invitation was already used.';
  if (message.includes('circle_invite_not_found'))
    return 'That Circle invitation is not valid.';
  if (message.includes('circle_invite_unavailable'))
    return 'That Circle invitation is no longer available.';
  if (message.includes('room_') || message.includes('invitation_'))
    return 'That invitation is no longer available.';
  if (message.includes('photo_')) return photoFailureMessage(error, 5);
  return serviceFailureMessage(
    error,
    'Choosr could not complete that action. Please try again.',
  );
}
