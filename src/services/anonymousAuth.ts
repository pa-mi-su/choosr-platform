import type { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { withRequestTimeout } from './requestTimeout';

const AUTH_TIMEOUT_MS = 8_000;
const SESSION_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1_000;

let pendingSession: Promise<Session> | undefined;
let lastVerifiedUserId: string | undefined;
let lastVerifiedAt = 0;

async function resolveAnonymousSession(): Promise<Session> {
  const { data: existing, error: sessionError } = await withRequestTimeout(
    supabase.auth.getSession(),
    AUTH_TIMEOUT_MS,
    'Supabase session lookup',
  );

  if (sessionError) {
    throw sessionError;
  }

  if (existing.session) {
    const userId = existing.session.user.id;
    const recentlyVerified =
      lastVerifiedUserId === userId &&
      Date.now() - lastVerifiedAt < SESSION_VERIFICATION_TTL_MS;
    if (recentlyVerified) {
      return existing.session;
    }

    const { data: verified, error: userError } = await withRequestTimeout(
      supabase.auth.getUser(),
      AUTH_TIMEOUT_MS,
      'Supabase user verification',
    );
    if (!userError && verified.user) {
      lastVerifiedUserId = verified.user.id;
      lastVerifiedAt = Date.now();
      return existing.session;
    }

    if (userError && userError.status !== 401 && userError.status !== 403) {
      // A locally valid session remains useful during a transient outage.
      // Protected requests still enforce the JWT server-side and will surface
      // a real authorization failure if the identity is no longer valid.
      return existing.session;
    }

    // A scheduled retention job can remove an old anonymous identity while a
    // device still has its expired local token. Clear it before recreating the
    // zero-account identity.
    await supabase.auth.signOut({ scope: 'local' });
    lastVerifiedUserId = undefined;
    lastVerifiedAt = 0;
  }

  const { data, error } = await withRequestTimeout(
    supabase.auth.signInAnonymously(),
    AUTH_TIMEOUT_MS,
    'Supabase anonymous sign-in',
  );
  if (error) {
    throw error;
  }
  if (!data.session) {
    throw new Error('Supabase did not return an anonymous session.');
  }

  lastVerifiedUserId = data.session.user.id;
  lastVerifiedAt = Date.now();
  return data.session;
}

export async function ensureAnonymousSession(): Promise<Session> {
  if (!pendingSession) {
    pendingSession = resolveAnonymousSession().finally(() => {
      pendingSession = undefined;
    });
  }
  return pendingSession;
}
