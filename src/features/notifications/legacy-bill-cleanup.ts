import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  ensureTaskReminderChannel,
  LEGACY_TASK_REMINDER_CHANNEL_ID,
  TASK_REMINDER_CHANNEL_ID,
} from '@/features/tasks/task-notifications';

// These identifiers are kept only to retire requests created by older app builds.
const LEGACY_KIND = 'lifeops-bill-reminder-v1';
const LEGACY_PREFIX = `${LEGACY_KIND}:`;
const LEGACY_CHANNEL = 'bill-reminders-v1';
const LEGACY_TASK_KIND = 'lifeops-task-reminder-v1';
const LEGACY_TASK_PREFIX = `${LEGACY_TASK_KIND}:`;
const LEGACY_PREFERENCE_PREFIX = 'lifeops:bill-reminders:';

export function isLegacyBillRequest(request: Notifications.NotificationRequest): boolean {
  const data = request.content.data;
  return (
    request.identifier.startsWith(LEGACY_PREFIX) ||
    data?.kind === LEGACY_KIND ||
    data?.channelId === LEGACY_CHANNEL ||
    requestChannelId(request) === LEGACY_CHANNEL
  );
}

function requestChannelId(request: Notifications.NotificationRequest): unknown {
  const trigger = request.trigger;
  return trigger && 'channelId' in trigger ? trigger.channelId : request.content.data?.channelId;
}

export async function cleanupLegacyBillNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of requests.filter(isLegacyBillRequest)) {
    await Notifications.cancelScheduledNotificationAsync(request.identifier);
  }
  if (Platform.OS === 'android') {
    const channels = await Notifications.getNotificationChannelsAsync();
    if (channels.some((channel) => channel.id === LEGACY_CHANNEL)) {
      await Notifications.deleteNotificationChannelAsync(LEGACY_CHANNEL);
    }
  }
  // Clear the retired device preference only after pending requests are gone.
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith(LEGACY_PREFERENCE_PREFIX),
  );
  if (keys.length > 0) await AsyncStorage.multiRemove(keys);
}

// Called after authenticated Task reconciliation, or while signed out. Never
// remove a channel while a pending request still points to it.
export async function cleanupLegacyAndroidTaskChannel(signedOut = false): Promise<void> {
  if (Platform.OS !== 'android') return;
  const channels = await Notifications.getNotificationChannelsAsync();
  if (!channels.some((channel) => channel.id === LEGACY_TASK_REMINDER_CHANNEL_ID)) return;
  if (!channels.some((channel) => channel.id === TASK_REMINDER_CHANNEL_ID)) {
    await ensureTaskReminderChannel();
    const updated = await Notifications.getNotificationChannelsAsync();
    if (!updated.some((channel) => channel.id === TASK_REMINDER_CHANNEL_ID)) {
      throw new Error('Current Task channel could not be confirmed.');
    }
  }

  const pending = (await Notifications.getAllScheduledNotificationsAsync()).filter(
    (request) => requestChannelId(request) === LEGACY_TASK_REMINDER_CHANNEL_ID,
  );
  let remaining = 0;
  for (const request of pending) {
    if (
      signedOut &&
      (request.identifier.startsWith(LEGACY_TASK_PREFIX) ||
        request.content.data?.kind === LEGACY_TASK_KIND)
    ) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
    } else {
      remaining++;
    }
  }
  if (remaining > 0) throw new Error('Pending requests still use the legacy Task channel.');
  await Notifications.deleteNotificationChannelAsync(LEGACY_TASK_REMINDER_CHANNEL_ID);
}
