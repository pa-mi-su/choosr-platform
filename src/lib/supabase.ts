import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import { env } from '../config/generatedEnv';
import type { Database } from '../types/database';

export const supabase = createClient<Database>(
  env.supabaseUrl,
  env.supabasePublishableKey,
  {
    auth: {
      ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
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
