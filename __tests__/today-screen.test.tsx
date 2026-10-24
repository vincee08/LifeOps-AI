import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { TodayScreen } from '@/features/today/TodayScreen';
import type { Task } from '@/features/tasks/tasks-service';

const mockNavigate = jest.fn();
const mockRouter = { navigate: mockNavigate };
const mockProfile = jest.fn();
const mockList = jest.fn();
const mockComplete = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: (effect: () => void) => {
    const React = require('react');
    React.useEffect(effect, [effect]);
  },
}));
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'signed-in', session: { user: { id: 'owner' } } } }),
}));
jest.mock('@/features/settings/profile-service', () => ({
  isValidTimezone: (value: string) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  loadProfile: (...args: unknown[]) => mockProfile(...args),
}));
jest.mock('@/features/tasks/tasks-service', () => ({
  listTodayTaskSection: (...args: unknown[]) => mockList(...args),
}));
jest.mock('@/features/tasks/task-reminder-commands', () => ({
  setTaskCompletedWithReminders: (...args: unknown[]) => mockComplete(...args),
}));
jest.mock('@/features/tasks/task-notifications', () => ({
  reminderWarning: () => '',
}));

const due: Task = {
  id: 'due-id',
  user_id: 'owner',
  client_request_id: 'request',
  title: 'Prepare notes',
  description: null,
  category: 'work',
  priority: 'high',
  due_at: '2026-10-23T10:00:00Z',
  completed_at: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};
const completed: Task = { ...due, completed_at: '2026-10-23T08:01:00Z' };
const page = (tasks: Task[], total = tasks.length) => ({
  tasks,
  total,
  hasMore: total > tasks.length,
});
const fixedNow = Date.parse('2026-10-23T08:00:00Z');

async function press(name: string) {
  await act(async () => fireEvent.press(screen.getByRole('button', { name })));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
  mockProfile.mockResolvedValue({ timezone: 'Asia/Manila' });
  mockList.mockImplementation((_owner: string, section: string) =>
    Promise.resolve(page(section === 'today' ? [due] : [])),
  );
  mockComplete.mockResolvedValue({ task: completed, reminder: { status: 'none', count: 0 } });
});
afterEach(() => jest.restoreAllMocks());

it('shows a loading state while profile data is pending', async () => {
  mockProfile.mockImplementationOnce(() => new Promise(() => undefined));
  await render(<TodayScreen />);
  expect(screen.getByText('Loading today’s tasks…')).toBeTruthy();
});

it('shows an empty state and counts from exact task pages', async () => {
  mockList.mockResolvedValue(page([]));
  await render(<TodayScreen />);
  expect(await screen.findByText('Nothing due today.')).toBeTruthy();
  expect(screen.getByText('0 due today')).toBeTruthy();
  expect(screen.getByText('0 overdue')).toBeTruthy();
  await press('View all tasks');
  expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/tasks');
});

it('shows a partial section failure and retries without inventing its count', async () => {
  mockList.mockImplementation((_owner: string, section: string) =>
    section === 'overdue' ? Promise.reject(new Error('Offline')) : Promise.resolve(page([])),
  );
  await render(<TodayScreen />);
  expect(await screen.findByText('Overdue unavailable')).toBeTruthy();
  expect(screen.getByText('0 due today')).toBeTruthy();
  expect(screen.queryByText('0 overdue')).toBeNull();
  mockList.mockResolvedValue(page([]));
  await press('Try again');
  expect(await screen.findByText('0 overdue')).toBeTruthy();
});

it('completes and reopens through the Tasks service and opens the Tasks editor', async () => {
  let isCompleted = false;
  mockList.mockImplementation((_owner: string, section: string) =>
    Promise.resolve(
      page(
        section === (isCompleted ? 'completed' : 'today') ? [isCompleted ? completed : due] : [],
      ),
    ),
  );
  mockComplete.mockImplementation(async (_owner: string, _id: string, value: boolean) => {
    isCompleted = value;
    return { task: value ? completed : due, reminder: { status: 'none', count: 0 } };
  });
  await render(<TodayScreen />);
  expect(await screen.findByText('Prepare notes')).toBeTruthy();
  expect(screen.getByText('1 due today')).toBeTruthy();
  await press('Open Prepare notes in Tasks');
  expect(mockNavigate).toHaveBeenCalledWith({
    pathname: '/(tabs)/tasks',
    params: { editTaskId: 'due-id' },
  });
  await press('Complete Prepare notes');
  await waitFor(() => expect(screen.getByText('1 completed today')).toBeTruthy());
  expect(mockComplete).toHaveBeenCalledWith('owner', 'due-id', true);
  await press('Reopen Prepare notes');
  await waitFor(() => expect(screen.getByText('1 due today')).toBeTruthy());
  expect(mockComplete).toHaveBeenCalledWith('owner', 'due-id', false);
});

it('shows a recoverable profile error and retains a failed task action', async () => {
  mockProfile.mockRejectedValueOnce(new Error('Profile unavailable'));
  await render(<TodayScreen />);
  expect(await screen.findByText('Profile unavailable')).toBeTruthy();
  await press('Try again');
  expect(await screen.findByText('Prepare notes')).toBeTruthy();
  mockComplete.mockRejectedValueOnce(new Error('Save failed'));
  await press('Complete Prepare notes');
  expect(await screen.findByText('Save failed')).toBeTruthy();
  expect(screen.getByText('Prepare notes')).toBeTruthy();
});
