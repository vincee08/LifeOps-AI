import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { ErrorState, LoadingState } from '@/components/ui/StateView';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { useAppTheme } from '@/hooks/useAppTheme';

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const theme = useAppTheme();

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        padding: theme.spacing.xl,
        backgroundColor: theme.colors.background,
      }}
    >
      <ErrorState
        description="The screen could not load. Check any action in progress before trying again."
        onRetry={retry}
      />
    </View>
  );
}

function RootNavigator() {
  const theme = useAppTheme();
  const { state, retry } = useAuth();

  if (state.status === 'loading' || state.status === 'configuration-error') {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: theme.spacing.xl,
          backgroundColor: theme.colors.background,
        }}
      >
        {state.status === 'loading' ? (
          <LoadingState label="Restoring your session…" />
        ) : (
          <ErrorState
            title="Connection not configured"
            description="Add your development Supabase URL and publishable key, then retry."
            onRetry={retry}
          />
        )}
      </View>
    );
  }

  const canUseApp = state.status === 'signed-in' && !state.recovery;
  const canUseAuth = state.status === 'signed-out' || state.recovery;

  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Protected
          guard={canUseApp}
          redirectTo={
            state.status === 'signed-in' && state.recovery ? '/reset-password' : '/sign-in'
          }
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack.Protected>
        <Stack.Protected guard={canUseAuth} redirectTo="/">
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" options={{ title: 'Account link' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
