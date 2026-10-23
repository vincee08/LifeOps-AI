const wallFormatters = new Map<string, Intl.DateTimeFormat>();

function wallParts(instant: number, timezone: string) {
  let formatter = wallFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    wallFormatters.set(timezone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function parseTaskDueAt(input: string, timezone: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Use YYYY-MM-DD HH:mm for the due date.');
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  )
    throw new Error('Invalid due date.');
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const date = new Date(wall);
  if (
    year < 1900 ||
    year > 2100 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute
  )
    throw new Error('Enter a valid due date and time.');

  // Test offsets around the target day. This handles normal offset changes and
  // chooses the earlier instant when the local clock repeats during DST.
  const offsets = new Set<number>();
  for (const shift of [-36, -12, 0, 12, 36]) {
    const sample = wall + shift * 60 * 60 * 1000;
    const parts = wallParts(sample, timezone);
    offsets.add(
      Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - sample,
    );
  }
  const matches = [...offsets]
    .map((offset) => wall - offset)
    .filter((instant) => {
      const parts = wallParts(instant, timezone);
      return (
        parts.year === year &&
        parts.month === month &&
        parts.day === day &&
        parts.hour === hour &&
        parts.minute === minute
      );
    })
    .sort((a, b) => a - b);
  if (matches.length === 0) throw new Error('That local time does not exist in your timezone.');
  return new Date(matches[0]!).toISOString();
}

export function formatTaskDueAt(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function taskDueInput(value: string | null, timezone: string): string {
  if (!value) return '';
  const parts = wallParts(Date.parse(value), timezone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function isTaskOverdue(
  task: { completed_at: string | null; due_at: string | null },
  now: number,
): boolean {
  return task.completed_at === null && task.due_at !== null && Date.parse(task.due_at) < now;
}
