import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  cleanupLegacyAndroidTaskChannel,
  cleanupLegacyBillNotifications,
  isLegacyBillRequest,
} from '@/features/notifications/legacy-bill-cleanup';

const scheduled = jest.mocked(Notifications.getAllScheduledNotificationsAsync);
const cancel = jest.mocked(Notifications.cancelScheduledNotificationAsync);
const getChannels = jest.mocked(Notifications.getNotificationChannelsAsync);
const deleteChannel = jest.mocked(Notifications.deleteNotificationChannelAsync);
const getPermissions = jest.mocked(Notifications.getPermissionsAsync);
const requestPermissions = jest.mocked(Notifications.requestPermissionsAsync);

const originalPlatform = Platform.OS;
const channels = new Set<string>();

function channel(id: string): Notifications.NotificationChannel {
  return { id, name: id } as Notifications.NotificationChannel;
}

function request(identifier: string, data: Record<string, unknown> = {}) {
  return { identifier, content: { data }, trigger: null } as Notifications.NotificationRequest;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  channels.clear();
  scheduled.mockResolvedValue([]);
  cancel.mockResolvedValue(undefined);
  getChannels.mockImplementation(async () => [...channels].map(channel));
  deleteChannel.mockImplementation(async (id) => {
    channels.delete(id);
  });
});

afterAll(() => {
  Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
});

it('cancels only legacy Bill requests across owners and removes their retired preferences', async () => {
  channels.add('bill-reminders-v1');
  scheduled.mockResolvedValue([
    request('lifeops-bill-reminder-v1:old-owner:occurrence:2'),
    request('random-bill-id', { kind: 'lifeops-bill-reminder-v1' }),
    request('channel-bill-id', { channelId: 'bill-reminders-v1' }),
    {
      ...request('trigger-bill-id'),
      trigger: { channelId: 'bill-reminders-v1' },
    } as Notifications.NotificationRequest,
    request('lifeops-task-reminder-v1:owner:task:60', { kind: 'lifeops-task-reminder-v1' }),
    request('unrelated'),
  ]);
  await AsyncStorage.setItem('lifeops:bill-reminders:old-owner', 'on');
  await AsyncStorage.setItem('lifeops:task-reminders:owner', 'on');

  await cleanupLegacyBillNotifications();

  expect(cancel.mock.calls.map(([identifier]) => identifier)).toEqual([
    'lifeops-bill-reminder-v1:old-owner:occurrence:2',
    'random-bill-id',
    'channel-bill-id',
    'trigger-bill-id',
  ]);
  expect(await AsyncStorage.getItem('lifeops:bill-reminders:old-owner')).toBeNull();
  expect(await AsyncStorage.getItem('lifeops:task-reminders:owner')).toBe('on');
  expect(isLegacyBillRequest(request('unrelated'))).toBe(false);
  expect(deleteChannel).toHaveBeenCalledWith('bill-reminders-v1');
});

