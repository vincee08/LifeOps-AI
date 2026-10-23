import { userEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';

const mockAuth = {
  state: { status: 'signed-in', recovery: false, session: { user: { id: 'test-owner' } } },
  signOut: jest.fn(),
};
jest.mock('@/features/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockAuth,
}));
jest.mock('@/features/settings/profile-service', () => ({
  loadProfile: jest.fn(async () => ({
    id: 'test-owner',
    display_name: 'Tester',
    timezone: 'Asia/Manila',
    currency_code: 'PHP',
  })),
  updateProfile: jest.fn(),
}));

describe('application shell', () => {
  it('opens Today, navigates across tabs, and reaches Settings from the profile entry', async () => {
    await renderRouter('./app');

    expect(screen.getByText('What do I need to do today?')).toBeTruthy();
    for (const name of ['Today', 'Tasks', 'Money', 'Workout', 'AI']) {
      expect(screen.getByLabelText(`${name} tab`)).toBeTruthy();
    }
    await userEvent.press(screen.getByLabelText('Tasks tab'));
    expect(screen.getByText('A simple place for personal and work responsibilities.')).toBeTruthy();

    await userEvent.press(screen.getByLabelText('Open settings'));

    expect(await screen.findByText('Currency: PHP')).toBeTruthy();
    expect(screen.queryByLabelText('Settings tab')).toBeNull();
  }, 30_000);
});
