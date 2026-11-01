export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

function localParts(instant: number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

export function localNineAm(date: string, timezone: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const intended = Date.UTC(year!, month! - 1, day!, 9);
  let instant = intended;
  for (let index = 0; index < 4; index++) {
    const part = localParts(instant, timezone);
    const shown = Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute);
    const delta = intended - shown;
    if (delta === 0) return instant;
    instant += delta;
  }
  throw new Error('Reminder time is unavailable in this timezone.');
}
