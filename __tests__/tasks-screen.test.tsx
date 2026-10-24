import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { TasksScreen } from '@/features/tasks/TasksScreen';

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockComplete = jest.fn();
const mockDelete = jest.fn();
const mockGet = jest.fn();
let mockParams: { editTaskId?: string } = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
  useFocusEffect: (effect: () => void) => {
    const React = require('react');
    React.useEffect(effect, [effect]);
  },
}));
const mockRouter = { setParams: jest.fn() };
jest.mock('expo-crypto', () => ({ randomUUID: () => 'stable-task-id' }));
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: 'signed-in', session: { user: { id: 'owner' } } },
  }),
}));
jest.mock('@/features/settings/profile-service', () => ({
  loadProfile: async () => ({ timezone: 'Asia/Manila' }),
}));
jest.mock('@/features/tasks/tasks-service', () => ({
  listTasks: (...args: unknown[]) => mockList(...args),
  getTask: (...args: unknown[]) => mockGet(...args),
}));
jest.mock('@/features/tasks/task-reminder-commands', () => ({
  createTaskWithReminders: (...args: unknown[]) => mockCreate(...args),
  editTaskWithReminders: jest.fn(),
  setTaskCompletedWithReminders: (...args: unknown[]) => mockComplete(...args),
  deleteTaskWithReminders: (...args: unknown[]) => mockDelete(...args),
}));
jest.mock('@/features/tasks/task-notifications', () => ({
  reminderWarning: (result: { status: string }) =>
    result.status === 'permission-denied'
      ? 'Notifications are disabled on this device. Enable them in Settings.'
      : result.status === 'error'
        ? 'Task reminder scheduling could not be confirmed. Open Settings to retry.'
        : '',
}));

const task = {
  id: 'task-id',
  user_id: 'owner',
  client_request_id: 'stable-task-id',
  title: 'Buy groceries',
  description: null,
  category: 'personal',
  priority: 'medium',
  due_at: null,
  completed_at: null,
  created_at: '2026-10-23T00:00:00Z',
  updated_at: '2026-10-23T00:00:00Z',
};

async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockList.mockResolvedValue({ tasks: [], hasMore: false });
});

describe('Tasks screen', () => {
  it('shows an empty state and creates with only a title using the same UUID on retry', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce({ task, reminder: { status: 'none', count: 0 } });
    await render(<TasksScreen />);
    expect(await screen.findByText('No tasks here')).toBeTruthy();
    await press('Add task');
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Task title'), 'Buy groceries');
    });
    await press('Create task');
    expect(await screen.findByText('Network failure')).toBeTruthy();
    await press('Create task');
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
    expect(mockCreate.mock.calls[0][1]).toBe('stable-task-id');
    expect(mockCreate.mock.calls[1][1]).toBe('stable-task-id');
  });

  it('shows a recoverable load error', async () => {
    mockList.mockRejectedValueOnce(new Error('Offline'));
    await render(<TasksScreen />);
    expect(await screen.findByText('Offline')).toBeTruthy();
    await press('Try again');
    expect(await screen.findByText('No tasks here')).toBeTruthy();
  });

  it('filters completed tasks and keeps a failed completion visible', async () => {
    mockList.mockResolvedValue({ tasks: [task], hasMore: false });
    mockComplete.mockRejectedValueOnce(new Error('Could not save'));
    await render(<TasksScreen />);
    expect(await screen.findByText('Buy groceries')).toBeTruthy();
    await press('Complete Buy groceries');
    expect(await screen.findByText('Could not save')).toBeTruthy();
    expect(screen.getByText('Buy groceries')).toBeTruthy();
    await press('completed');
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(
        'owner',
        expect.objectContaining({ filter: 'completed' }),
      ),
    );
  });

  it('requires confirmation before delete', async () => {
    mockList.mockResolvedValue({ tasks: [task], hasMore: false });
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<TasksScreen />);
    expect(await screen.findByText('Buy groceries')).toBeTruthy();
    await press('Delete Buy groceries');
    expect(spy).toHaveBeenCalledWith('Delete task?', expect.any(String), expect.any(Array));
    expect(mockDelete).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('opens the existing editor for a task selected in Today', async () => {
    mockParams = { editTaskId: 'task-id' };
    mockGet.mockResolvedValue(task);
    await render(<TasksScreen />);
    expect(await screen.findByText('Edit task')).toBeTruthy();
    expect(screen.getByLabelText('Task title').props.value).toBe('Buy groceries');
    expect(mockGet).toHaveBeenCalledWith('owner', 'task-id');
    expect(mockRouter.setParams).toHaveBeenCalledWith({ editTaskId: undefined });
  });

  it.each(['permission-denied', 'error'])(
    'keeps a saved task and shows %s reminder warning',
    async (status) => {
      mockCreate.mockResolvedValueOnce({
        task: { ...task, due_at: '2026-10-30T09:00:00Z' },
        reminder: { status, count: 0 },
      });
      await render(<TasksScreen />);
      await screen.findByText('No tasks here');
      await press('Add task');
      await act(async () => {
        fireEvent.changeText(screen.getByLabelText('Task title'), 'Buy groceries');
      });
      await act(async () => {
        fireEvent.changeText(screen.getByLabelText('Due date and time'), '2026-10-30 17:00');
      });
      await press('Create task');
      expect(await screen.findByText(/Task saved\./)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Task reminder settings' })).toBeTruthy();
    },
  );

  it('reuses a selected task already in the first Tasks page', async () => {
    mockParams = { editTaskId: 'task-id' };
    mockList.mockResolvedValue({ tasks: [task], hasMore: false });
    await render(<TasksScreen />);
    expect(await screen.findByText('Edit task')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});
