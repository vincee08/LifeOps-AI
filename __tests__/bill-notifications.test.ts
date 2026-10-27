import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  billReminderSlots,
  cancelBillReminders,
  localNineAm,
  reconcileBillReminders,
  requestBillNotificationPermission,
  setBillRemindersEnabled,
} from '@/features/money/bill-notifications';
import type { BillItem } from '@/features/money/bills-service';

const pending: Array<{
  identifier: string;
  content: { title?: string; body?: string; sound?: string; data?: Record<string, unknown> };
  trigger: unknown;
}> = [];
const mockSchedule = jest.fn(async (request: (typeof pending)[number]) => {
  pending.push(request);
  return request.identifier;
});
const mockCancel = jest.fn(async (id: string) => {
  const index = pending.findIndex((request) => request.identifier === id);
  if (index >= 0) pending.splice(index, 1);
});
const mockChannel = jest.fn(
  async (_id: string, _options: { name: string; importance: number }) => undefined,
);
const mockPermission = jest.fn();
const mockNativePermission = jest.fn();
const mockNativeRequest = jest.fn();
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 5 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getAllScheduledNotificationsAsync: jest.fn(async () => [...pending]),
  scheduleNotificationAsync: (request: (typeof pending)[number]) => mockSchedule(request),
  cancelScheduledNotificationAsync: (id: string) => mockCancel(id),
  setNotificationChannelAsync: (id: string, options: { name: string; importance: number }) =>
    mockChannel(id, options),
  getPermissionsAsync: () => mockNativePermission(),
  requestPermissionsAsync: () => mockNativeRequest(),
}));
jest.mock('@/features/tasks/task-notifications', () => ({
  getNotificationPermissionStatus: () => mockPermission(),
}));
jest.mock('@/features/money/bills-service', () => ({
  generateBillOccurrences: jest.fn(),
  getReminderBillItems: jest.fn(),
  listUpcomingReminderBills: jest.fn(),
}));

const item: BillItem = {
  bill: {
    id: 'bill-1',
    user_id: 'owner',
    client_request_id: 'request',
    title: 'Internet',
    category: 'utilities',
    amount_minor: '169900',
    currency_code: 'PHP',
    recurrence: 'monthly',
    anchor_due_on: '2026-11-15',
    notes: 'Private note',
    archived_at: null,
    created_at: '',
    updated_at: '',
  },
  occurrence: {
    id: 'cycle-1',
    user_id: 'owner',
    bill_id: 'bill-1',
    ordinal: 0,
    due_on: '2026-11-15',
    amount_minor: '169900',
    status: 'unpaid',
    paid_at: null,
    created_at: '',
    updated_at: '',
  },
};
const timezone = 'Asia/Manila';
const originalPlatform = Platform.OS;
beforeEach(async () => {
  jest.clearAllMocks();
  pending.length = 0;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  await AsyncStorage.clear();
  mockPermission.mockResolvedValue('granted');
  mockNativePermission.mockResolvedValue({ granted: true, canAskAgain: true });
  mockNativeRequest.mockResolvedValue({ granted: true });
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
});

it('maps local 9 AM to an instant, including a DST zone', () => {
  expect(new Date(localNineAm('2026-11-15', timezone)).toISOString()).toBe(
    '2026-11-15T01:00:00.000Z',
  );
  expect(new Date(localNineAm('2026-03-08', 'America/New_York')).toISOString()).toBe(
    '2026-03-08T13:00:00.000Z',
  );
});

it.each([
  ['2026-11-12T00:00:00Z', [2, 1, 0]],
  ['2026-11-14T07:00:00Z', [0]],
  ['2026-11-15T02:00:00Z', []],
])('uses only future 9 AM calendar slots at %s', async (now, offsets) => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse(now));
  expect(billReminderSlots(item, timezone, Date.parse(now)).map((slot) => slot.offset)).toEqual(
    offsets,
  );
  const result = await reconcileBillReminders(item, timezone);
  expect(result.count).toBe(offsets.length);
  expect(pending.map((request) => request.content.data?.offset)).toEqual(offsets);
  expect(pending.every((request) => !JSON.stringify(request).includes('Private note'))).toBe(true);
});

