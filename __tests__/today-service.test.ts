import { listTodayTaskSection, TODAY_SECTION_LIMIT } from '@/features/tasks/tasks-service';
import { getTodayWindow } from '@/features/today/today-model';

const mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ from: mockFrom }) }));

function query(result: { data: unknown[] | null; count: number | null; error: object | null }) {
  const q = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockResolvedValue(result),
  };
  mockFrom.mockReturnValue(q);
  return q;
}

const window = getTodayWindow(Date.parse('2026-10-23T08:00:00Z'), 'Asia/Manila');

beforeEach(() => mockFrom.mockReset());

it('uses bounded owner-scoped Tasks queries and exact counts for each section', async () => {
  const q = query({ data: [], count: 42, error: null });
  for (const section of ['overdue', 'today', 'completed'] as const) {
    await expect(listTodayTaskSection('owner', section, window)).resolves.toEqual({
      tasks: [],
      total: 42,
      hasMore: true,
    });
  }
  expect(mockFrom).toHaveBeenCalledWith('tasks');
  expect(q.select).toHaveBeenCalledWith(expect.any(String), { count: 'exact' });
  expect(q.eq).toHaveBeenCalledWith('user_id', 'owner');
  expect(q.is).toHaveBeenCalledWith('completed_at', null);
  expect(q.lt).toHaveBeenCalledWith('due_at', window.now);
  expect(q.gte).toHaveBeenCalledWith('due_at', window.now);
  expect(q.lt).toHaveBeenCalledWith('due_at', window.end);
  expect(q.gte).toHaveBeenCalledWith('completed_at', window.start);
  expect(q.lt).toHaveBeenCalledWith('completed_at', window.end);
  expect(q.range).toHaveBeenCalledWith(0, TODAY_SECTION_LIMIT - 1);
});

it('fails closed when a section count or query is unavailable', async () => {
  query({ data: [], count: null, error: null });
  await expect(listTodayTaskSection('owner', 'today', window)).rejects.toThrow(
    'could not be loaded',
  );
  query({ data: null, count: null, error: { code: 'NETWORK' } });
  await expect(listTodayTaskSection('owner', 'completed', window)).rejects.toThrow(
    'could not be loaded',
  );
});

it('rejects a row that does not belong in the requested section', async () => {
  query({
    data: [{ due_at: null, completed_at: null }],
    count: 1,
    error: null,
  });
  await expect(listTodayTaskSection('owner', 'today', window)).rejects.toThrow(
    'could not be classified',
  );
});
