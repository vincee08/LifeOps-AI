import {
  getTodayWindow,
  orderTodayTasks,
  profileTimezone,
  todaySectionForTask,
} from '@/features/today/today-model';
import type { Task } from '@/features/tasks/tasks-service';

const now = Date.parse('2026-10-23T08:00:00Z'); // 16:00 in Manila
const window = getTodayWindow(now, 'Asia/Manila');
const task = (
  id: string,
  due_at: string | null,
  completed_at: string | null = null,
  priority: Task['priority'] = 'medium',
): Task => ({
  id,
  user_id: 'owner',
  client_request_id: id,
  title: id,
  description: null,
  category: 'personal',
  priority,
  due_at,
  completed_at,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
});

describe('Today task derivation', () => {
  it('uses the profile local day and a visible Manila fallback', () => {
    expect(window).toMatchObject({
      date: '2026-10-23',
      start: '2026-10-22T16:00:00.000Z',
      end: '2026-10-23T16:00:00.000Z',
      timezone: 'Asia/Manila',
    });
    expect(profileTimezone(null)).toBe('Asia/Manila');
    expect(profileTimezone('Invalid/Zone')).toBe('Asia/Manila');
    expect(getTodayWindow(now, 'Invalid/Zone').timezone).toBe('Asia/Manila');
  });

  it.each([
    ['yesterday', '2026-10-22T15:59:59Z', 'overdue'],
    ['today at midnight', '2026-10-22T16:00:00Z', 'overdue'],
    ['earlier today', '2026-10-23T07:59:59Z', 'overdue'],
    ['due now', '2026-10-23T08:00:00Z', 'today'],
    ['later today', '2026-10-23T15:59:59Z', 'today'],
    ['tomorrow at midnight', '2026-10-23T16:00:00Z', 'upcoming'],
  ] as const)('classifies %s without UTC date shortcuts', (_label, due, section) => {
    expect(todaySectionForTask(task('one', due), window)).toBe(section);
  });

  it('excludes completed tasks from active sections and excludes undated tasks', () => {
    expect(todaySectionForTask(task('one', null), window)).toBeNull();
    expect(
      todaySectionForTask(task('one', '2026-10-22T12:00:00Z', '2026-10-23T01:00:00Z'), window),
    ).toBe('completed');
    expect(
      todaySectionForTask(task('one', '2026-10-23T12:00:00Z', '2026-10-22T15:59:59Z'), window),
    ).toBeNull();
    expect(todaySectionForTask(task('one', null, '2026-10-23T15:59:59Z'), window)).toBe(
      'completed',
    );
    expect(todaySectionForTask(task('one', null, '2026-10-23T16:00:00Z'), window)).toBeNull();
  });

  it('handles leap day, month and year ends, and both DST day lengths', () => {
    expect(getTodayWindow(Date.parse('2028-02-29T12:00:00Z'), 'Asia/Manila').end).toBe(
      '2028-02-29T16:00:00.000Z',
    );
    expect(getTodayWindow(Date.parse('2026-12-31T12:00:00Z'), 'Asia/Manila').end).toBe(
      '2026-12-31T16:00:00.000Z',
    );
    expect(getTodayWindow(Date.parse('2026-04-30T12:00:00Z'), 'Asia/Manila').end).toBe(
      '2026-04-30T16:00:00.000Z',
    );
    expect(getTodayWindow(Date.parse('2026-03-08T12:00:00Z'), 'America/New_York')).toMatchObject({
      start: '2026-03-08T05:00:00.000Z',
      end: '2026-03-09T04:00:00.000Z',
    });
    expect(getTodayWindow(Date.parse('2026-11-01T12:00:00Z'), 'America/New_York')).toMatchObject({
      start: '2026-11-01T04:00:00.000Z',
      end: '2026-11-02T05:00:00.000Z',
    });
  });

  it('orders by due instant, priority, then ID; completions newest first', () => {
    const same = '2026-10-23T10:00:00Z';
    expect(
      orderTodayTasks(
        [
          task('c', same, null, 'low'),
          task('b', same, null, 'high'),
          task('a', same, null, 'high'),
          task('d', '2026-10-23T09:00:00Z'),
        ],
        'today',
      ).map((item) => item.id),
    ).toEqual(['d', 'a', 'b', 'c']);
    expect(
      orderTodayTasks(
        [task('a', null, '2026-10-23T01:00:00Z'), task('b', null, '2026-10-23T02:00:00Z')],
        'completed',
      ).map((item) => item.id),
    ).toEqual(['b', 'a']);
  });
});
