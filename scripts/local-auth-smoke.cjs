// Exercises the disposable local Auth service without printing credentials or session data.
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

async function findMessage(mailUrl, email, excluded = new Set()) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${mailUrl}/api/v1/messages`);
    if (!response.ok) throw new Error('Local mail capture unavailable');
    const inbox = await response.json();
    const message = inbox.messages?.find(
      (entry) => !excluded.has(entry.ID) && entry.To?.some((to) => to.Address === email),
    );
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Expected auth email was not captured');
}

async function tokensFromEmail(mailUrl, apiUrl, message) {
  const detailResponse = await fetch(`${mailUrl}/api/v1/message/${message.ID}`);
  if (!detailResponse.ok) throw new Error('Captured email could not be read');
  const detail = await detailResponse.json();
  const links = [...(detail.HTML || '').matchAll(/href=["']([^"']+)["']/g)].map((match) =>
    match[1].replaceAll('&amp;', '&'),
  );
  const verifyUrl = links.find((link) => {
    try {
      const url = new URL(link);
      return url.origin === apiUrl && url.pathname === '/auth/v1/verify';
    } catch {
      return false;
    }
  });
  if (!verifyUrl) throw new Error('Auth email has no local verification link');
  const verifyResponse = await fetch(verifyUrl, { redirect: 'manual' });
  const redirect = verifyResponse.headers.get('location');
  if (!redirect) throw new Error('Auth verification produced no redirect');
  const callback = new URL(redirect);
  if (
    callback.protocol !== 'lifeopsai:' ||
    callback.hostname !== 'auth' ||
    callback.pathname !== '/callback'
  )
    throw new Error('Auth verification redirected to the wrong app path');
  const params = new URLSearchParams(callback.hash.slice(1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type');
  if (!accessToken || !refreshToken || !['signup', 'recovery'].includes(type)) {
    throw new Error('Auth callback is missing a supported session');
  }
  return { accessToken, refreshToken, type };
}

async function main() {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const status = JSON.parse(
    execFileSync(command, ['supabase', 'status', '--output-format', 'json'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }),
  );
  if (status.identity?.project_root && !status.identity.project_root.endsWith('LifeOps-AI')) {
    throw new Error('Local stack identity does not match this repository');
  }
  const { API_URL, PUBLISHABLE_KEY, MAILPIT_URL } = status.env;
  const client = createClient(API_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const email = `lifeops-smoke-${randomBytes(8).toString('hex')}@example.test`;
  const password = randomBytes(24).toString('base64url');
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: 'lifeopsai://auth/callback', data: { timezone: 'Asia/Manila' } },
  });
  if (error || !data.user || data.session)
    throw new Error('Local sign-up confirmation state failed');
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (!signIn.error || signIn.data.session) throw new Error('Unverified account signed in');
  const confirmation = await findMessage(MAILPIT_URL, email);
  const verified = await tokensFromEmail(MAILPIT_URL, API_URL, confirmation);
  if (verified.type !== 'signup') throw new Error('Verification callback has the wrong type');
  const confirmedSession = await client.auth.setSession({
    access_token: verified.accessToken,
    refresh_token: verified.refreshToken,
  });
  if (confirmedSession.error || !confirmedSession.data.session) {
    throw new Error('Confirmed account did not receive a session');
  }
  const profile = await client.from('profiles').select('id,timezone,currency_code').single();
  if (
    profile.error ||
    profile.data?.id !== confirmedSession.data.session.user.id ||
    profile.data.timezone !== 'Asia/Manila' ||
    profile.data.currency_code !== 'PHP'
  ) {
    throw new Error('Confirmed account cannot read its profile');
  }
  const update = await client
    .from('profiles')
    .update({ display_name: 'Local tester' })
    .eq('id', profile.data.id)
    .select('display_name')
    .single();
  if (update.error || update.data?.display_name !== 'Local tester') {
    throw new Error('Confirmed account cannot update its profile');
  }
  const resetRequest = await client.auth.resetPasswordForEmail(email, {
    redirectTo: 'lifeopsai://auth/callback',
  });
  if (resetRequest.error) throw new Error('Password reset email request failed');
  const recovery = await findMessage(MAILPIT_URL, email, new Set([confirmation.ID]));
  const recoveryTokens = await tokensFromEmail(MAILPIT_URL, API_URL, recovery);
  if (recoveryTokens.type !== 'recovery') throw new Error('Recovery callback has the wrong type');
  const recoverySession = await client.auth.setSession({
    access_token: recoveryTokens.accessToken,
    refresh_token: recoveryTokens.refreshToken,
  });
  if (recoverySession.error || !recoverySession.data.session)
    throw new Error('Recovery session failed');
  const newPassword = randomBytes(24).toString('base64url');
  const updatedPassword = await client.auth.updateUser({ password: newPassword });
  if (updatedPassword.error) throw new Error('Password update failed');
  const signedOut = await client.auth.signOut();
  if (signedOut.error) throw new Error('Sign-out failed');
  const signedInAgain = await client.auth.signInWithPassword({ email, password: newPassword });
  if (signedInAgain.error || !signedInAgain.data.session)
    throw new Error('New password sign-in failed');
  process.stdout.write('Local Auth verification, profile, recovery, and sign-in: PASS\n');
}

main().catch(() => {
  process.stderr.write('Local Auth smoke test failed; check local stack and auth configuration.\n');
  process.exitCode = 1;
});
