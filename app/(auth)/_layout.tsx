import { Stack } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';
import { useAppTheme } from '@/hooks/useAppTheme';

export default function AuthLayout() {
  const theme = useAppTheme();
  const { state } = useAuth();
  const recovery = state.status === 'signed-in' && state.recovery;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Protected guard={!recovery} redirectTo="/reset-password">
        <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
        <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
        <Stack.Screen name="forgot-password" options={{ title: 'Forgot password' }} />
      </Stack.Protected>
      <Stack.Protected guard={recovery} redirectTo="/sign-in">
        <Stack.Screen name="reset-password" options={{ title: 'Reset password' }} />
      </Stack.Protected>
    </Stack>
  );
}
