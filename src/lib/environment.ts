export type AppEnvironment = 'development' | 'staging' | 'production';

export function parseAppEnvironment(value: string | undefined): AppEnvironment {
  if (value === undefined || value === 'development') return 'development';
  if (value === 'staging' || value === 'production') return value;
  throw new Error('EXPO_PUBLIC_APP_ENV must be development, staging, or production');
}

export const appEnvironment = parseAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV);

export type SupabaseConfig = {
  url: string;
  publishableKey: string;
};

export function validateSupabaseConfig(
  rawUrl: string | undefined,
  rawPublishableKey: string | undefined,
  environment: AppEnvironment = appEnvironment,
): SupabaseConfig {
  if (!rawUrl?.trim()) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is required');
  }
  if (!rawPublishableKey?.trim()) {
    throw new Error('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required');
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must be a valid project URL');
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    (environment !== 'development' && url.protocol !== 'https:') ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must be a valid project URL');
  }

  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(rawPublishableKey)) {
    throw new Error('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable key');
  }

  return { url: url.origin, publishableKey: rawPublishableKey };
}

export function readSupabaseConfig(): SupabaseConfig {
  return validateSupabaseConfig(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
