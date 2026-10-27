import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { formatPesos } from '@/features/money/bills-model';
import {
  generateBillOccurrences,
  getReminderBillItems,
  listUpcomingReminderBills,
  type BillItem,
} from '@/features/money/bills-service';
import { loadProfile } from '@/features/settings/profile-service';
import { profileTimezone } from '@/features/settings/profile-timezone';
import {
  getNotificationPermissionStatus,
  type ReminderResult,
} from '@/features/tasks/task-notifications';
import { getTodayWindow } from '@/features/today/today-model';

export const BILL_REMINDER_OFFSETS = [2, 1, 0] as const;
const CHANNEL_ID = 'bill-reminders-v1';
const KIND = 'lifeops-bill-reminder-v1';
const PREFIX = `${KIND}:`;
type Slot = { offset: number; at: number };
type Managed = Notifications.NotificationRequest & {
  content: Notifications.NotificationRequest['content'] & {
    data: {
      kind: string;
      ownerId: string;
      occurrenceId: string;
      offset: number;
      dueOn: string;
      timezone: string;
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
  return `lifeops:bill-reminders:${ownerId}`;
}
export async function billRemindersEnabled(ownerId: string) {
  return (await AsyncStorage.getItem(preferenceKey(ownerId))) !== 'off';
}

export async function requestBillNotificationPermission(): Promise<
  'granted' | 'denied' | 'unavailable'
> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    await channel(); // Android 13 needs this channel before the permission prompt.
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'denied';
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

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

export function billReminderSlots(item: BillItem, timezone: string, now = Date.now()): Slot[] {
  if (item.bill.archived_at || item.occurrence.status !== 'unpaid') return [];
  return BILL_REMINDER_OFFSETS.map((offset) => ({
    offset,
    at: localNineAm(addCalendarDays(item.occurrence.due_on, -offset), timezone),
  })).filter((slot) => slot.at > now);
}

function managed(request: Notifications.NotificationRequest): request is Managed {
  const data = request.content.data;
  return (
    data?.kind === KIND &&
    typeof data.ownerId === 'string' &&
    typeof data.occurrenceId === 'string' &&
    typeof data.offset === 'number' &&
    typeof data.dueOn === 'string' &&
    typeof data.timezone === 'string'
  );
}
function requestId(item: BillItem, offset: number) {
  return `${PREFIX}${item.occurrence.user_id}:${item.occurrence.id}:${offset}`;
}
function body(item: BillItem, offset: number) {
  const timing = offset === 2 ? 'in 2 days' : offset === 1 ? 'tomorrow' : 'today';
  return `${formatPesos(item.occurrence.amount_minor)} is due ${timing}.`;
}
async function channel() {
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Bill Reminders',
      importance: AndroidImportance.DEFAULT,
    });
}
async function scheduled() {
  return (await Notifications.getAllScheduledNotificationsAsync()).filter(managed);
}
async function cancel(requests: Managed[]) {
  for (const request of requests)
    await Notifications.cancelScheduledNotificationAsync(request.identifier);
}

