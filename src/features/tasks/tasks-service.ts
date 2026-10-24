import { getSupabaseClient } from '@/lib/supabase';
import type { TaskCategory, TaskPriority, TaskRow } from '@/lib/database.types';
import {
  todaySectionForTask,
  type TodaySection,
  type TodayWindow,
} from '@/features/today/today-model';

export type Task = TaskRow;
export type TaskFilter = 'active' | 'overdue' | 'completed';
export type TaskDraft = {
  title: string;
  description?: string;
  category: TaskCategory;
  priority: TaskPriority;
  due_at: string | null;
};
export type TaskListOptions = {
  filter: TaskFilter;
  category: TaskCategory | 'all';
  priority: TaskPriority | 'all';
  page: number;
  now?: string;
};

const fields =
  'id,user_id,client_request_id,title,description,category,priority,due_at,completed_at,created_at,updated_at';
export const TASK_PAGE_SIZE = 30;
export const TODAY_SECTION_LIMIT = 20;
export const REMINDER_RECONCILE_LIMIT = 100;
export type ReminderTask = Pick<Task, 'id' | 'user_id' | 'title' | 'due_at' | 'completed_at'>;
const reminderFields = 'id,user_id,title,due_at,completed_at';

export type TodayTaskPage = { tasks: Task[]; total: number; hasMore: boolean };

export async function listTodayTaskSection(
  userId: string,
  section: TodaySection,
  window: TodayWindow,
): Promise<TodayTaskPage> {
  let query = getSupabaseClient()
    .from('tasks')
    .select(fields, { count: 'exact' })
    .eq('user_id', userId);
  if (section === 'completed') {
    query = query
      .gte('completed_at', window.start)
      .lt('completed_at', window.end)
      .order('completed_at', { ascending: false })
      .order('id', { ascending: false });
  } else {
    query = query.is('completed_at', null);
    query =
      section === 'overdue'
        ? query.lt('due_at', window.now)
        : query.gte('due_at', window.now).lt('due_at', window.end);
    query = query
      .order('due_at', { ascending: true })
      .order('priority', { ascending: true })
      .order('id', { ascending: true });
  }
  const { data, count, error } = await query.range(0, TODAY_SECTION_LIMIT - 1);
  if (error || typeof count !== 'number')
    throw new Error('Today tasks could not be loaded. Please try again.');
  const tasks = (data ?? []) as Task[];
  if (tasks.some((task) => todaySectionForTask(task, window) !== section))
    throw new Error('Today tasks could not be classified. Please try again.');
  return { tasks, total: count, hasMore: count > tasks.length };
}

function validateDraft(input: TaskDraft) {
  const title = input.title.trim();
  const description = input.description?.trim() || null;
  if (!title || title.length > 200) throw new Error('Title must be 1–200 characters.');
  if (description && description.length > 2000) throw new Error('Description is too long.');
  if (!['personal', 'work', 'other'].includes(input.category)) throw new Error('Invalid category.');
  if (!['low', 'medium', 'high'].includes(input.priority)) throw new Error('Invalid priority.');
  if (input.due_at !== null && !Number.isFinite(Date.parse(input.due_at)))
    throw new Error('Invalid due date.');
  return {
    title,
    description,
    category: input.category,
    priority: input.priority,
    due_at: input.due_at,
  };
}

export async function listTasks(
  userId: string,
  options: TaskListOptions,
): Promise<{ tasks: Task[]; hasMore: boolean }> {
  const offset = options.page * TASK_PAGE_SIZE;
  let query = getSupabaseClient().from('tasks').select(fields).eq('user_id', userId);
  if (options.filter === 'completed') {
    query = query
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .order('id', { ascending: false });
  } else if (options.filter === 'overdue') {
    query = query
      .is('completed_at', null)
      .lt('due_at', options.now ?? new Date().toISOString())
      .order('due_at', { ascending: true })
      .order('id', { ascending: true });
  } else {
    query = query
      .is('completed_at', null)
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('priority', { ascending: true })
      .order('id', { ascending: true });
  }
  if (options.category !== 'all') query = query.eq('category', options.category);
  if (options.priority !== 'all') query = query.eq('priority', options.priority);
  const { data, error } = await query.range(offset, offset + TASK_PAGE_SIZE);
  if (error) throw new Error('Tasks could not be loaded. Please try again.');
  const rows = (data ?? []) as Task[];
  return { tasks: rows.slice(0, TASK_PAGE_SIZE), hasMore: rows.length > TASK_PAGE_SIZE };
}

