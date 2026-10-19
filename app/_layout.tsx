import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { ErrorState } from '@/components/ui/StateView';
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

export default function RootLayout() {
  const theme = useAppTheme();

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
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
