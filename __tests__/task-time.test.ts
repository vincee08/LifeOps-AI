import {
  formatTaskDueAt,
  isTaskOverdue,
  parseTaskDueAt,
  taskDueInput,
} from '@/features/tasks/task-time';

describe('task deadlines', () => {
  it('allows no deadline and converts a profile-local time to an instant', () => {
    expect(parseTaskDueAt('', 'Asia/Manila')).toBeNull();
    expect(parseTaskDueAt('2026-10-30 09:00', 'Asia/Manila')).toBe('2026-10-30T01:00:00.000Z');
    expect(taskDueInput('2026-10-30T01:00:00.000Z', 'Asia/Manila')).toBe('2026-10-30 09:00');
    expect(formatTaskDueAt('2026-10-30T01:00:00.000Z', 'Asia/Manila')).toContain('9:00');
  });

  it('rejects invalid calendar dates and nonexistent DST local times', () => {
    expect(() => parseTaskDueAt('2026-02-30 09:00', 'Asia/Manila')).toThrow();
    expect(() => parseTaskDueAt('2026-03-08 02:30', 'America/New_York')).toThrow();
    expect(parseTaskDueAt('2026-11-01 01:30', 'America/New_York')).toBe('2026-11-01T05:30:00.000Z');
  });

  it('counts only uncompleted past deadlines as overdue', () => {
    const now = Date.parse('2026-10-30T09:00:00Z');
    expect(isTaskOverdue({ due_at: null, completed_at: null }, now)).toBe(false);
    expect(isTaskOverdue({ due_at: '2026-10-30T08:59:59Z', completed_at: null }, now)).toBe(true);
    expect(isTaskOverdue({ due_at: '2026-10-30T09:00:00Z', completed_at: null }, now)).toBe(false);
    expect(
      isTaskOverdue({ due_at: '2026-10-30T08:00:00Z', completed_at: '2026-10-30T08:30:00Z' }, now),
    ).toBe(false);
  });
});
