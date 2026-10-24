import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import appConfig from '../app.json';

import {
  cancelTaskReminders,
  reconcileTaskReminders,
  reconcileUpcomingTaskReminders,
  reminderWarning,
  requestNotificationPermission,
  setTaskRemindersEnabled,
  taskIdFromNotification,
  taskReminderSlots,
} from '@/features/tasks/task-notifications';
import {
  createTaskWithReminders,
  deleteTaskWithReminders,
  editTaskWithReminders,
  setTaskCompletedWithReminders,
} from '@/features/tasks/task-reminder-commands';
import { openTaskNotification } from '@/features/tasks/TaskNotificationLifecycle';

const mockCreate = jest.fn();
const mockEdit = jest.fn();
const mockComplete = jest.fn();
const mockDelete = jest.fn();
const mockGet = jest.fn();
const mockReminderByIds = jest.fn();
const mockUpcoming = jest.fn();
jest.mock('@/features/tasks/tasks-service', () => ({
  createTask: (...args: unknown[]) => mockCreate(...args),
  editTask: (...args: unknown[]) => mockEdit(...args),
  setTaskCompleted: (...args: unknown[]) => mockComplete(...args),
  deleteTask: (...args: unknown[]) => mockDelete(...args),
  getTask: (...args: unknown[]) => mockGet(...args),
  getReminderTasksByIds: (...args: unknown[]) => mockReminderByIds(...args),
  listUpcomingReminderTasks: (...args: unknown[]) => mockUpcoming(...args),
  REMINDER_RECONCILE_LIMIT: 100,
}));

const pending: Array<{
  identifier: string;
  content: { title?: string; body?: string; sound?: string; data?: Record<string, unknown> };
  trigger: unknown;
}> = [];
const mockPermission = jest.fn();
const mockRequestPermission = jest.fn();
const mockChannel = jest.fn(
  async (_id: string, _options: { name: string; importance: number }) => undefined,
);
const mockSchedule = jest.fn(
  async (request: {
    identifier: string;
    content: { title?: string; body?: string; sound?: string; data?: Record<string, unknown> };
    trigger: unknown;
  }) => {
    pending.push(request);
    return request.identifier;
  },
);
const mockCancel = jest.fn(async (id: string) => {
  const index = pending.findIndex((request) => request.identifier === id);
  if (index >= 0) pending.splice(index, 1);
});
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 5 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  DEFAULT_ACTION_IDENTIFIER: 'default',
  getPermissionsAsync: () => mockPermission(),
  requestPermissionsAsync: () => mockRequestPermission(),
  getAllScheduledNotificationsAsync: jest.fn(async () => [...pending]),
  scheduleNotificationAsync: (request: Parameters<typeof mockSchedule>[0]) => mockSchedule(request),
  cancelScheduledNotificationAsync: (id: string) => mockCancel(id),
  setNotificationChannelAsync: (id: string, options: { name: string; importance: number }) =>
    mockChannel(id, options),
  setNotificationHandler: jest.fn(),
}));

const now = Date.parse('2026-10-24T08:00:00Z');
const task = {
  id: 'task-1',
  user_id: 'owner',
  title: 'Submit project',
  description: 'Private details',
  due_at: new Date(now + 2 * 60 * 60_000).toISOString(),
  completed_at: null,
  client_request_id: 'request',
  category: 'work',
  priority: 'high',
  created_at: new Date(now).toISOString(),
  updated_at: new Date(now).toISOString(),
} as const;
const dueIn = (minutes: number) => ({
  ...task,
  due_at: new Date(now + minutes * 60_000).toISOString(),
});

