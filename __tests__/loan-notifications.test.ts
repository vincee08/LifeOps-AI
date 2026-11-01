import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  loanReminderSlots,
  reconcileLoanReminders,
  reconcileUpcomingLoanReminders,
  setLoanRemindersEnabled,
} from '@/features/loans/loan-notifications';
import type { LoanInstallment } from '@/features/loans/loans-service';

const mockPending: Array<{
  identifier: string;
  content: { title?: string; body?: string; data?: Record<string, unknown> };
  trigger: unknown;
}> = [];
const mockSchedule = jest.fn(async (request: (typeof mockPending)[number]) => {
  mockPending.push(request);
  return request.identifier;
});
const mockCancel = jest.fn(async (id: string) => {
  const index = mockPending.findIndex((request) => request.identifier === id);
  if (index >= 0) mockPending.splice(index, 1);
});
const mockPermission = jest.fn();
const mockUpcoming = jest.fn();
const mockChannels = new Map<
  string,
  {
    sound: 'default' | 'custom' | null;
    importance: number;
    showBadge: boolean;
    enableVibrate: boolean;
    vibrationPattern: number[] | null;
  }
>();
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 5, NONE: 0 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getAllScheduledNotificationsAsync: jest.fn(async () => [...mockPending]),
  scheduleNotificationAsync: (request: (typeof mockPending)[number]) => mockSchedule(request),
  cancelScheduledNotificationAsync: (id: string) => mockCancel(id),
  getNotificationChannelAsync: jest.fn(async (id: string) => mockChannels.get(id) ?? null),
  setNotificationChannelAsync: jest.fn(async (id: string, options: { importance: number }) => {
    mockChannels.set(id, {
      sound: 'default',
      importance: options.importance,
      showBadge: true,
      enableVibrate: true,
      vibrationPattern: null,
    });
  }),
}));
jest.mock('@/features/tasks/task-notifications', () => ({
  getNotificationPermissionStatus: () => mockPermission(),
}));
jest.mock('@/features/loans/loans-service', () => ({
  listUpcomingReminderInstallments: () => mockUpcoming(),
}));
jest.mock('@/features/settings/profile-service', () => ({
  loadProfile: jest.fn(async () => ({ timezone: 'Asia/Manila' })),
}));
const installment: LoanInstallment = {
  id: 'installment-1',
  user_id: 'owner',
  loan_id: 'loan-1',
  installment_number: 1,
  due_date: '2026-11-15',
  paid_at: null,
  created_at: '',
  title: 'Motorcycle Loan',
  monthly_payment_centavos: '350000',
  archived_at: null,
};
const originalPlatform = Platform.OS;
beforeEach(async () => {
  jest.clearAllMocks();
  mockPending.length = 0;
  mockChannels.clear();
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  await AsyncStorage.clear();
  mockPermission.mockResolvedValue('granted');
  mockUpcoming.mockResolvedValue([installment]);
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
});

