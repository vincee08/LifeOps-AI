export type AppEnvironment = 'development' | 'staging' | 'production';

export function parseAppEnvironment(value: string | undefined): AppEnvironment {
  if (value === undefined || value === 'development') return 'development';
  if (value === 'staging' || value === 'production') return value;
  throw new Error('EXPO_PUBLIC_APP_ENV must be development, staging, or production');
}

export const appEnvironment = parseAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV);
