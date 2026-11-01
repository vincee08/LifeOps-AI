import { useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  cleanupLegacyAndroidTaskChannel,
  cleanupLegacyBillNotifications,
} from '@/features/notifications/legacy-bill-cleanup';
import { useAppTheme } from '@/hooks/useAppTheme';

export function LegacyBillNotificationCleanup() {
  const theme = useAppTheme();
  const { state } = useAuth();
  const [billWarning, setBillWarning] = useState(false);
  const [taskWarning, setTaskWarning] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    let done = false;
    let running = false;
    const run = async () => {
      if (done || running) return;
      running = true;
      try {
        await cleanupLegacyBillNotifications();
        done = true;
        if (active) setBillWarning(false);
      } catch {
        if (active) setBillWarning(true);
      } finally {
        running = false;
      }
    };
    void run();
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'active') void run();
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || state.status !== 'signed-out') return;
    let active = true;
    let done = false;
    let running = false;
    const run = async () => {
      if (done || running) return;
      running = true;
      try {
        await cleanupLegacyAndroidTaskChannel(true);
        done = true;
        if (active) setTaskWarning(false);
      } catch {
        if (active) setTaskWarning(true);
      } finally {
        running = false;
      }
    };
    void run();
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'active') void run();
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [state.status]);

  return billWarning || (state.status === 'signed-out' && taskWarning) ? (
    <View style={{ padding: theme.spacing.sm, backgroundColor: theme.colors.softPrimary }}>
      <AppText accessibilityRole="alert">
        Old notification channels could not be cleared. Reopen the app to retry.
      </AppText>
    </View>
  ) : null;
}
