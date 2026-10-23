import type { Session } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/lib/supabase';

export const AUTH_CALLBACK_URL = 'lifeopsai://auth/callback';

export type AuthCallback =
  | { kind: 'session'; accessToken: string; refreshToken: string; recovery: boolean }
  | { kind: 'error' };

export function parseAuthCallback(rawUrl: string): AuthCallback {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'lifeopsai:' || url.hostname !== 'auth' || url.pathname !== '/callback') {
      return { kind: 'error' };
    }
    const params = new URLSearchParams(url.hash.slice(1) || url.search.slice(1));
    if (params.has('error') || params.has('error_code')) return { kind: 'error' };
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');
    if (!accessToken || !refreshToken || (type !== 'signup' && type !== 'recovery')) {
      return { kind: 'error' };
    }
    return { kind: 'session', accessToken, refreshToken, recovery: type === 'recovery' };
  } catch {
    return { kind: 'error' };
  }
}

export async function restoreSession(
  client: ReturnType<typeof getSupabaseClient>,
): Promise<Session | null> {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (message.includes('email not confirmed')) return 'Check your email to verify your account.';
  if (message.includes('password should be')) return 'Choose a stronger password.';
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'Too many attempts. Please wait and try again.';
  }
  return 'Could not complete the request. Check your connection and try again.';
}

export async function signIn(email: string, password: string) {
  const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string): Promise<'verified' | 'check-email'> {
  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data, error } = await getSupabaseClient().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: AUTH_CALLBACK_URL,
      data: { timezone: deviceTimezone || 'Asia/Manila' },
    },
  });
  if (error) throw error;
  return data.session ? 'verified' : 'check-email';
}

export async function sendPasswordReset(email: string) {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
    redirectTo: AUTH_CALLBACK_URL,
  });
  if (error) throw error;
}

export async function resendVerification(email: string) {
  const { error } = await getSupabaseClient().auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: AUTH_CALLBACK_URL },
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await getSupabaseClient().auth.updateUser({ password });
  if (error) throw error;
}
