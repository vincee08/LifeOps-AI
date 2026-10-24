import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import {
  getReminderTasksByIds,
  listUpcomingReminderTasks,
  REMINDER_RECONCILE_LIMIT,
  type ReminderTask,
} from '@/features/tasks/tasks-service';

export const TASK_REMINDER_OFFSETS = [60, 30, 5] as const;
// Android channel sound settings cannot be changed after creation. Use a fresh
// channel for the system sound instead of the old channel's invalid custom sound.
const CHANNEL_ID = 'task-reminders-v2';
const KIND = 'lifeops-task-reminder-v1';
const PREFIX = 'lifeops-task-reminder-v1:';
const MAX_MANAGED_REQUESTS = REMINDER_RECONCILE_LIMIT * TASK_REMINDER_OFFSETS.length;

export type ReminderResult =
  | { status: 'scheduled'; count: number }
  | { status: 'none' | 'off' | 'permission-denied' | 'unavailable' | 'error'; count: 0 };

type Slot = { offset: (typeof TASK_REMINDER_OFFSETS)[number]; at: number };
type ManagedRequest = Notifications.NotificationRequest & {
  content: Notifications.NotificationRequest['content'] & {
    data: {
      kind: string;
      ownerId: string;
      taskId: string;
      offset: number;
      dueAt: string;
      channelId?: string;
    };
  };
};

let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const current = queue.then(work, work);
  queue = current.catch(() => undefined);
  return current;
}

function preferenceKey(ownerId: string) {
  return `lifeops:task-reminders:${ownerId}`;
}

export async function taskRemindersEnabled(ownerId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(preferenceKey(ownerId))) !== 'off';
}

export async function getNotificationPermissionStatus(): Promise<
  'granted' | 'denied' | 'undetermined' | 'unavailable'
> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    const permission = await Notifications.getPermissionsAsync();
    return permission.granted
      ? 'granted'
      : permission.status === 'denied'
        ? 'denied'
        : 'undetermined';
  } catch {
    return 'unavailable';
  }
}

export async function requestNotificationPermission(): Promise<
  'granted' | 'denied' | 'unavailable'
> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    // Android 13 waits for a channel before it can display the permission prompt.
    await channel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'denied';
    const result = await Notifications.requestPermissionsAsync();
    return result.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export function taskReminderSlots(task: ReminderTask, now = Date.now()): Slot[] {
  if (!task.due_at || task.completed_at) return [];
  const due = Date.parse(task.due_at);
  if (!Number.isFinite(due)) return [];
  return TASK_REMINDER_OFFSETS.map((offset) => ({ offset, at: due - offset * 60_000 })).filter(
    (slot) => slot.at > now,
  );
}

function managed(request: Notifications.NotificationRequest): request is ManagedRequest {
  const data = request.content.data;
  return (
    data?.kind === KIND &&
    typeof data.ownerId === 'string' &&
    typeof data.taskId === 'string' &&
    typeof data.offset === 'number' &&
    typeof data.dueAt === 'string'
  );
}

function requestId(task: ReminderTask, offset: number) {
  return `${PREFIX}${task.user_id}:${task.id}:${offset}`;
}

function body(offset: number) {
  return `Due in ${offset === 60 ? '1 hour' : `${offset} minutes`}.`;
}

async function channel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Task Reminders',
      importance: AndroidImportance.DEFAULT,
    });
  }
}

async function scheduled() {
  return (await Notifications.getAllScheduledNotificationsAsync()).filter(managed);
}

async function cancel(requests: ManagedRequest[]) {
  for (const request of requests) {
    await Notifications.cancelScheduledNotificationAsync(request.identifier);
  }
}

async function reconcileOne(
  task: ReminderTask,
  requests: ManagedRequest[],
  now: number,
): Promise<ReminderResult> {
  const desired = taskReminderSlots(task, now);
  const existing = requests.filter(
    (request) =>
      request.content.data.taskId === task.id && request.content.data.ownerId === task.user_id,
  );
  const allowed = await taskRemindersEnabled(task.user_id);
  const permission =
    desired.length && allowed ? await getNotificationPermissionStatus() : 'undetermined';
  const canSchedule = allowed && permission === 'granted';
  let count = 0;
  const kept = new Set<number>();
  for (const request of existing) {
    const slot = desired.find((item) => item.offset === request.content.data.offset);
    const expectedId = slot && requestId(task, slot.offset);
    const matches =
      canSchedule &&
      slot &&
      request.identifier === expectedId &&
      request.content.data.dueAt === task.due_at &&
      (Platform.OS !== 'android' || request.content.data.channelId === CHANNEL_ID) &&
      request.content.title === task.title &&
      request.content.body === body(slot.offset);
    // If an older version created duplicates, keep one matching request only.
    if (matches && !kept.has(slot.offset)) {
      kept.add(slot.offset);
      continue;
    }
    await Notifications.cancelScheduledNotificationAsync(request.identifier);
  }
  if (desired.length === 0) return { status: 'none', count: 0 };
  if (!allowed) return { status: 'off', count: 0 };
  if (permission !== 'granted')
    return { status: permission === 'unavailable' ? 'unavailable' : 'permission-denied', count: 0 };
  await channel();
  for (const slot of desired) {
    const id = requestId(task, slot.offset);
    if (kept.has(slot.offset)) {
      count++;
      continue;
    }
    // A previous native call may have taken long enough to cross the trigger.
    if (slot.at <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: task.title,
        body: body(slot.offset),
        ...(Platform.OS === 'ios' ? { sound: 'default' as const } : {}),
        data: {
          kind: KIND,
          ownerId: task.user_id,
          taskId: task.id,
          offset: slot.offset,
          dueAt: task.due_at,
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(slot.at),
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
    });
    count++;
  }
  return count ? { status: 'scheduled', count } : { status: 'none', count: 0 };
}