it('creates v2 with the existing system-sound configuration before removing v1 when needed', async () => {
  channels.add('task-reminders');
  jest.mocked(Notifications.setNotificationChannelAsync).mockImplementationOnce(async (id) => {
    channels.add(id);
    return channel(id);
  });

  await cleanupLegacyAndroidTaskChannel();

  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('task-reminders-v2', {
    name: 'Task Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  expect(channels).toEqual(new Set(['task-reminders-v2']));
  expect(deleteChannel).toHaveBeenCalledWith('task-reminders');
  expect(getPermissions).not.toHaveBeenCalled();
  expect(requestPermissions).not.toHaveBeenCalled();
});

it('keeps v1 if the current Task channel cannot be confirmed', async () => {
  channels.add('task-reminders');

  await expect(cleanupLegacyAndroidTaskChannel()).rejects.toThrow(
    'Current Task channel could not be confirmed.',
  );
  expect(deleteChannel).not.toHaveBeenCalled();
  expect(channels).toEqual(new Set(['task-reminders']));
});

it('keeps retired preferences when cancellation fails so cleanup can retry', async () => {
  scheduled.mockResolvedValue([request('lifeops-bill-reminder-v1:old-owner:occurrence:2')]);
  cancel.mockRejectedValueOnce(new Error('OS unavailable'));
  await AsyncStorage.setItem('lifeops:bill-reminders:old-owner', 'on');

  await expect(cleanupLegacyBillNotifications()).rejects.toThrow('OS unavailable');
  expect(await AsyncStorage.getItem('lifeops:bill-reminders:old-owner')).toBe('on');
});

it('deletes only verified obsolete channels and is idempotent across startups', async () => {
  channels.add('bill-reminders-v1');
  channels.add('task-reminders');
  channels.add('task-reminders-v2');
  channels.add('default');
  scheduled.mockResolvedValue([
    request('lifeops-task-reminder-v1:owner:task:60', {
      kind: 'lifeops-task-reminder-v1',
      channelId: 'task-reminders-v2',
    }),
  ]);
  await AsyncStorage.setItem('lifeops:task-reminders:owner', 'off');

  await cleanupLegacyBillNotifications();
  await cleanupLegacyAndroidTaskChannel();
  await cleanupLegacyBillNotifications();
  await cleanupLegacyAndroidTaskChannel();

  expect(deleteChannel.mock.calls.map(([id]) => id)).toEqual([
    'bill-reminders-v1',
    'task-reminders',
  ]);
  expect(channels).toEqual(new Set(['task-reminders-v2', 'default']));
  expect(cancel).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem('lifeops:task-reminders:owner')).toBe('off');
  expect(getPermissions).not.toHaveBeenCalled();
  expect(requestPermissions).not.toHaveBeenCalled();
  expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
});

it('cancels only old Task requests while signed out before deleting their channel', async () => {
  channels.add('task-reminders');
  channels.add('task-reminders-v2');
  scheduled.mockResolvedValue([
    {
      ...request('lifeops-task-reminder-v1:old-owner:task:60'),
      trigger: { channelId: 'task-reminders' },
    } as Notifications.NotificationRequest,
    {
      ...request('lifeops-task-reminder-v1:owner:task:30'),
      trigger: { channelId: 'task-reminders-v2' },
    } as Notifications.NotificationRequest,
  ]);

  await cleanupLegacyAndroidTaskChannel(true);

  expect(cancel.mock.calls.map(([id]) => id)).toEqual([
    'lifeops-task-reminder-v1:old-owner:task:60',
  ]);
  expect(deleteChannel).toHaveBeenCalledWith('task-reminders');
  expect(channels.has('task-reminders-v2')).toBe(true);
});

it('keeps the old Task channel until pending requests are reconciled', async () => {
  channels.add('task-reminders');
  channels.add('task-reminders-v2');
  scheduled.mockResolvedValue([
    {
      ...request('lifeops-task-reminder-v1:owner:task:60'),
      trigger: { channelId: 'task-reminders' },
    } as Notifications.NotificationRequest,
  ]);

  await expect(cleanupLegacyAndroidTaskChannel()).rejects.toThrow('Pending requests');
  expect(cancel).not.toHaveBeenCalled();
  expect(deleteChannel).not.toHaveBeenCalled();
});

it('surfaces Android channel API errors so startup can retry without crashing', async () => {
  channels.add('bill-reminders-v1');
  await AsyncStorage.setItem('lifeops:bill-reminders:old-owner', 'on');
  deleteChannel.mockRejectedValueOnce(new Error('OS unavailable'));

  await expect(cleanupLegacyBillNotifications()).rejects.toThrow('OS unavailable');
  expect(await AsyncStorage.getItem('lifeops:bill-reminders:old-owner')).toBe('on');
  await expect(cleanupLegacyBillNotifications()).resolves.toBeUndefined();
  expect(await AsyncStorage.getItem('lifeops:bill-reminders:old-owner')).toBeNull();
});
