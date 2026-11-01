import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { getReminderInstallments } from './loans-service';
import { loanDueIdFromNotification, reconcileUpcomingLoanReminders } from './loan-notifications';
import { useAppTheme } from '@/hooks/useAppTheme';

export function LoanNotificationLifecycle({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const theme = useAppTheme();
  const lastResponse = useRef<string | null>(null);
  const [warning, setWarning] = useState('');
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    const reconcile = () => {
      void reconcileUpcomingLoanReminders(ownerId).then((result) => {
        if (active)
          setWarning(
            result.status === 'error'
              ? 'Loan reminders could not be checked. Open Settings to retry.'
              : result.status === 'permission-denied'
                ? 'Loan notifications are disabled on this device. Open Settings to enable them.'
                : result.status === 'unavailable'
                  ? 'Loan notifications are unavailable on this device.'
                  : '',
          );
      });
    };
    const handle = (response: Notifications.NotificationResponse) => {
      const dueId = loanDueIdFromNotification(response, ownerId);
      if (!dueId) return;
      const id = response.notification.request.identifier;
      if (lastResponse.current === id) return;
      lastResponse.current = id;
      void getReminderInstallments(ownerId, [dueId])
        .then((dues) => {
          const due = dues.find((item) => item.id === dueId && !item.archived_at && !item.paid_at);
          if (due)
            router.navigate({
              pathname: '/(tabs)/loans',
              params: { loanId: due.loan_id },
            });
          else
            Alert.alert(
              'Loan unavailable',
              'This due may have been settled, archived, or deleted.',
            );
        })
        .catch(() => Alert.alert('Loan unavailable', 'Open Loans to check your due dates.'));
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