export function reconcileTaskReminders(task: ReminderTask): Promise<ReminderResult> {
  return exclusive(async () => {
    if (Platform.OS === 'web') return { status: 'unavailable', count: 0 };
    try {
      return await reconcileOne(task, await scheduled(), Date.now());
    } catch {
      return { status: 'error', count: 0 };
    }
  });
}

export const scheduleTaskReminders = reconcileTaskReminders;

export function cancelTaskReminders(ownerId: string, taskId: string): Promise<ReminderResult> {
  return exclusive(async () => {
    if (Platform.OS === 'web') return { status: 'none', count: 0 };
    try {
      await cancel(
        (await scheduled()).filter(
          (request) =>
            request.content.data.ownerId === ownerId && request.content.data.taskId === taskId,
        ),
      );
      return { status: 'none', count: 0 };
    } catch {
      return { status: 'error', count: 0 };
    }
  });
}

export function cancelAllTaskReminders(ownerId: string): Promise<ReminderResult> {
  return exclusive(async () => {
    if (Platform.OS === 'web') return { status: 'none', count: 0 };
    try {
      await cancel(
        (await scheduled()).filter((request) => request.content.data.ownerId === ownerId),
      );
      return { status: 'none', count: 0 };
    } catch {
      return { status: 'error', count: 0 };
    }
  });
}

export function setTaskRemindersEnabled(
  ownerId: string,
  enabled: boolean,
): Promise<ReminderResult> {
  return exclusive(async () => {
    try {
      await AsyncStorage.setItem(preferenceKey(ownerId), enabled ? 'on' : 'off');
      if (enabled) return { status: 'none', count: 0 };
      if (Platform.OS !== 'web')
        await cancel(
          (await scheduled()).filter((request) => request.content.data.ownerId === ownerId),
        );
      return { status: 'off', count: 0 };
    } catch {
      return { status: 'error', count: 0 };
    }
  });
}

export function reconcileUpcomingTaskReminders(ownerId: string): Promise<ReminderResult> {
  return exclusive(async () => {
    if (Platform.OS === 'web') return { status: 'unavailable', count: 0 };
    try {
      const requests = await scheduled();
      // Shared devices must not keep another account's task reminders pending.
      await cancel(requests.filter((request) => request.content.data.ownerId !== ownerId));
      const owned = requests.filter((request) => request.content.data.ownerId === ownerId);
      if (!(await taskRemindersEnabled(ownerId))) {
        await cancel(owned);
        return { status: 'off', count: 0 };
      }
      const ids = [
        ...new Set(
          owned.slice(0, MAX_MANAGED_REQUESTS).map((request) => request.content.data.taskId),
        ),
      ].slice(0, REMINDER_RECONCILE_LIMIT);
      const [byIds, upcoming] = await Promise.all([
        getReminderTasksByIds(ownerId, ids),
        listUpcomingReminderTasks(ownerId, new Date().toISOString()),
      ]);
      const tasks = new Map([...byIds, ...upcoming].map((task) => [task.id, task]));
      await cancel(
        owned.filter(
          (request) =>
            ids.includes(request.content.data.taskId) && !tasks.has(request.content.data.taskId),
        ),
      );
      let result: ReminderResult = { status: 'none', count: 0 };
      for (const task of tasks.values()) {
        result = await reconcileOne(task, owned, Date.now());
      }
      return result;
    } catch {
      return { status: 'error', count: 0 };
    }
  });
}

export function reminderWarning(result: ReminderResult): string {
  if (result.status === 'permission-denied')
    return 'Notifications are disabled on this device. Enable them in Settings or your device settings.';
  if (result.status === 'unavailable') return 'Task notifications are unavailable on this device.';
  if (result.status === 'error')
    return 'Task reminder scheduling could not be confirmed. Open Settings to retry.';
  return '';
}

export function taskIdFromNotification(
  response: Notifications.NotificationResponse,
  ownerId: string,
): string | null {
  const data = response.notification.request.content.data;
  return response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER &&
    data?.kind === KIND &&
    data.ownerId === ownerId &&
    typeof data.taskId === 'string'
    ? data.taskId
    : null;
}
