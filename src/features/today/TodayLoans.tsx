import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { ErrorState, LoadingState } from '@/components/ui/StateView';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatPesos } from '@/features/loans/loans-model';
import { listTodayLoanInstallments, type LoanInstallment } from '@/features/loans/loans-service';
import type { TodayWindow } from './today-model';
import { useAppTheme } from '@/hooks/useAppTheme';

type Section = 'overdue' | 'today';
type Page = { items: LoanInstallment[]; total: number; hasMore: boolean };
export function TodayLoans({ window }: { window: TodayWindow }) {
  const theme = useAppTheme();
  const router = useRouter();
  const { state } = useAuth();
  const userId = state.status === 'signed-in' ? state.session.user.id : null;
  const [pages, setPages] = useState<Record<Section, Page | null>>({ overdue: null, today: null });
  const [errors, setErrors] = useState<Record<Section, string>>({ overdue: '', today: '' });
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const refresh = () => setReload((value) => value + 1);
  useFocusEffect(
    useCallback(() => {
      void reload;
      if (!userId) return;
      let active = true;
      setLoading(true);
      setErrors({ overdue: '', today: '' });
      void (async () => {
        const results = await Promise.allSettled([
          listTodayLoanInstallments(userId, window.date, 'overdue'),
          listTodayLoanInstallments(userId, window.date, 'today'),
        ]);
        if (!active) return;
        const nextPages: Record<Section, Page | null> = { overdue: null, today: null };
        const nextErrors = { overdue: '', today: '' };
        (['overdue', 'today'] as const).forEach((section, index) => {
          const result = results[index]!;
          if (result.status === 'fulfilled') nextPages[section] = result.value;
          else
            nextErrors[section] =
              result.reason instanceof Error
                ? result.reason.message
                : 'Loan dues could not be loaded.';
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
  return (
    <View style={{ gap: theme.spacing.lg }}>
      <AppText variant="title">Loan payments</AppText>
      <AppText tone="mutedText">Expected outside payments due today or overdue.</AppText>
      {loading ? <LoadingState label="Loading loan dues…" /> : null}
      {(['overdue', 'today'] as const).map((section) => {
        const page = pages[section];
        return (
          <View key={section} style={{ gap: theme.spacing.sm }}>
            {errors[section] ? (
              <ErrorState
                title={`${section} loans unavailable`}
                description={errors[section]}
                onRetry={refresh}
              />
            ) : null}
            {page && page.total > 0 ? (
              <>
                <AppText style={{ fontWeight: '700' }}>
                  {section === 'overdue' ? 'Overdue loan payments' : 'Loan payments due today'} (
                  {page.total})
                </AppText>
                {page.items.map((due) => (
                  <Pressable
                    key={due.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${due.title} loan due ${due.due_date}`}
                    onPress={() =>
                      router.navigate({
                        pathname: '/(tabs)/loans',
                        params: { loanId: due.loan_id },
                      })
                    }
                    style={({ pressed }) => ({
                      minHeight: 48,
                      padding: theme.spacing.md,
                      gap: theme.spacing.sm,
                      backgroundColor: theme.colors.surface,
                      borderWidth: 1,
                      borderColor:
                        section === 'overdue' ? theme.colors.danger : theme.colors.border,
                      borderRadius: theme.radius.md,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <AppText style={{ fontWeight: '700' }}>{due.title}</AppText>
                    <AppText>
                      {formatPesos(due.monthly_payment_centavos)} due {due.due_date}
                    </AppText>
                    <AppText tone="mutedText">Open loan to mark this installment paid.</AppText>
                  </Pressable>
                ))}
                {page.hasMore ? (
                  <AppText tone="mutedText">
                    Showing the first {page.items.length}. Open Loans for all dues.
                  </AppText>
                ) : null}
              </>
            ) : null}
          </View>
        );
      })}
      <AppButton
        label="View all loans"
        variant="secondary"
        onPress={() => router.navigate('/(tabs)/loans')}
      />
    </View>
  );
}
