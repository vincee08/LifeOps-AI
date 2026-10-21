import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { readSupabaseConfig } from '@/lib/environment';
import { nativeSessionStorage } from '@/lib/supabase-session-storage';

type Client = ReturnType<typeof createClient>;

let client: Client | undefined;

export function getSupabaseClient(): Client {
  if (client) return client;

  const { url, publishableKey } = readSupabaseConfig();
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

  client = createClient(url, publishableKey, {
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