async function reconcileOne(
  item: BillItem,
  requests: Managed[],
  timezone: string,
  now: number,
  enabled: boolean,
  permission: string,
): Promise<ReminderResult> {
  const desired = billReminderSlots(item, timezone, now);
  const existing = requests.filter(
    (request) =>
      request.content.data.ownerId === item.occurrence.user_id &&
      request.content.data.occurrenceId === item.occurrence.id,
  );
  const canSchedule = enabled && permission === 'granted';
  const kept = new Set<number>();
  for (const request of existing) {
    const slot = desired.find((value) => value.offset === request.content.data.offset);
    const matches =
      canSchedule &&
      slot &&
      !kept.has(slot.offset) &&
      request.identifier === requestId(item, slot.offset) &&
      request.content.data.dueOn === item.occurrence.due_on &&
      request.content.data.timezone === timezone &&
      (Platform.OS !== 'android' || request.content.data.channelId === CHANNEL_ID) &&
      request.content.title === item.bill.title &&
      request.content.body === body(item, slot.offset);
    if (matches) kept.add(slot.offset);
    else await Notifications.cancelScheduledNotificationAsync(request.identifier);
  }
  if (!desired.length) return { status: 'none', count: 0 };
  if (!enabled) return { status: 'off', count: 0 };
  if (permission !== 'granted')
    return {
      status: permission === 'unavailable' ? 'unavailable' : 'permission-denied',
      count: 0,
    };
  await channel();
  let count = kept.size;
  for (const slot of desired) {
    if (kept.has(slot.offset) || slot.at <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: requestId(item, slot.offset),
      content: {
        title: item.bill.title,
        body: body(item, slot.offset),
        ...(Platform.OS === 'ios' ? { sound: 'default' as const } : {}),
        data: {
          kind: KIND,
          ownerId: item.occurrence.user_id,
          occurrenceId: item.occurrence.id,
          offset: slot.offset,
          dueOn: item.occurrence.due_on,
          timezone,
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

export function reconcileBillReminders(item: BillItem, timezone: string): Promise<ReminderResult> {
  return exclusive(async () => {
    if (Platform.OS === 'web') return { status: 'unavailable', count: 0 };
    try {
      return await reconcileOne(
        item,
        await scheduled(),
        timezone,
        Date.now(),
        await billRemindersEnabled(item.occurrence.user_id),
        await getNotificationPermissionStatus(),
      );
    } catch {
      return { status: 'error', count: 0 };
    }
  });
}
export function cancelBillReminders(
  ownerId: string,
  occurrenceId?: string,
): Promise<ReminderResult> {
  return exclusive(async () => {
    if (Platform.OS === 'web') return { status: 'none', count: 0 };
    try {
      await cancel(
        (await scheduled()).filter(
          (request) =>
            request.content.data.ownerId === ownerId &&
            (!occurrenceId || request.content.data.occurrenceId === occurrenceId),
        ),
      );
      return { status: 'none', count: 0 };
    } catch {
      return { status: 'error', count: 0 };
    }
  });
}
export function setBillRemindersEnabled(
  ownerId: string,
  enabled: boolean,
): Promise<ReminderResult> {
  return exclusive(async () => {
    try {
      if (enabled) {
        await AsyncStorage.setItem(preferenceKey(ownerId), 'on');
        return { status: 'none', count: 0 };
      }
      if (Platform.OS !== 'web')
        await cancel(
          (await scheduled()).filter((request) => request.content.data.ownerId === ownerId),
        );
      await AsyncStorage.setItem(preferenceKey(ownerId), 'off');
      return { status: 'off', count: 0 };
    } catch {
      return { status: 'error', count: 0 };
    }
  });
}

export function reconcileUpcomingBillReminders(ownerId: string): Promise<ReminderResult> {
  return exclusive(async () => {
    if (Platform.OS === 'web') return { status: 'unavailable', count: 0 };
    try {
      const requests = await scheduled();
      await cancel(requests.filter((request) => request.content.data.ownerId !== ownerId));
      const owned = requests.filter((request) => request.content.data.ownerId === ownerId);
      const enabled = await billRemindersEnabled(ownerId);
      if (!enabled) {
        await cancel(owned);
        return { status: 'off', count: 0 };
      }
      const profile = await loadProfile(ownerId);
      const timezone = profileTimezone(profile.timezone);
      const today = getTodayWindow(Date.now(), timezone).date;
      await generateBillOccurrences();
      const ids = [...new Set(owned.map((request) => request.content.data.occurrenceId))].slice(
        0,
        100,
      );
      const [byIds, upcoming] = await Promise.all([
        getReminderBillItems(ownerId, ids),
        listUpcomingReminderBills(ownerId, today, addCalendarDays(today, 90)),
      ]);
      const items = new Map([...byIds, ...upcoming].map((item) => [item.occurrence.id, item]));
      await cancel(
        owned.filter(
          (request) =>
            ids.includes(request.content.data.occurrenceId) &&
            !items.has(request.content.data.occurrenceId),
        ),
      );
      const permission = await getNotificationPermissionStatus();
      let count = 0;
      let failure: ReminderResult | null = null;
      for (const item of items.values()) {
        const result = await reconcileOne(item, owned, timezone, Date.now(), enabled, permission);
        if (result.status === 'scheduled') count += result.count;
        else if (
          result.status === 'error' ||
          result.status === 'unavailable' ||
          result.status === 'permission-denied'
        )
          failure = result;
      }
      return failure ?? (count ? { status: 'scheduled', count } : { status: 'none', count: 0 });
    } catch {
      return { status: 'error', count: 0 };
    }
  });
}

export function billReminderWarning(result: ReminderResult): string {
  if (result.status === 'permission-denied')
    return 'Device notifications are disabled. Bill saved without reminders; enable notifications in Settings.';
  if (result.status === 'unavailable') return 'Bill notifications are unavailable on this device.';
  if (result.status === 'error')
    return 'Bill reminder scheduling could not be confirmed. Open Settings to retry.';
  return '';
}

export function billOccurrenceIdFromNotification(
  response: Notifications.NotificationResponse,
  ownerId: string,
): string | null {
  const data = response.notification.request.content.data;
  return response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER &&
    data?.kind === KIND &&
    data.ownerId === ownerId &&
    typeof data.occurrenceId === 'string'
    ? data.occurrenceId
    : null;
}
