import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { cleanupLegacyAndroidTaskChannel } from '@/features/notifications/legacy-bill-cleanup';
import {
  reconcileUpcomingTaskReminders,
  taskIdFromNotification,
} from '@/features/tasks/task-notifications';
import { getTask } from '@/features/tasks/tasks-service';
import { useAppTheme } from '@/hooks/useAppTheme';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function openTaskNotification(
  response: Notifications.NotificationResponse,
  ownerId: string,
  navigate: (taskId: string) => void,
  missing: () => void,
): Promise<void> {
  const taskId = taskIdFromNotification(response, ownerId);
  if (!taskId) return;
  try {
    const task = await getTask(ownerId, taskId);
    if (task) navigate(taskId);
    else missing();
  } catch {
    missing();
  }
}

export function TaskNotificationLifecycle({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const theme = useAppTheme();
  const lastResponse = useRef<string | null>(null);
  const [warning, setWarning] = useState('');

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    const reconcile = () => {
      void (async () => {
        const result = await reconcileUpcomingTaskReminders(ownerId);
        if (result.status === 'error') throw new Error('Task reconciliation failed.');
        try {
          await cleanupLegacyAndroidTaskChannel();
        } catch {
          if (active)
            setWarning(
              'Old Task notification channel could not be cleared. Reopen the app to retry.',
            );
          return;
        }
        if (active) setWarning('');
      })().catch(() => {
        if (active) setWarning('Task reminders could not be checked. Reopen the app to retry.');
      });
    };
    const handle = (response: Notifications.NotificationResponse) => {
      if (!taskIdFromNotification(response, ownerId)) return;
      const id = response.notification.request.identifier;
      if (lastResponse.current === id) return;
      lastResponse.current = id;
      void openTaskNotification(
        response,
        ownerId,
        (taskId) => router.navigate({ pathname: '/(tabs)/tasks', params: { editTaskId: taskId } }),
        () =>
          Alert.alert(
            'Task unavailable',
            'This task may have been deleted or is no longer accessible.',
          ),
      );
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };
    reconcile();
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') reconcile();
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (active && response) handle(response);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      appState.remove();
      subscription.remove();
    };
  }, [ownerId, router]);

  return warning ? (
    <View style={{ padding: theme.spacing.sm, backgroundColor: theme.colors.softPrimary }}>
      <AppText accessibilityRole="alert">{warning}</AppText>
    </View>
  ) : null;
}