it('prevents duplicate scheduling and reconciles paid, reopened, changed due dates, and archive', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-12T00:00:00Z'));
  await reconcileBillReminders(item, timezone);
  await reconcileBillReminders(item, timezone);
  expect(pending).toHaveLength(3);
  await reconcileBillReminders(
    {
      ...item,
      occurrence: { ...item.occurrence, status: 'paid', paid_at: '2026-11-12T01:00:00Z' },
    },
    timezone,
  );
  expect(pending).toHaveLength(0);
  await reconcileBillReminders(item, timezone);
  expect(pending).toHaveLength(3);
  await reconcileBillReminders(
    { ...item, occurrence: { ...item.occurrence, due_on: '2026-11-16' } },
    timezone,
  );
  expect(pending).toHaveLength(3);
  expect(pending.every((request) => request.content.data?.dueOn === '2026-11-16')).toBe(true);
  await reconcileBillReminders(
    { ...item, bill: { ...item.bill, archived_at: '2026-11-12T00:00:00Z' } },
    timezone,
  );
  expect(pending).toHaveLength(0);
});

it('replaces reminder instants after a profile timezone change', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-12T00:00:00Z'));
  await reconcileBillReminders(item, timezone);
  const before = pending.map((request) => (request.trigger as { date: Date }).date.getTime());
  await reconcileBillReminders(item, 'America/New_York');
  expect(pending).toHaveLength(3);
  expect(pending.every((request) => request.content.data?.timezone === 'America/New_York')).toBe(
    true,
  );
  expect(pending.map((request) => (request.trigger as { date: Date }).date.getTime())).not.toEqual(
    before,
  );
});

it('cancels pending requests when the independent Bill switch turns off', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-12T00:00:00Z'));
  await AsyncStorage.setItem('lifeops:task-reminders:owner', 'on');
  await reconcileBillReminders(item, timezone);
  expect(pending).toHaveLength(3);
  expect(await setBillRemindersEnabled('owner', false)).toEqual({ status: 'off', count: 0 });
  expect(pending).toHaveLength(0);
  expect(await AsyncStorage.getItem('lifeops:task-reminders:owner')).toBe('on');
});

it('keeps the Bill switch on when the OS cannot cancel pending requests', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-12T00:00:00Z'));
  await reconcileBillReminders(item, timezone);
  mockCancel.mockRejectedValueOnce(new Error('OS unavailable'));
  expect(await setBillRemindersEnabled('owner', false)).toEqual({ status: 'error', count: 0 });
  expect(await AsyncStorage.getItem('lifeops:bill-reminders:owner')).not.toBe('off');
});

it('reports OS scheduling failure without claiming reminders are active', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-12T00:00:00Z'));
  mockSchedule.mockRejectedValueOnce(new Error('OS unavailable'));
  expect(await reconcileBillReminders(item, timezone)).toEqual({ status: 'error', count: 0 });
});

it('keeps bills saved when permission is denied or reminders are off', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-12T00:00:00Z'));
  mockPermission.mockResolvedValue('denied');
  expect((await reconcileBillReminders(item, timezone)).status).toBe('permission-denied');
  expect(pending).toHaveLength(0);
  await setBillRemindersEnabled('owner', false);
  expect((await reconcileBillReminders(item, timezone)).status).toBe('off');
  expect(pending).toHaveLength(0);
  expect(await cancelBillReminders('owner')).toEqual({ status: 'none', count: 0 });
});

it('uses a dedicated Android system-sound channel without a custom asset', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-12T00:00:00Z'));
  await reconcileBillReminders(item, timezone);
  expect(mockChannel).toHaveBeenCalledWith('bill-reminders-v1', {
    name: 'Bill Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  expect(pending.every((request) => request.content.sound === undefined)).toBe(true);
});

it('creates only the Bill channel before the Android permission prompt', async () => {
  mockNativePermission.mockResolvedValue({ granted: false, canAskAgain: true });
  expect(await requestBillNotificationPermission()).toBe('granted');
  expect(mockChannel).toHaveBeenCalledWith('bill-reminders-v1', {
    name: 'Bill Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  expect(mockChannel.mock.invocationCallOrder[0]).toBeLessThan(
    mockNativeRequest.mock.invocationCallOrder[0]!,
  );
});
