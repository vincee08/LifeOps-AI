import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('@/lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

const mockAuth = {
  state: { status: 'signed-out' } as { status: string; session?: object; recovery?: boolean },
  retry: jest.fn(),
  signOut: jest.fn(),
};
jest.mock('@/features/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockAuth,
}));

describe('protected routes', () => {
  it('shows bootstrap state before deciding which screens are available', async () => {
    mockAuth.state = { status: 'loading' };
    await renderRouter('./app', { initialUrl: '/settings' });
    expect(screen.getByText('Restoring your session…')).toBeTruthy();
    expect(screen.queryByText('Settings')).toBeNull();
  }, 30_000);

  it('blocks protected Settings for a signed-out user', async () => {
    mockAuth.state = { status: 'signed-out' };
    await renderRouter('./app', { initialUrl: '/settings' });
    expect(await screen.findByText('Welcome back')).toBeTruthy();
    expect(screen.queryByText('Currency: PHP')).toBeNull();
  }, 30_000);

  it('shows only the reset form during password recovery', async () => {
    mockAuth.state = { status: 'signed-in', recovery: true, session: { user: { id: 'owner' } } };
    await renderRouter('./app', { initialUrl: '/settings' });
    expect(await screen.findByText('Choose a new password')).toBeTruthy();
    expect(screen.queryByText('Currency: PHP')).toBeNull();
  }, 30_000);
});
