import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import { addCalendarDays, localNineAm } from './loan-reminder-time';
import { formatPesos } from './loans-model';
import { listUpcomingReminderInstallments, type LoanInstallment } from './loans-service';
import { loadProfile } from '@/features/settings/profile-service';
import { profileTimezone } from '@/features/settings/profile-timezone';
import {
  getNotificationPermissionStatus,
  type ReminderResult,
} from '@/features/tasks/task-notifications';
import { getTodayWindow } from '@/features/today/today-model';

export const LOAN_REMINDER_OFFSETS = [2, 1, 0] as const;
const CHANNEL_ID = 'loan-reminders-v2';
const MIGRATED_CHANNEL_ID = 'loan-reminders-v3';
const KIND = 'lifeops-loan-reminder-v1';
const PREFIX = `${KIND}:`;
type Managed = Notifications.NotificationRequest & {
  content: Notifications.NotificationRequest['content'] & {
    data: {
      kind: string;
      ownerId: string;
      dueId: string;
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
  return `lifeops:loan-reminders:${ownerId}`;
}
export async function loanRemindersEnabled(ownerId: string) {
  return (await AsyncStorage.getItem(preferenceKey(ownerId))) !== 'off';
}
async function channel(): Promise<string> {
  if (Platform.OS !== 'android') return CHANNEL_ID;
  // Android cannot repair a channel's sound after creation. SDK 58 interpreted
  // the old v2 sound string as a missing custom asset, leaving a silent channel.
  if (await Notifications.getNotificationChannelAsync(MIGRATED_CHANNEL_ID))
    return MIGRATED_CHANNEL_ID;
  const current = await Notifications.getNotificationChannelAsync(CHANNEL_ID);
  if (current?.sound === null && current.importance !== AndroidImportance.NONE) {
    await Notifications.setNotificationChannelAsync(MIGRATED_CHANNEL_ID, {
      name: 'Loan Reminders',
      importance: current.importance,
      showBadge: current.showBadge,
      enableVibrate: current.enableVibrate,
      vibrationPattern: current.vibrationPattern,
    });
    return MIGRATED_CHANNEL_ID;
  }
  if (!current)
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Loan Reminders',
      importance: AndroidImportance.DEFAULT,
    });
  return CHANNEL_ID;
}
export async function requestLoanNotificationPermission(): Promise<
  'granted' | 'denied' | 'unavailable'
> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    await channel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'denied';
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}
export function loanReminderSlots(due: LoanInstallment, timezone: string, now = Date.now()) {
  if (due.archived_at || due.paid_at) return [];
  return LOAN_REMINDER_OFFSETS.map((offset) => ({
    offset,
    at: localNineAm(addCalendarDays(due.due_date, -offset), timezone),
  })).filter((slot) => slot.at > now);
}
function managed(request: Notifications.NotificationRequest): request is Managed {
  const data = request.content.data;
  return (
    data?.kind === KIND &&
    typeof data.ownerId === 'string' &&
    typeof data.dueId === 'string' &&
    typeof data.offset === 'number' &&
    typeof data.dueOn === 'string' &&
    typeof data.timezone === 'string'
  );
}
async function scheduled() {
  return (await Notifications.getAllScheduledNotificationsAsync()).filter(managed);
}
async function cancel(requests: Managed[]) {
  for (const request of requests)
    await Notifications.cancelScheduledNotificationAsync(request.identifier);
}
function requestId(due: LoanInstallment, offset: number) {
  return `${PREFIX}${due.user_id}:${due.id}:${offset}`;
}
function body(due: LoanInstallment, offset: number) {
  const timing = offset === 2 ? 'in 2 days' : offset === 1 ? 'tomorrow' : 'today';
  return `${formatPesos(due.monthly_payment_centavos)} due ${timing}. Mark paid after paying outside LifeOps AI.`;
}
async function reconcileOne(
  due: LoanInstallment,
  requests: Managed[],
  timezone: string,
  now: number,
  enabled: boolean,
  permission: string,
  channelId: string,
): Promise<ReminderResult> {
  const desired = loanReminderSlots(due, timezone, now);
  const existing = requests.filter(
    (request) =>
      request.content.data.ownerId === due.user_id && request.content.data.dueId === due.id,
  );
  const canSchedule = enabled && permission === 'granted';
  const kept = new Set<number>();
  for (const request of existing) {
    const slot = desired.find((value) => value.offset === request.content.data.offset);
    const matches =
      canSchedule &&
      slot &&
      !kept.has(slot.offset) &&
      request.identifier === requestId(due, slot.offset) &&
      request.content.data.dueOn === due.due_date &&
      request.content.data.timezone === timezone &&
      (Platform.OS !== 'android' ||
        (request.content.data.channelId === channelId &&
          request.trigger &&
          'channelId' in request.trigger &&
          request.trigger.channelId === channelId)) &&
      request.content.title === due.title &&
      request.content.body === body(due, slot.offset);
    if (matches) kept.add(slot.offset);
    else await Notifications.cancelScheduledNotificationAsync(request.identifier);
  }
  if (!desired.length) return { status: 'none', count: 0 };
  if (!enabled) return { status: 'off', count: 0 };
  if (permission !== 'granted')
    return { status: permission === 'unavailable' ? 'unavailable' : 'permission-denied', count: 0 };
  let count = kept.size;
  for (const slot of desired) {
    if (kept.has(slot.offset) || slot.at <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: requestId(due, slot.offset),
      content: {
        title: due.title,
        body: body(due, slot.offset),
        ...(Platform.OS === 'ios' ? { sound: 'default' as const } : {}),
        data: {
          kind: KIND,
          ownerId: due.user_id,
          dueId: due.id,
          offset: slot.offset,
          dueOn: due.due_date,
          timezone,
          ...(Platform.OS === 'android' ? { channelId } : {}),
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(slot.at),
        ...(Platform.OS === 'android' ? { channelId } : {}),
      },
    });
    count++;
  }
  return count ? { status: 'scheduled', count } : { status: 'none', count: 0 };
}
export function reconcileLoanReminders(
  due: LoanInstallment,
  timezone: string,
): Promise<ReminderResult> {
  return exclusive(async () => {
    if (Platform.OS === 'web') return { status: 'unavailable', count: 0 };
    try {
      return await reconcileOne(
        due,
        await scheduled(),
        timezone,
        Date.now(),
        await loanRemindersEnabled(due.user_id),
        await getNotificationPermissionStatus(),
        await channel(),
      );
    } catch {
      return { status: 'error', count: 0 };
    }
  });
}
export function cancelLoanReminders(ownerId: string, dueId?: string): Promise<ReminderResult> {
  return exclusive(async () => {
    if (Platform.OS === 'web') return { status: 'none', count: 0 };
    try {
      await cancel(
        (await scheduled()).filter(
          (request) =>
            request.content.data.ownerId === ownerId &&
            (!dueId || request.content.data.dueId === dueId),
        ),
      );
      return { status: 'none', count: 0 };
    } catch {
      return { status: 'error', count: 0 };
    }
  });
}
export function setLoanRemindersEnabled(
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
export function reconcileUpcomingLoanReminders(ownerId: string): Promise<ReminderResult> {
  return exclusive(async () => {
    if (Platform.OS === 'web') return { status: 'unavailable', count: 0 };
    try {
      const requests = await scheduled();
      await cancel(requests.filter((request) => request.content.data.ownerId !== ownerId));
      const owned = requests.filter((request) => request.content.data.ownerId === ownerId);
      const enabled = await loanRemindersEnabled(ownerId);
      if (!enabled) {
        await cancel(owned);
        return { status: 'off', count: 0 };
      }
      if (owned.length > 900) return { status: 'error', count: 0 };
      const profile = await loadProfile(ownerId);
      const timezone = profileTimezone(profile.timezone);
      const today = getTodayWindow(Date.now(), timezone).date;
      const upcoming = await listUpcomingReminderInstallments(
        ownerId,
        today,
        addCalendarDays(today, 90),
      );
      const dueMap = new Map(upcoming.map((due) => [due.id, due]));
      await cancel(owned.filter((request) => !dueMap.has(request.content.data.dueId)));
      const permission = await getNotificationPermissionStatus();
      const channelId = permission === 'granted' && dueMap.size ? await channel() : CHANNEL_ID;
      let count = 0;
      let failure: ReminderResult | null = null;
      for (const due of dueMap.values()) {
        const result = await reconcileOne(
          due,
          owned,
          timezone,
          Date.now(),
          enabled,
          permission,
          channelId,
        );
        if (result.status === 'scheduled') count += result.count;
        else if (['error', 'unavailable', 'permission-denied'].includes(result.status))
          failure = result;
      }
      return failure ?? (count ? { status: 'scheduled', count } : { status: 'none', count: 0 });
    } catch {
      return { status: 'error', count: 0 };
    }
  });
}
export function loanReminderWarning(result: ReminderResult): string {
  if (result.status === 'permission-denied')
    return 'Device notifications are disabled. Loan saved without reminders; enable them in Settings.';
  if (result.status === 'unavailable') return 'Loan notifications are unavailable on this device.';
  if (result.status === 'error')
    return 'Loan reminder scheduling could not be confirmed. Open Settings to retry.';
  return '';
}
export function loanDueIdFromNotification(
  response: Notifications.NotificationResponse,
  ownerId: string,
): string | null {
  const data = response.notification.request.content.data;
  return response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER &&
    data?.kind === KIND &&
    data.ownerId === ownerId &&
    typeof data.dueId === 'string'
    ? data.dueId
    : null;
}
