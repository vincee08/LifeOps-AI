export const DEFAULT_TIMEZONE = 'Asia/Manila';

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function profileTimezone(value: string | null | undefined): string {
  return value && isValidTimezone(value) ? value : DEFAULT_TIMEZONE;
}
