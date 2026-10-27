import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { ErrorState, LoadingState } from '@/components/ui/StateView';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  billReminderWarning,
  reconcileUpcomingBillReminders,
} from '@/features/money/bill-notifications';
import { formatPesos } from '@/features/money/bills-model';
import {
  generateBillOccurrences,
  listTodayBillItems,
  setBillPaid,
  type BillItem,
} from '@/features/money/bills-service';
import type { TodayWindow } from '@/features/today/today-model';
import { useAppTheme } from '@/hooks/useAppTheme';
import { randomUUID } from 'expo-crypto';

type Section = 'overdue' | 'today';
type Page = { items: BillItem[]; total: number; hasMore: boolean };

export function TodayBills({ window }: { window: TodayWindow }) {
  const theme = useAppTheme();
  const router = useRouter();
  const { state } = useAuth();
  const userId = state.status === 'signed-in' ? state.session.user.id : null;
  const [pages, setPages] = useState<Record<Section, Page | null>>({ overdue: null, today: null });
  const [errors, setErrors] = useState<Record<Section, string>>({ overdue: '', today: '' });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const refresh = () => setReload((value) => value + 1);

  useFocusEffect(
    useCallback(() => {
      void reload; // Re-fetch after a paid status change or Retry.
      if (!userId) return;
      let active = true;
      setLoading(true);
      setPages({ overdue: null, today: null });
      setErrors({ overdue: '', today: '' });
      void (async () => {
        try {
          await generateBillOccurrences();
        } catch {
          if (active) {
            setErrors({
              overdue: 'Bill cycles could not be refreshed. Retry to load Today bills.',
              today: 'Bill cycles could not be refreshed. Retry to load Today bills.',
            });
            setLoading(false);
          }
          return;
        }
        const results = await Promise.allSettled([
          listTodayBillItems(userId, window.date, 'overdue'),
          listTodayBillItems(userId, window.date, 'today'),
        ]);
        if (!active) return;
        const nextPages: Record<Section, Page | null> = { overdue: null, today: null };
        const nextErrors = { overdue: '', today: '' };
        (['overdue', 'today'] as const).forEach((section, index) => {
          const result = results[index]!;
          if (result.status === 'fulfilled') nextPages[section] = result.value;
          else
            nextErrors[section] =
              result.reason instanceof Error ? result.reason.message : 'Bills could not be loaded.';
        });
        setPages(nextPages);
        setErrors(nextErrors);
        setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [userId, window.date, reload]),
  );

  async function markPaid(item: BillItem) {
    if (!userId || busyId) return;
    setBusyId(item.occurrence.id);
    setNotice('');
    try {
      await setBillPaid(randomUUID(), item.occurrence.id, true);
      const reminder = await reconcileUpcomingBillReminders(userId);
      setNotice(billReminderWarning(reminder));
      refresh();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Bill could not be updated.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <AppText variant="title">Bills / Payments</AppText>
      <AppText tone="mutedText">Outside payments due today or overdue.</AppText>
      {loading ? <LoadingState label="Loading today’s bills…" /> : null}
      {notice ? <AppText accessibilityRole="alert">{notice}</AppText> : null}
      {(['overdue', 'today'] as const).map((section) => {
        const page = pages[section];
        return (
          <View key={section} style={{ gap: theme.spacing.sm }}>
            {errors[section] ? (
              <ErrorState
                title={`${section} bills unavailable`}
                description={errors[section]}
                onRetry={refresh}
              />
            ) : null}
            {page && page.total > 0 ? (
              <>
                <AppText style={{ fontWeight: '700' }}>
                  {section === 'overdue' ? 'Overdue bills' : 'Bills due today'} ({page.total})
                </AppText>
                {page.items.map((item) => (
                  <View
                    key={item.occurrence.id}
                    style={{
                      padding: theme.spacing.md,
                      gap: theme.spacing.sm,
                      backgroundColor: theme.colors.surface,
                      borderWidth: 1,
                      borderColor:
                        section === 'overdue' ? theme.colors.danger : theme.colors.border,
                      borderRadius: theme.radius.md,
                    }}
                  >
                    <AppText style={{ fontWeight: '700' }}>{item.bill.title}</AppText>
                    <AppText>
                      {formatPesos(item.occurrence.amount_minor)} · Due {item.occurrence.due_on}
                    </AppText>
                    <AppButton
                      label={`Mark ${item.bill.title} paid`}
                      variant="secondary"
                      submitting={busyId === item.occurrence.id}
                      disabled={busyId !== null && busyId !== item.occurrence.id}
                      onPress={() => void markPaid(item)}
                    />
                  </View>
                ))}
                {page.hasMore ? (
                  <AppText tone="mutedText">
                    Showing the first {page.items.length}. Open Money for all bills.
                  </AppText>
                ) : null}
              </>
            ) : null}
          </View>
        );
      })}
      <AppButton
        label="View all bills"
        variant="secondary"
        onPress={() => router.navigate('/(tabs)/money')}
      />
    </View>
  );
}
