import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { readSupabaseConfig } from '@/lib/environment';
import type { Database } from '@/lib/database.types';
import { nativeSessionStorage } from '@/lib/supabase-session-storage';

type Client = SupabaseClient<Database>;

let client: Client | undefined;

export function getSupabaseClient(): Client {
  if (client) return client;

  const { url, publishableKey } = readSupabaseConfig();
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

  client = createClient<Database>(url, publishableKey, {
    auth: {
      storage: isNative ? nativeSessionStorage : undefined,
      autoRefreshToken: isNative,
      persistSession: isNative,
      detectSessionInUrl: false,
    },
  });

  if (isNative) {
    const auth = client.auth;
    AppState.addEventListener('change', (state) => {
      if (state === 'active') auth.startAutoRefresh();
      else auth.stopAutoRefresh();
    });
    if (AppState.currentState === 'active') auth.startAutoRefresh();
    else auth.stopAutoRefresh();
  }

  return client;
}
