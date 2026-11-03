import { fireEvent, render, screen } from '@testing-library/react-native';
import { TodayWorkouts } from '@/features/today/TodayWorkouts';

const mockNavigate = jest.fn();
const mockList = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
  useFocusEffect: (effect: () => void) => {
    const React = require('react');
    React.useEffect(effect, [effect]);
  },
}));
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'signed-in', session: { user: { id: 'owner' } } } }),
}));
jest.mock('@/features/workout/workout-service', () => ({
  listTodayWorkouts: (...args: unknown[]) => mockList(...args),
}));
const window = { date: '2026-11-02', now: '', start: '', end: '', timezone: 'Asia/Manila' };

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockImplementation(async (_owner: string, _date: string, section: string) => ({
    items: [{ id: section, title: section === 'planned' ? 'Leg day' : 'Morning walk' }],
    total: 1,
    hasMore: false,
  }));
});

it('shows only source workouts for the profile-local day and opens their details', async () => {
  await render(<TodayWorkouts window={window} />);
  expect(await screen.findByText('Leg day')).toBeTruthy();
  expect(screen.getByText('Morning walk')).toBeTruthy();
  expect(mockList).toHaveBeenCalledWith('owner', '2026-11-02', 'planned');
  expect(mockList).toHaveBeenCalledWith('owner', '2026-11-02', 'completed');
  fireEvent.press(screen.getByRole('button', { name: 'Open Leg day workout' }));
  expect(mockNavigate).toHaveBeenCalledWith({
    pathname: '/(tabs)/workout',
    params: { workoutId: 'planned' },
  });
});

it('keeps the completed section usable when the planned query fails', async () => {
  mockList.mockImplementation(async (_owner: string, _date: string, section: string) => {
    if (section === 'planned') throw new Error('Planned unavailable');
    return { items: [{ id: 'done', title: 'Morning walk' }], total: 1, hasMore: false };
  });
  await render(<TodayWorkouts window={window} />);
  expect(await screen.findByText('Morning walk')).toBeTruthy();
  expect(screen.getByText('Planned unavailable')).toBeTruthy();
});
