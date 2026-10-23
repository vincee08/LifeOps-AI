const mockClient = {
  auth: {
    getSession: jest.fn(),
    signInWithPassword: jest.fn(),
    signUp: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    resend: jest.fn(),
    updateUser: jest.fn(),
  },
};
jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => mockClient }));

import {
  AUTH_CALLBACK_URL,
  authErrorMessage,
  parseAuthCallback,
  restoreSession,
  sendPasswordReset,
  resendVerification,
  signIn,
  signUp,
  updatePassword,
} from '@/features/auth/auth-service';

beforeEach(() => jest.clearAllMocks());

describe('auth service', () => {
  it('restores an existing session and propagates restoration failure', async () => {
    const session = { user: { id: 'owner' } };
    mockClient.auth.getSession.mockResolvedValueOnce({ data: { session }, error: null });
    await expect(restoreSession(mockClient as never)).resolves.toBe(session);
    mockClient.auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new Error('offline'),
    });
    await expect(restoreSession(mockClient as never)).rejects.toThrow('offline');
  });

  it('handles sign-in failures without leaking credentials through UI messages', async () => {
    mockClient.auth.signInWithPassword.mockResolvedValueOnce({
      error: new Error('Invalid login credentials'),
    });
    await expect(signIn('a@example.test', 'private-password')).rejects.toThrow();
    expect(mockClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@example.test',
      password: 'private-password',
    });
    expect(authErrorMessage(new Error('Invalid login credentials'))).toBe(
      'Email or password is incorrect.',
    );
    expect(authErrorMessage(new Error('server echoed private-password'))).not.toContain(
      'private-password',
    );
  });

  it('distinguishes pending email verification from immediate session and sends reset redirect', async () => {
    mockClient.auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    mockClient.auth.signUp.mockResolvedValueOnce({ data: { session: {} }, error: null });
    await expect(signUp('a@example.test', 'password123')).resolves.toBe('check-email');
    await expect(signUp('b@example.test', 'password123')).resolves.toBe('verified');
    expect(mockClient.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: AUTH_CALLBACK_URL,
          data: { timezone: expect.any(String) },
        }),
      }),
    );
    mockClient.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await sendPasswordReset('a@example.test');
    expect(mockClient.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@example.test', {
      redirectTo: AUTH_CALLBACK_URL,
    });
    mockClient.auth.resend.mockResolvedValue({ error: null });
    await resendVerification('a@example.test');
    expect(mockClient.auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'a@example.test',
      options: { emailRedirectTo: AUTH_CALLBACK_URL },
    });
    mockClient.auth.updateUser.mockResolvedValue({ error: null });
    await updatePassword('new-password');
    expect(mockClient.auth.updateUser).toHaveBeenCalledWith({ password: 'new-password' });
  });

  it('accepts only exact account callbacks with complete tokens and a known type', () => {
    expect(
      parseAuthCallback('lifeopsai://auth/callback#access_token=a&refresh_token=b&type=recovery'),
    ).toEqual({ kind: 'session', accessToken: 'a', refreshToken: 'b', recovery: true });
    expect(
      parseAuthCallback('lifeopsai://auth/callback#access_token=a&refresh_token=b&type=signup'),
    ).toEqual({ kind: 'session', accessToken: 'a', refreshToken: 'b', recovery: false });
    for (const url of [
      'https://evil.test/auth/callback#access_token=a&refresh_token=b&type=signup',
      'lifeopsai://auth/other#access_token=a&refresh_token=b&type=signup',
      'lifeopsai://auth/callback#access_token=a&type=recovery',
      'lifeopsai://auth/callback#error=access_denied',
      'not a url',
    ])
      expect(parseAuthCallback(url)).toEqual({ kind: 'error' });
  });
});
