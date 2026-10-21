import { parseAppEnvironment, validateSupabaseConfig } from '@/lib/environment';

const publishableKey = 'sb_publishable_example';

describe('public environment configuration', () => {
  it('defaults to development and rejects unknown app environments', () => {
    expect(parseAppEnvironment(undefined)).toBe('development');
    expect(() => parseAppEnvironment('prod')).toThrow('EXPO_PUBLIC_APP_ENV');
  });

  it('accepts a publishable key and an HTTPS project URL', () => {
    expect(
      validateSupabaseConfig('https://example.supabase.co', publishableKey, 'production'),
    ).toEqual({ url: 'https://example.supabase.co', publishableKey });
  });

  it('allows an HTTP local stack only in development', () => {
    expect(validateSupabaseConfig('http://127.0.0.1:54321', publishableKey, 'development')).toEqual(
      {
        url: 'http://127.0.0.1:54321',
        publishableKey,
      },
    );
    expect(() =>
      validateSupabaseConfig('http://127.0.0.1:54321', publishableKey, 'production'),
    ).toThrow('EXPO_PUBLIC_SUPABASE_URL');
  });

  it('reports missing or malformed values without including their contents', () => {
    expect(() => validateSupabaseConfig(undefined, publishableKey)).toThrow(
      'EXPO_PUBLIC_SUPABASE_URL is required',
    );
    expect(() => validateSupabaseConfig('https://example.supabase.co', undefined)).toThrow(
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required',
    );
    expect(() =>
      validateSupabaseConfig('https://example.supabase.co/path', publishableKey),
    ).toThrow('EXPO_PUBLIC_SUPABASE_URL must be a valid project URL');
    expect(() => validateSupabaseConfig('https://example.supabase.co', 'sb_secret_')).toThrow(
      new Error('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable key'),
    );
  });
});
