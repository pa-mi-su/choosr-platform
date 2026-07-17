import type { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';

export async function ensureAnonymousSession(): Promise<Session> {
  const { data: existing, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (existing.session) {
    return existing.session;
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
