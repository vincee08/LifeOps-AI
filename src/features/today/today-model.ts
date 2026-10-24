import { profileTimezone } from '@/features/settings/profile-timezone';
import type { Task } from '@/features/tasks/tasks-service';

export { DEFAULT_TIMEZONE, profileTimezone } from '@/features/settings/profile-timezone';
export type TodaySection = 'overdue' | 'today' | 'completed';
export type TodayWindow = {
  now: string;
  start: string;
  end: string;
  timezone: string;
  date: string;
};

function localDate(instant: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function firstInstantForDate(from: number, to: number, date: string, timezone: string): number {
  let low = from;
  let high = to;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (localDate(middle, timezone) < date) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function getTodayWindow(now: number, preference: string | null | undefined): TodayWindow {
  if (!Number.isFinite(now)) throw new Error('Invalid current time.');
  const timezone = profileTimezone(preference);
  const date = localDate(now, timezone);
  const [year, month, day] = date.split('-').map(Number);
  const nextDate = new Date(Date.UTC(year!, month! - 1, day! + 1)).toISOString().slice(0, 10);
  // Search for local calendar boundaries so 23-hour and 25-hour DST days work.
  const start = firstInstantForDate(now - 48 * 3_600_000, now, date, timezone);
  const end = firstInstantForDate(now, now + 48 * 3_600_000, nextDate, timezone);
  return {
    now: new Date(now).toISOString(),
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    timezone,
    date,
  };
}

export function todaySectionForTask(
  task: Pick<Task, 'due_at' | 'completed_at'>,
  window: TodayWindow,
): TodaySection | 'upcoming' | null {
  if (task.completed_at) {
    const completedAt = Date.parse(task.completed_at);
    return completedAt >= Date.parse(window.start) && completedAt < Date.parse(window.end)
      ? 'completed'
      : null;
  }
  if (!task.due_at) return null;
  const dueAt = Date.parse(task.due_at);
  // An earlier deadline today belongs to Overdue once it passes, never twice.
  if (dueAt < Date.parse(window.now)) return 'overdue';
  if (dueAt < Date.parse(window.end)) return 'today';
  return 'upcoming';
}

const priorityOrder = { high: 0, medium: 1, low: 2 } as const;

export function orderTodayTasks(tasks: Task[], section: TodaySection): Task[] {
  return [...tasks].sort((a, b) => {
    const first =
      section === 'completed'
        ? Date.parse(b.completed_at!) - Date.parse(a.completed_at!)
        : Date.parse(a.due_at!) - Date.parse(b.due_at!);
    if (first) return first;
    if (section !== 'completed') {
      const priority = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priority) return priority;
    }
    return section === 'completed' ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id);
  });
}
