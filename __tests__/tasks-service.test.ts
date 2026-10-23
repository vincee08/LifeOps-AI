import {
  createTask,
  deleteTask,
  editTask,
  listTasks,
  setTaskCompleted,
  type Task,
} from '@/features/tasks/tasks-service';

const mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ from: mockFrom }) }));

const task: Task = {
  id: 'task-id',
  user_id: 'owner',
  client_request_id: 'request-id',
  title: 'Buy groceries',
  description: null,
  category: 'personal',
  priority: 'medium',
  due_at: null,
  completed_at: null,
  created_at: '2026-10-23T00:00:00Z',
  updated_at: '2026-10-23T00:00:00Z',
};
const draft = {
  title: ' Buy groceries ',
  description: '',
  category: 'personal' as const,
  priority: 'medium' as const,
  due_at: null,
};

function query(results: Array<{ data: unknown; error: { code?: string } | null }>) {
  const q = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn(async () => results.shift()),
    maybeSingle: jest.fn(async () => results.shift()),
    range: jest.fn(async () => results.shift()),
  };
  mockFrom.mockReturnValue(q);
  return q;
}

beforeEach(() => mockFrom.mockReset());

describe('Tasks service', () => {
  it('creates a minimum task using one owner-scoped request UUID and normalized values', async () => {
    const q = query([{ data: task, error: null }]);
    await expect(createTask('owner', 'request-id', draft)).resolves.toEqual(task);
    expect(q.insert).toHaveBeenCalledWith({
      user_id: 'owner',
      client_request_id: 'request-id',
      title: 'Buy groceries',
      description: null,
      category: 'personal',
      priority: 'medium',
      due_at: null,
    });
  });

  it('resolves a duplicate owner request only when its task has the same content', async () => {
    const q = query([
      { data: null, error: { code: '23505' } },
      { data: task, error: null },
    ]);
    await expect(createTask('owner', 'request-id', draft)).resolves.toEqual(task);
    expect(q.eq).toHaveBeenCalledWith('user_id', 'owner');
    expect(q.eq).toHaveBeenCalledWith('client_request_id', 'request-id');
    query([
      { data: null, error: { code: '23505' } },
      { data: { ...task, title: 'Different' }, error: null },
    ]);
    await expect(createTask('owner', 'request-id', draft)).rejects.toThrow('different details');
  });

  it('rejects invalid category and priority before database access', async () => {
    await expect(
      createTask('owner', 'id', { ...draft, category: 'invalid' as 'personal' }),
    ).rejects.toThrow();
    await expect(
      createTask('owner', 'id', { ...draft, priority: 'urgent' as 'high' }),
    ).rejects.toThrow();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('edits with an optimistic timestamp and reports stale changes', async () => {
    const q = query([{ data: { ...task, title: 'Edited' }, error: null }]);
    await editTask('owner', task, { ...draft, title: 'Edited' });
    expect(q.eq).toHaveBeenCalledWith('updated_at', task.updated_at);
    query([{ data: null, error: null }]);
    await expect(editTask('owner', task, draft)).rejects.toThrow('changed elsewhere');
  });

  it('completes once, then reopens using conditional writes', async () => {
    const complete = { ...task, completed_at: '2026-10-23T01:00:00Z' };
    const q = query([
      { data: complete, error: null },
      { data: task, error: null },
    ]);
    await expect(setTaskCompleted('owner', 'task-id', true)).resolves.toEqual(complete);
    expect(q.is).toHaveBeenCalledWith('completed_at', null);
    await expect(setTaskCompleted('owner', 'task-id', false)).resolves.toEqual(task);
    expect(q.not).toHaveBeenCalledWith('completed_at', 'is', null);
  });

  it('does not claim success after mutation failure', async () => {
    query([{ data: null, error: { code: 'NETWORK' } }]);
    await expect(setTaskCompleted('owner', 'task-id', true)).rejects.toThrow('could not be saved');
    query([{ data: null, error: { code: 'NETWORK' } }]);
    await expect(deleteTask('owner', 'task-id')).rejects.toThrow('could not be deleted');
  });

  it('queries bounded owner-scoped active, overdue, and completed views', async () => {
    const q = query([
      { data: [task], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]);
    await listTasks('owner', { filter: 'active', category: 'work', priority: 'high', page: 0 });
    expect(q.eq).toHaveBeenCalledWith('user_id', 'owner');
    expect(q.eq).toHaveBeenCalledWith('category', 'work');
    expect(q.eq).toHaveBeenCalledWith('priority', 'high');
    expect(q.range).toHaveBeenCalledWith(0, 30);
    await listTasks('owner', {
      filter: 'overdue',
      category: 'all',
      priority: 'all',
      page: 1,
      now: '2026-10-23T00:00:00Z',
    });
    expect(q.lt).toHaveBeenCalledWith('due_at', '2026-10-23T00:00:00Z');
    expect(q.range).toHaveBeenCalledWith(30, 60);
    await listTasks('owner', { filter: 'completed', category: 'all', priority: 'all', page: 0 });
    expect(q.not).toHaveBeenCalledWith('completed_at', 'is', null);
  });
});
