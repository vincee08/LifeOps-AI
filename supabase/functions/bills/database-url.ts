const ROLE = 'lifeops_bill_commands';

export function restrictedDatabaseUrl(
  explicit: string | undefined,
  inherited: string | undefined,
  password: string | undefined,
  supabaseUrl: string | undefined,
): string | null {
  try {
    const url = new URL(explicit ?? inherited ?? '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) return null;
    if (explicit) {
      const projectRef = new URL(supabaseUrl ?? '').hostname.match(
        /^([a-z0-9]+)\.supabase\.co$/,
      )?.[1];
      if (
        !projectRef ||
        url.username !== `${ROLE}.${projectRef}` ||
        !url.hostname.endsWith('.pooler.supabase.com') ||
        url.port !== '6543'
      )
        return null;
    } else {
      if (!password) return null;
      url.username = ROLE;
      url.password = password;
    }
    return url.toString();
  } catch {
    return null;
  }
}
