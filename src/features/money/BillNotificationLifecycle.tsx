import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import {
  billOccurrenceIdFromNotification,
  reconcileUpcomingBillReminders,
} from '@/features/money/bill-notifications';
import { getReminderBillItems } from '@/features/money/bills-service';
import { useAppTheme } from '@/hooks/useAppTheme';

export function BillNotificationLifecycle({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const theme = useAppTheme();
  const lastResponse = useRef<string | null>(null);
  const [warning, setWarning] = useState('');

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    const reconcile = () => {
      void reconcileUpcomingBillReminders(ownerId).then((result) => {
        if (active)
          setWarning(
            result.status === 'error'
              ? 'Bill reminders could not be checked. Open Settings to retry.'
              : result.status === 'permission-denied'
                ? 'Bill notifications are disabled on this device. Open Settings to enable them.'
                : result.status === 'unavailable'
                  ? 'Bill notifications are unavailable on this device.'
                  : '',
          );
      });
    };
    const handle = (response: Notifications.NotificationResponse) => {
      const occurrenceId = billOccurrenceIdFromNotification(response, ownerId);
      if (!occurrenceId) return;
      const id = response.notification.request.identifier;
      if (lastResponse.current === id) return;
      lastResponse.current = id;
      void getReminderBillItems(ownerId, [occurrenceId])
        .then((items) => {
          if (items.some((item) => item.occurrence.id === occurrenceId))
            router.navigate('/(tabs)/money');
          else Alert.alert('Bill unavailable', 'This bill may have been archived or deleted.');
        })
        .catch(() => Alert.alert('Bill unavailable', 'Open Money to check your bills.'));
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
