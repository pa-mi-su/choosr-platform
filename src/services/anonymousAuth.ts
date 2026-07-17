import type { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';

export async function ensureAnonymousSession(): Promise<Session> {
  const { data: existing, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (existing.session) {
    const { data: verified, error: userError } = await supabase.auth.getUser();
    if (!userError && verified.user) {
      return existing.session;
    }

    if (userError && userError.status !== 401 && userError.status !== 403) {
      throw userError;
    }

    // A scheduled retention job can remove an old anonymous identity while a
    // device still has its expired local token. Clear it before recreating the
    // zero-account identity.
    await supabase.auth.signOut({ scope: 'local' });
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw error;
  }
  if (!data.session) {
    throw new Error('Supabase did not return an anonymous session.');
  }

  return data.session;
}