export async function getTask(userId: string, id: string): Promise<Task | null> {
  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .select(fields)
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Task could not be loaded. Please try again.');
  return data as Task | null;
}

// Keep startup reconciliation bounded. Existing OS requests are checked separately
// by ID so edits and deletions made on another device can be detected.
export async function listUpcomingReminderTasks(
  userId: string,
  now: string,
): Promise<ReminderTask[]> {
  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .select(reminderFields)
    .eq('user_id', userId)
    .is('completed_at', null)
    .gt('due_at', now)
    .lte('due_at', new Date(Date.parse(now) + 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('due_at', { ascending: true })
    .limit(REMINDER_RECONCILE_LIMIT);
  if (error) throw new Error('Upcoming task reminders could not be checked.');
  return (data ?? []) as ReminderTask[];
}

export async function getReminderTasksByIds(
  userId: string,
  ids: string[],
): Promise<ReminderTask[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .select(reminderFields)
    .eq('user_id', userId)
    .in('id', ids.slice(0, REMINDER_RECONCILE_LIMIT));
  if (error) throw new Error('Scheduled task reminders could not be checked.');
  return (data ?? []) as ReminderTask[];
}

export async function createTask(
  userId: string,
  requestId: string,
  draft: TaskDraft,
): Promise<Task> {
  const values = validateDraft(draft);
  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .insert({ user_id: userId, client_request_id: requestId, ...values })
    .select(fields)
    .single();
  if (!error && data) return data as Task;
  if (error?.code === '23505') {
    const { data: existing, error: lookupError } = await getSupabaseClient()
      .from('tasks')
      .select(fields)
      .eq('user_id', userId)
      .eq('client_request_id', requestId)
      .maybeSingle();
    if (lookupError) throw new Error('Task could not be checked. Please try again.');
    if (
      existing &&
      existing.title === values.title &&
      existing.description === values.description &&
      existing.category === values.category &&
      existing.priority === values.priority &&
      existing.due_at === values.due_at
    )
      return existing;
    throw new Error('This task request was already used with different details.');
  }
  throw new Error('Task could not be saved. Retry to check whether it was created.');
}

export async function editTask(userId: string, task: Task, draft: TaskDraft): Promise<Task> {
  const values = validateDraft(draft);
  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .update(values)
    .eq('user_id', userId)
    .eq('id', task.id)
    .eq('updated_at', task.updated_at)
    .select(fields)
    .maybeSingle();
  if (error) throw new Error('Task could not be saved. Please try again.');
  if (!data) throw new Error('Task changed elsewhere. Reload and try again.');
  return data as Task;
}

export async function setTaskCompleted(
  userId: string,
  id: string,
  complete: boolean,
): Promise<Task> {
  let query = getSupabaseClient()
    .from('tasks')
    .update({ completed_at: complete ? new Date().toISOString() : null })
    .eq('user_id', userId)
    .eq('id', id);
  query = complete ? query.is('completed_at', null) : query.not('completed_at', 'is', null);
  const { data, error } = await query.select(fields).maybeSingle();
  if (error) throw new Error('Task status could not be saved. Please try again.');
  if (data) return data as Task;
  const current = await getTask(userId, id);
  if (current && (current.completed_at !== null) === complete) return current;
  throw new Error('Task status changed elsewhere. Reload and try again.');
}

export async function deleteTask(userId: string, id: string): Promise<void> {
  const { data, error } = await getSupabaseClient()
    .from('tasks')
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error || !data) throw new Error('Task could not be deleted. Please refresh and try again.');
}