it('uses future-only 2/1/0 local dates at 09:00 Manila time', () => {
  const now = Date.parse('2026-11-12T00:00:00Z');
  expect(loanReminderSlots(installment, 'Asia/Manila', now).map((slot) => slot.offset)).toEqual([
    2, 1, 0,
  ]);
  expect(new Date(loanReminderSlots(installment, 'Asia/Manila', now)[0]!.at).toISOString()).toBe(
    '2026-11-13T01:00:00.000Z',
  );
  expect(loanReminderSlots(installment, 'Asia/Manila', Date.parse('2026-11-15T02:00:00Z'))).toEqual(
    [],
  );
});
it('deduplicates and removes reminders after payment or archive', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-12T00:00:00Z'));
  await reconcileUpcomingLoanReminders('owner');
  await reconcileUpcomingLoanReminders('owner');
  expect(mockPending).toHaveLength(3);
  expect(mockSchedule).toHaveBeenCalledTimes(3);
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('loan-reminders-v2', {
    name: 'Loan Reminders',
    importance: 5,
  });
  expect(mockPending.every((request) => !('sound' in request.content))).toBe(true);
  expect(
    mockPending.every(
      (request) => (request.trigger as { channelId?: string }).channelId === 'loan-reminders-v2',
    ),
  ).toBe(true);
  expect(mockPending.every((request) => request.content.body?.includes('3,500.00'))).toBe(true);
  mockUpcoming.mockResolvedValue([]);
  await reconcileUpcomingLoanReminders('owner');
  expect(mockPending).toHaveLength(0);
  await reconcileLoanReminders(
    { ...installment, archived_at: '2026-11-12T00:00:00Z' },
    'Asia/Manila',
  );
  expect(mockPending).toHaveLength(0);
});
it('moves a silent legacy Loan channel without duplicating or touching Task requests', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-12T00:00:00Z'));
  mockChannels.set('loan-reminders-v2', {
    sound: null,
    importance: 2,
    showBadge: false,
    enableVibrate: false,
    vibrationPattern: null,
  });
  mockPending.push({
    identifier: 'lifeops-loan-reminder-v1:owner:installment-1:2',
    content: {
      title: installment.title,
      body: 'old',
      data: {
        kind: 'lifeops-loan-reminder-v1',
        ownerId: 'owner',
        dueId: installment.id,
        offset: 2,
        dueOn: installment.due_date,
        timezone: 'Asia/Manila',
        channelId: 'loan-reminders-v2',
      },
    },
    trigger: { channelId: 'loan-reminders-v2' },
  });
  await reconcileUpcomingLoanReminders('owner');
  await reconcileUpcomingLoanReminders('owner');
  expect(mockPending).toHaveLength(3);
  expect(
    mockPending.every(
      (request) => (request.trigger as { channelId: string }).channelId === 'loan-reminders-v3',
    ),
  ).toBe(true);
  expect(mockCancel).toHaveBeenCalledWith('lifeops-loan-reminder-v1:owner:installment-1:2');
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('loan-reminders-v3', {
    name: 'Loan Reminders',
    importance: 2,
    showBadge: false,
    enableVibrate: false,
    vibrationPattern: null,
  });
  expect(mockSchedule).toHaveBeenCalledTimes(3);
});
it('preserves an OS-disabled v2 channel instead of re-enabling Loan sound', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-12T00:00:00Z'));
  mockChannels.set('loan-reminders-v2', {
    sound: null,
    importance: 0,
    showBadge: false,
    enableVibrate: false,
    vibrationPattern: null,
  });
  await reconcileUpcomingLoanReminders('owner');
  expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalledWith(
    'loan-reminders-v3',
    expect.anything(),
  );
  expect(
    mockPending.every(
      (request) => (request.trigger as { channelId: string }).channelId === 'loan-reminders-v2',
    ),
  ).toBe(true);
});
it('reconciles loans without changing a valid Task reminder', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-12T00:00:00Z'));
  mockPending.push({
    identifier: 'lifeops-task-reminder-v1:owner:task-1:60',
    content: {
      title: 'Task',
      data: { kind: 'lifeops-task-reminder-v1', ownerId: 'owner', taskId: 'task-1' },
    },
    trigger: { channelId: 'task-reminders-v2' },
  });
  await reconcileUpcomingLoanReminders('owner');
  await reconcileUpcomingLoanReminders('owner');
  expect(
    mockPending.filter((request) => request.identifier.startsWith('lifeops-task-reminder-v1:')),
  ).toHaveLength(1);
  expect(mockCancel).not.toHaveBeenCalledWith('lifeops-task-reminder-v1:owner:task-1:60');
});
it('cancels when disabled and reports permission or OS failures', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-12T00:00:00Z'));
  await reconcileUpcomingLoanReminders('owner');
  expect((await setLoanRemindersEnabled('owner', false)).status).toBe('off');
  expect(mockPending).toHaveLength(0);
  await setLoanRemindersEnabled('owner', true);
  mockPermission.mockResolvedValue('denied');
  expect((await reconcileUpcomingLoanReminders('owner')).status).toBe('permission-denied');
  mockPermission.mockResolvedValue('granted');
  mockSchedule.mockRejectedValueOnce(new Error('OS failure'));
  expect((await reconcileUpcomingLoanReminders('owner')).status).toBe('error');
  expect((await reconcileUpcomingLoanReminders('owner')).status).toBe('scheduled');
  expect(mockPending).toHaveLength(3);
});