beforeEach(async () => {
  jest.clearAllMocks();
  pending.length = 0;
  await AsyncStorage.clear();
  jest.spyOn(Date, 'now').mockReturnValue(now);
  mockPermission.mockResolvedValue({ granted: true, status: 'granted', canAskAgain: true });
  mockReminderByIds.mockResolvedValue([]);
  mockUpcoming.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

it.each([
  [120, [60, 30, 5]],
  [45, [30, 5]],
  [20, [5]],
  [4, []],
])('schedules only future offsets when due in %i minutes', async (minutes, offsets) => {
  const current = dueIn(minutes);
  expect(taskReminderSlots(current, now).map((slot) => slot.offset)).toEqual(offsets);
  const result = await reconcileTaskReminders(current);
  expect(result.count).toBe(offsets.length);
  expect(pending.map((request) => request.content.data?.offset)).toEqual(offsets);
  expect(
    pending.every(
      (request) => request.trigger && (request.trigger as { type: string }).type === 'date',
    ),
  ).toBe(true);
  expect(
    pending.every(
      (request) =>
        request.content.title === 'Submit project' &&
        !JSON.stringify(request).includes('Private details'),
    ),
  ).toBe(true);
});

it('does not schedule an undated task', async () => {
  expect(await reconcileTaskReminders({ ...task, due_at: null })).toEqual({
    status: 'none',
    count: 0,
  });
  expect(mockSchedule).not.toHaveBeenCalled();
});

it('does not configure a bundled custom sound in the Expo plugin', () => {
  const plugin = appConfig.expo.plugins.find(
    (entry) => Array.isArray(entry) && entry[0] === 'expo-notifications',
  );
  expect(plugin).toEqual(['expo-notifications', { enableRemoteNotifications: false }]);
});

it('creates the Android channel before requesting notification permission', async () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  try {
    mockPermission.mockResolvedValue({ granted: false, status: 'undetermined', canAskAgain: true });
    mockRequestPermission.mockResolvedValue({ granted: true, status: 'granted' });
    expect(await requestNotificationPermission()).toBe('granted');
    expect(mockChannel).toHaveBeenCalledTimes(1);
    expect(mockChannel).toHaveBeenCalledWith('task-reminders-v2', {
      name: 'Task Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    expect(mockChannel.mock.invocationCallOrder[0]).toBeLessThan(
      mockRequestPermission.mock.invocationCallOrder[0]!,
    );
  } finally {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  }
});

it('uses the system-sound Android channel and omits a custom sound in reminder content', async () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  try {
    await reconcileTaskReminders(task);
    expect(pending.map((request) => request.content.data?.offset)).toEqual([60, 30, 5]);
    expect(mockChannel).toHaveBeenCalledWith('task-reminders-v2', {
      name: 'Task Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    expect(
      pending.every(
        (request) =>
          !('sound' in request.content) &&
          (request.trigger as { channelId: string }).channelId === 'task-reminders-v2' &&
          request.content.data?.channelId === 'task-reminders-v2',
      ),
    ).toBe(true);
  } finally {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  }
});

it('keeps the normal notification sound for iOS content', async () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  try {
    await reconcileTaskReminders(task);
    expect(pending).toHaveLength(3);
    expect(pending.every((request) => request.content.sound === 'default')).toBe(true);
    expect(mockChannel).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  }
});

it('migrates pending Android reminders from the old channel without duplicates', async () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  try {
    await reconcileTaskReminders(task);
    for (const request of pending) {
      request.trigger = { ...(request.trigger as object), channelId: 'task-reminders' };
      delete request.content.data?.channelId;
    }
    mockReminderByIds.mockResolvedValueOnce([task]);
    mockUpcoming.mockResolvedValueOnce([task]);
    await reconcileUpcomingTaskReminders('owner');
    expect(mockCancel).toHaveBeenCalledTimes(3);
    expect(mockSchedule).toHaveBeenCalledTimes(6);
    expect(pending).toHaveLength(3);
    expect(
      pending.every((request) => request.content.data?.channelId === 'task-reminders-v2'),
    ).toBe(true);
    mockReminderByIds.mockResolvedValueOnce([task]);
    mockUpcoming.mockResolvedValueOnce([task]);
    await reconcileUpcomingTaskReminders('owner');
    expect(mockSchedule).toHaveBeenCalledTimes(6);
    expect(pending).toHaveLength(3);
  } finally {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  }
});

it('replaces old deadline/title requests and does not duplicate on retry', async () => {
  await reconcileTaskReminders(task);
  await reconcileTaskReminders(task);
  expect(pending).toHaveLength(3);
  expect(mockSchedule).toHaveBeenCalledTimes(3);
  const changed = {
    ...task,
    title: 'Send report',
    due_at: new Date(now + 45 * 60_000).toISOString(),
  };
  mockEdit.mockResolvedValue(changed);
  const result = await editTaskWithReminders('owner', task, {
    title: changed.title,
    category: 'work',
    priority: 'high',
    due_at: changed.due_at,
  });
  expect(result.reminder.count).toBe(2);
  expect(pending).toHaveLength(2);
  expect(
    pending.every(
      (request) =>
        request.content.title === 'Send report' && request.content.data?.dueAt === changed.due_at,
    ),
  ).toBe(true);
});

it('cancels on completion, restores valid slots on reopen, and cancels on deletion', async () => {
  const current = dueIn(45);
  await reconcileTaskReminders(current);
  mockComplete
    .mockResolvedValueOnce({ ...current, completed_at: new Date(now).toISOString() })
    .mockResolvedValueOnce(current);
  await setTaskCompletedWithReminders('owner', task.id, true);
  expect(pending).toHaveLength(0);
  await setTaskCompletedWithReminders('owner', task.id, false);
  expect(pending.map((request) => request.content.data?.offset)).toEqual([30, 5]);
  mockDelete.mockResolvedValue(undefined);
  await deleteTaskWithReminders('owner', task.id);
  expect(pending).toHaveLength(0);
  expect(mockDelete).toHaveBeenCalledWith('owner', task.id);
});

