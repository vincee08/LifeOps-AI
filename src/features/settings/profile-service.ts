import { getSupabaseClient } from '@/lib/supabase';
import type { ProfileRow } from '@/lib/database.types';
import { isValidTimezone } from '@/features/settings/profile-timezone';

export { isValidTimezone } from '@/features/settings/profile-timezone';

export type Profile = ProfileRow;

const fields = 'id,display_name,timezone,currency_code,created_at,updated_at';

export async function loadProfile(userId: string): Promise<Profile> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select(fields)
    .eq('id', userId)
    .single();
  if (error || !data) throw new Error('Profile could not be loaded. Please try again.');
  return data as Profile;
}

export async function updateProfile(
  userId: string,
  displayName: string,
  timezone: string,
): Promise<Profile> {
  const name = displayName.trim();
  const zone = timezone.trim();
  if (name.length > 80 || !isValidTimezone(zone)) throw new Error('Check the name and timezone.');
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .update({ display_name: name || null, timezone: zone })
    .eq('id', userId)
    .select(fields)
    .single();
  if (error || !data) throw new Error('Profile could not be saved. Please try again.');
  return data as Profile;
}
