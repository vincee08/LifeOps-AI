import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  authErrorMessage,
  resendVerification,
  sendPasswordReset,
  signIn,
  signUp,
  updatePassword,
} from '@/features/auth/auth-service';
import { useAppTheme } from '@/hooks/useAppTheme';

type Mode = 'sign-in' | 'sign-up' | 'forgot' | 'reset';

function AuthForm({ mode }: { mode: Mode }) {
  const theme = useAppTheme();
  const { state, finishRecovery } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const title = {
    'sign-in': 'Welcome back',
    'sign-up': 'Create your account',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
  }[mode];
  const action = {
    'sign-in': 'Sign in',
    'sign-up': 'Create account',
    forgot: 'Send reset email',
    reset: 'Save new password',
  }[mode];

  async function submit() {
    if (submitting) return;
    setError('');
    setSuccess('');
    const normalizedEmail = email.trim().toLowerCase();
    if (mode !== 'reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (mode !== 'forgot' && password.length < 8) {
      setError('Password must have at least 8 characters.');
      return;
    }
    if (mode === 'reset' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (mode === 'reset' && (state.status !== 'signed-in' || !state.recovery)) {
      setError('Open a valid password reset email link first.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'sign-in') await signIn(normalizedEmail, password);
      if (mode === 'sign-up') {
        const result = await signUp(normalizedEmail, password);
        if (result === 'check-email') setSuccess('Check your email to verify your account.');
      }
      if (mode === 'forgot') {
        await sendPasswordReset(normalizedEmail);
        setSuccess('If an account exists, a reset email will arrive shortly.');
      }
      if (mode === 'reset') {
        await updatePassword(password);
        finishRecovery();
      }
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    if (submitting) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await resendVerification(normalizedEmail);
      setSuccess('If the account needs verification, a new email will arrive shortly.');
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <View style={{ gap: theme.spacing.md }}>
          <AppText variant="display">{title}</AppText>
          <AppText tone="mutedText">LifeOps AI keeps your day and account private.</AppText>
        </View>
        {mode !== 'reset' ? (
          <View style={{ gap: theme.spacing.sm }}>
            <AppText>Email</AppText>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              editable={!submitting}
              style={{
                minHeight: 48,
                padding: theme.spacing.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surface,
                color: theme.colors.text,
              }}
            />
          </View>
        ) : null}
        {mode !== 'forgot' ? (
          <View style={{ gap: theme.spacing.sm }}>
            <AppText>{mode === 'reset' ? 'New password' : 'Password'}</AppText>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surface,
              }}
            >
              <TextInput
                accessibilityLabel={mode === 'reset' ? 'New password' : 'Password'}
                secureTextEntry={!visible}
                textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                value={password}
                onChangeText={setPassword}
                editable={!submitting}
                style={{
                  flex: 1,
                  minHeight: 48,
                  padding: theme.spacing.md,
                  color: theme.colors.text,
                }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={visible ? 'Hide password' : 'Show password'}
                onPress={() => setVisible(!visible)}
                style={{
                  minWidth: 48,
                  minHeight: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppText tone="primary">{visible ? 'Hide' : 'Show'}</AppText>
              </Pressable>
            </View>
          </View>
        ) : null}
        {mode === 'reset' ? (
          <View style={{ gap: theme.spacing.sm }}>
            <AppText>Confirm new password</AppText>
            <TextInput
              accessibilityLabel="Confirm new password"
              secureTextEntry={!visible}
              textContentType="newPassword"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!submitting}
              style={{
                minHeight: 48,
                padding: theme.spacing.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surface,
                color: theme.colors.text,
              }}
            />
          </View>
        ) : null}
        {error ? (
          <AppText tone="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
        {success ? <AppText accessibilityRole="alert">{success}</AppText> : null}
        <AppButton label={action} submitting={submitting} onPress={() => void submit()} />
        {(mode === 'sign-up' && !!success) ||
        (mode === 'sign-in' && error === 'Check your email to verify your account.') ? (
          <AppButton
            label="Resend verification email"
            variant="secondary"
            disabled={submitting}
            onPress={() => void resend()}
          />
        ) : null}
        {mode === 'sign-in' ? (
          <View style={{ gap: theme.spacing.md }}>
            <Link href="/forgot-password" asChild>
              <AppButton label="Forgot password?" variant="secondary" />
            </Link>
            <Link href="/sign-up" asChild>
              <AppButton label="Create an account" variant="secondary" />
            </Link>
          </View>
        ) : null}
        {mode === 'sign-up' || mode === 'forgot' ? (
          <Link href="/sign-in" asChild>
            <AppButton label="Back to sign in" variant="secondary" />
          </Link>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

export function SignInScreen() {
  return <AuthForm mode="sign-in" />;
}
export function SignUpScreen() {
  return <AuthForm mode="sign-up" />;
}
export function ForgotPasswordScreen() {
  return <AuthForm mode="forgot" />;
}
export function ResetPasswordScreen() {
  return <AuthForm mode="reset" />;
}
