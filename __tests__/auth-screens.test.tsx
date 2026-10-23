import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockResend = jest.fn();
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: 'signed-out' },
    finishRecovery: jest.fn(),
  }),
}));
jest.mock('@/features/auth/auth-service', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signUp: (...args: unknown[]) => mockSignUp(...args),
  resendVerification: (...args: unknown[]) => mockResend(...args),
  sendPasswordReset: jest.fn(),
  updatePassword: jest.fn(),
  authErrorMessage: () => 'Email or password is incorrect.',
}));

import { SignInScreen, SignUpScreen } from '@/features/auth/AuthScreens';

beforeEach(() => jest.clearAllMocks());

it('shows a safe sign-in error and keeps the form usable', async () => {
  mockSignIn.mockRejectedValue(new Error('Invalid login credentials'));
  await render(<SignInScreen />);
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('Email'), ' A@Example.Test ');
    fireEvent.changeText(screen.getByLabelText('Password'), 'password123');
  });
  fireEvent.press(screen.getByText('Sign in'));
  await waitFor(() => expect(screen.getByText('Email or password is incorrect.')).toBeTruthy());
  expect(mockSignIn).toHaveBeenCalledWith('a@example.test', 'password123');
  expect(screen.getByText('Sign in')).toBeTruthy();
});

it('shows check-email state when sign-up requires verification', async () => {
  mockSignUp.mockResolvedValue('check-email');
  await render(<SignUpScreen />);
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('Email'), 'a@example.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'password123');
  });
  fireEvent.press(screen.getByText('Create account'));
  await waitFor(() =>
    expect(screen.getByText('Check your email to verify your account.')).toBeTruthy(),
  );
  mockResend.mockResolvedValue(undefined);
  fireEvent.press(screen.getByText('Resend verification email'));
  await waitFor(() => expect(mockResend).toHaveBeenCalledWith('a@example.test'));
});