it('keeps the saved task when permission is denied or native scheduling fails', async () => {
  mockCreate.mockResolvedValue(task);
  mockPermission.mockResolvedValue({ granted: false, status: 'denied', canAskAgain: false });
  const denied = await createTaskWithReminders('owner', 'request', {
    title: task.title,
    category: 'work',
    priority: 'high',
    due_at: task.due_at,
  });
  expect(denied.task).toBe(task);
  expect(denied.reminder.status).toBe('permission-denied');
  expect(reminderWarning(denied.reminder)).toContain('disabled on this device');
  expect(mockSchedule).not.toHaveBeenCalled();
  mockPermission.mockResolvedValue({ granted: true, status: 'granted', canAskAgain: true });
  mockSchedule.mockRejectedValueOnce(new Error('OS refused'));
  const failed = await createTaskWithReminders('owner', 'request', {
    title: task.title,
    category: 'work',
    priority: 'high',
    due_at: task.due_at,
  });
  expect(failed.task).toBe(task);
  expect(failed.reminder.status).toBe('error');
  expect(reminderWarning(failed.reminder)).toContain('could not be confirmed');
});

it('global Off cancels existing requests and stops new ones', async () => {
  await reconcileTaskReminders(task);
  expect(pending).toHaveLength(3);
  await setTaskRemindersEnabled('owner', false);
  expect(pending).toHaveLength(0);
  expect((await reconcileTaskReminders(task)).status).toBe('off');
});

it('uses the absolute due instant across a timezone/day boundary', () => {
  const boundary = { ...task, due_at: '2026-11-01T06:30:00.000Z' };
  const slots = taskReminderSlots(boundary, Date.parse('2026-11-01T05:45:00Z'));
  expect(slots.map((slot) => new Date(slot.at).toISOString())).toEqual([
    '2026-11-01T06:00:00.000Z',
    '2026-11-01T06:25:00.000Z',
  ]);
});

it('opens an owned existing task and safely ignores a deleted or foreign task tap', async () => {
  const response = {
    actionIdentifier: 'default',
    notification: {
      request: {
        identifier: 'notification',
        content: { data: { kind: 'lifeops-task-reminder-v1', ownerId: 'owner', taskId: 'task-1' } },
      },
    },
  } as unknown as Notifications.NotificationResponse;
  const navigate = jest.fn();
  const missing = jest.fn();
  mockGet.mockResolvedValueOnce(task).mockResolvedValueOnce(null);
  expect(taskIdFromNotification(response, 'other')).toBeNull();
  await openTaskNotification(response, 'owner', navigate, missing);
  expect(navigate).toHaveBeenCalledWith('task-1');
  await openTaskNotification(response, 'owner', navigate, missing);
  expect(missing).toHaveBeenCalledTimes(1);
  await openTaskNotification(response, 'other', navigate, missing);
  expect(mockGet).toHaveBeenCalledTimes(2);
});

it('does not cancel pending reminders when deletion fails', async () => {
  await reconcileTaskReminders(task);
  mockDelete.mockRejectedValueOnce(new Error('offline'));
  await expect(deleteTaskWithReminders('owner', task.id)).rejects.toThrow('offline');
  expect(pending).toHaveLength(3);
  await cancelTaskReminders('owner', task.id);
  expect(pending).toHaveLength(0);
});

it('reports cancellation failure after a successful task deletion', async () => {
  await reconcileTaskReminders(task);
  mockDelete.mockResolvedValue(undefined);
  mockCancel.mockRejectedValueOnce(new Error('OS unavailable'));
  const result = await deleteTaskWithReminders('owner', task.id);
  expect(mockDelete).toHaveBeenCalledWith('owner', task.id);
  expect(result.status).toBe('error');
  expect(pending).toHaveLength(3);
});

it('restores a missing reminder and removes a deleted task request on app reconciliation', async () => {
  mockUpcoming.mockResolvedValueOnce([task]);
  await reconcileUpcomingTaskReminders('owner');
  expect(pending).toHaveLength(3);
  pending.pop();
  mockReminderByIds.mockResolvedValueOnce([task]);
  mockUpcoming.mockResolvedValueOnce([task]);
  await reconcileUpcomingTaskReminders('owner');
  expect(pending).toHaveLength(3);
  mockReminderByIds.mockResolvedValueOnce([]);
  mockUpcoming.mockResolvedValueOnce([]);
  await reconcileUpcomingTaskReminders('owner');
  expect(pending).toHaveLength(0);
});
