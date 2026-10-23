import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockLoadProfile = jest.fn();
const mockUpdateProfile = jest.fn();
const mockSignOut = jest.fn();
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: 'signed-in', session: { user: { id: 'owner' } } },
    signOut: mockSignOut,
  }),
}));
jest.mock('@/features/settings/profile-service', () => ({
  loadProfile: (...args: unknown[]) => mockLoadProfile(...args),
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
}));

import { SettingsScreen } from '@/features/settings/SettingsScreen';

const profile = {
  id: 'owner',
  display_name: 'Alice',
  timezone: 'Asia/Manila',
  currency_code: 'PHP',
};
beforeEach(() => {
  jest.clearAllMocks();
  mockLoadProfile.mockResolvedValue(profile);
  mockUpdateProfile.mockResolvedValue({ ...profile, display_name: 'Alicia' });
  mockSignOut.mockResolvedValue(undefined);
});

it('loads and updates the signed-in owner profile, then signs out', async () => {
  await render(<SettingsScreen />);
  await waitFor(() => expect(screen.getByDisplayValue('Alice')).toBeTruthy());
  expect(mockLoadProfile).toHaveBeenCalledWith('owner');
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('Display name'), 'Alicia');
  });
  fireEvent.press(screen.getByText('Save profile'));
  await waitFor(() => expect(screen.getByText('Profile saved.')).toBeTruthy());
  expect(mockUpdateProfile).toHaveBeenCalledWith('owner', 'Alicia', 'Asia/Manila');
  fireEvent.press(screen.getByText('Sign out'));
  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
});

it('shows a recoverable profile loading error', async () => {
  mockLoadProfile.mockReset();
  mockLoadProfile.mockRejectedValueOnce(new Error('offline'));
  await render(<SettingsScreen />);
  await waitFor(() =>
    expect(screen.getByText('Profile could not be loaded. Please try again.')).toBeTruthy(),
  );
  expect(screen.getByText('Try again')).toBeTruthy();
});
