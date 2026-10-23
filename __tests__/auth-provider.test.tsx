import type { Session } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import { Button, Text } from 'react-native';

const mockLinking = jest.mocked(Linking);
const mockAuth = {
  getSession: jest.fn(),
  onAuthStateChange: jest.fn(),
  setSession: jest.fn(),
  signOut: jest.fn(),
};
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(),
  addEventListener: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ auth: mockAuth }) }));

import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';

const session = { user: { id: 'owner' } } as Session;

function Probe() {
  const { state, signOut } = useAuth();
  return (
    <>
      <Text>{state.status === 'signed-in' && state.recovery ? 'recovery' : state.status}</Text>
      <Button title="Sign out" onPress={() => void signOut()} />
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLinking.getInitialURL.mockResolvedValue(null);
  mockLinking.addEventListener.mockReturnValue({ remove: jest.fn() });
  mockAuth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: jest.fn() } },
  });
  mockAuth.signOut.mockResolvedValue({ error: null });
});

describe('auth bootstrap', () => {
  it('holds loading until encrypted session restoration completes, then signs out', async () => {
    let resolveSession: (value: { data: { session: Session | null }; error: null }) => void = () =>
      undefined;
    mockAuth.getSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('loading')).toBeTruthy();
    await act(async () => resolveSession({ data: { session }, error: null }));
    await waitFor(() => expect(screen.getByText('signed-in')).toBeTruthy());
    fireEvent.press(screen.getByText('Sign out'));
    await waitFor(() => expect(screen.getByText('signed-out')).toBeTruthy());
    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
  });

  it('restores a recovery link into reset-only state', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mockLinking.getInitialURL.mockResolvedValue(
      'lifeopsai://auth/callback#access_token=a&refresh_token=b&type=recovery',
    );
    mockAuth.setSession.mockResolvedValue({ data: { session }, error: null });
    await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('recovery')).toBeTruthy());
    expect(mockAuth.setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'b' });
  });

  it('rejects an incomplete account link without creating a session', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mockLinking.getInitialURL.mockResolvedValue(
      'lifeopsai://auth/callback#access_token=a&type=recovery',
    );
    await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('signed-out')).toBeTruthy());
    expect(mockAuth.setSession).not.toHaveBeenCalled();
  });
});
