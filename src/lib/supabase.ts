import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import { env } from '../config/generatedEnv';
import { createTimedFetch } from '../services/requestTimeout';
import { secureAuthStorage } from '../services/secureAuthStorage';
import type { Database } from '../types/database';

const SUPABASE_HTTP_TIMEOUT_MS = 20_000;
const timedFetch = createTimedFetch(fetch, SUPABASE_HTTP_TIMEOUT_MS);

export const supabase = createClient<Database>(
  env.supabaseUrl,
  env.supabasePublishableKey,
  {
    auth: {
      ...(Platform.OS !== 'web' ? { storage: secureAuthStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
    global: { fetch: timedFetch },
  },
);

export function registerAuthAutoRefresh(): () => void {
  if (Platform.OS === 'web') {
    return () => undefined;
  }

  const subscription = AppState.addEventListener('change', state => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });

  supabase.auth.startAutoRefresh();
  return () => {
    supabase.auth.stopAutoRefresh();
    subscription.remove();
  };
}
