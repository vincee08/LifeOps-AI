import { randomUUID } from 'expo-crypto';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import { useAuth } from '@/features/auth/AuthProvider';
import { loadProfile } from '@/features/settings/profile-service';
import { getTodayWindow } from '@/features/today/today-model';
import { useAppTheme } from '@/hooks/useAppTheme';
import { loanReminderWarning, reconcileUpcomingLoanReminders } from './loan-notifications';
import { formatPesos, loanStatus, pesoInputFromMinor, remainingMonths } from './loans-model';
import {
  archiveLoan,
  createLoan,
  deleteLoan,
  editLoan,
  getLoan,
  getNextLoanPayment,
  listLoanInstallments,
  listLoans,
  markInstallmentPaid,
  setInstallmentPaid,
  type Loan,
  type LoanDraft,
  type LoanInstallment,
} from './loans-service';

const emptyDraft: LoanDraft = {
  title: '',
  monthlyPayment: '',
  firstDueDate: '',
  totalMonths: '',
  notes: '',
};
function displayDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value + 'T12:00:00Z'));
}
function LoanFormField({
  label,
  value,
  change,
  busy,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
  busy: boolean;
  keyboardType?: 'decimal-pad' | 'number-pad' | 'numbers-and-punctuation';
  multiline?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText>{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={change}
        editable={!busy}
        keyboardType={keyboardType}
        multiline={multiline}
        style={{
          minHeight: 48,
          padding: theme.spacing.md,
          color: theme.colors.text,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radius.md,
        }}
      />
    </View>
  );
}
function LoanSummary({ loan, localDate }: { loan: Loan; localDate: string }) {
  const theme = useAppTheme();
  const nextLabel = loan.next_due_date
    ? `${displayDate(loan.next_due_date)}${loan.next_due_date < localDate ? ' Â· Overdue' : ''}`
    : 'Paid Off';
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="title">{loan.title}</AppText>
      <AppText style={{ fontWeight: '700' }}>
        {formatPesos(loan.monthly_payment_centavos)} / month
      </AppText>
      <AppText>Earliest unpaid: {nextLabel}</AppText>
      <AppText>
        {loan.paid_months} of {loan.total_months} months paid
      </AppText>
      <AppText>Total months: {loan.total_months}</AppText>
      <AppText style={{ fontWeight: '700' }}>{remainingMonths(loan)} months remaining</AppText>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: loan.total_months, now: loan.paid_months }}
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: theme.colors.border,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${(loan.paid_months / loan.total_months) * 100}%`,
            height: 8,
            backgroundColor: theme.colors.primary,
          }}
        />
      </View>
      <AppText tone="mutedText">Status: {loanStatus(loan)}</AppText>
    </View>
  );
}

function HistoryRow({
  item,
  section,
  archived,
  busy,
  markPaid,
  correctPaid,
}: {
  item: LoanInstallment;
  section: 'overdue' | 'paid';
  archived: boolean;
  busy: boolean;
  markPaid: (id: string) => void;
  correctPaid: (id: string) => void;
}) {
  const theme = useAppTheme();
  return (
    <View
      style={{
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
        borderWidth: 1,
        borderColor: section === 'overdue' ? theme.colors.danger : theme.colors.border,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
      }}
    >
      <AppText style={{ fontWeight: '700' }}>Installment {item.installment_number}</AppText>
      <AppText>
        {displayDate(item.due_date)} Â· {formatPesos(item.monthly_payment_centavos)} Â·{' '}
        {section === 'overdue' ? 'Overdue' : 'Paid'}
      </AppText>
      {!archived && section === 'overdue' ? (
        <AppButton
          label={`Mark installment ${item.installment_number} paid`}
          variant="secondary"
          submitting={busy}
          onPress={() => markPaid(item.id)}
        />
      ) : null}
      {!archived && section === 'paid' ? (
        <AppButton
          label={`Correct installment ${item.installment_number}`}
          variant="secondary"
          disabled={busy}
          onPress={() => correctPaid(item.id)}
        />
      ) : null}
    </View>
  );
}

export function LoansScreen({ initialLoanId }: { initialLoanId?: string }) {
  const theme = useAppTheme();
  const router = useRouter();
  const { state } = useAuth();
  const userId = state.status === 'signed-in' ? state.session.user.id : null;
  const [selectedId, setSelectedId] = useState<string | null>(initialLoanId || null);
  const [archived, setArchived] = useState(false);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [nextPayment, setNextPayment] = useState<LoanInstallment | null>(null);
  const [overdue, setOverdue] = useState<LoanInstallment[]>([]);
  const [paid, setPaid] = useState<LoanInstallment[]>([]);
  const [listPage, setListPage] = useState(0);
  const [listMore, setListMore] = useState(false);
  const [overduePage, setOverduePage] = useState(0);
  const [paidPage, setPaidPage] = useState(0);
  const [overdueMore, setOverdueMore] = useState(false);
  const [paidMore, setPaidMore] = useState(false);
  const [localDate, setLocalDate] = useState('');
  const [mode, setMode] = useState<'create' | 'edit' | null>(null);
  const [draft, setDraft] = useState<LoanDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const requestId = useRef<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((v) => v + 1), []);

  useFocusEffect(
    useCallback(() => {
      void reload;
      if (!userId) return;
      let active = true;
      setLoading(true);
      setError('');
      void (async () => {
        try {
          const profile = await loadProfile(userId);
          const today = getTodayWindow(Date.now(), profile.timezone).date;
          if (selectedId) {
            const [record, upcoming, overdueResult, paidResult] = await Promise.all([
              getLoan(userId, selectedId),
              getNextLoanPayment(userId, selectedId, today),
              listLoanInstallments(userId, selectedId, 'overdue', today),
              listLoanInstallments(userId, selectedId, 'paid', today),
            ]);
            if (active) {
              setLoan(record);
              setNextPayment(upcoming);
              setOverdue(overdueResult.items);
              setPaid(paidResult.items);
              setOverduePage(0);
              setPaidPage(0);
              setOverdueMore(overdueResult.hasMore);
              setPaidMore(paidResult.hasMore);
              if (!record) setError('Loan is unavailable.');
            }
          } else {
            const page = await listLoans(userId, archived);
            if (active) {
              setLoans(page.items);
              setListPage(0);
              setListMore(page.hasMore);
            }
          }
          if (active) setLocalDate(today);
        } catch (caught) {
          if (active)
            setError(caught instanceof Error ? caught.message : 'Loans could not be loaded.');
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [userId, selectedId, archived, reload]),
  );

  function change(key: keyof LoanDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function openCreate() {
    requestId.current = randomUUID();
    setDraft({ ...emptyDraft, firstDueDate: localDate });
    setMode('create');
    setError('');
  }
  function openEdit() {
    if (!loan) return;
    setDraft({
      title: loan.title,
      monthlyPayment: pesoInputFromMinor(loan.monthly_payment_centavos),
      firstDueDate: loan.first_due_date,
      totalMonths: String(loan.total_months),
      notes: loan.notes ?? '',
    });
    setMode('edit');
    setError('');
  }
  async function run(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      if (userId) {
        const reminder = await reconcileUpcomingLoanReminders(userId);
        setNotice(loanReminderWarning(reminder));
      }
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Loan change could not be saved.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function save() {
    if (!userId) return;
    void run(async () => {
      if (mode === 'create') {
        if (!requestId.current) requestId.current = randomUUID();
        const id = await createLoan(requestId.current, userId, draft);
        setMode(null);
        setSelectedId(id);
      } else if (mode === 'edit' && loan) {
        await editLoan(userId, loan, draft);
        setMode(null);
      }
    });
  }
  function markPaid(id: string) {
    if (!userId) return;
    Alert.alert(
      'Mark as paid?',
      'Confirm that this monthly installment was paid outside LifeOps AI.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark as paid', onPress: () => run(() => markInstallmentPaid(id)) },
      ],
    );
  }
  function correctPaid(id: string) {
    if (!userId) return;
    Alert.alert('Correct installment?', 'This will return the installment to unpaid.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark unpaid', onPress: () => void run(() => setInstallmentPaid(id, false)) },
    ]);
  }
  function archive() {
    if (!userId || !loan) return;
    Alert.alert('Archive loan?', 'Its installment history will remain available.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        onPress: () =>
          void run(async () => {
            await archiveLoan(userId, loan.id);
            setSelectedId(null);
          }),
      },
    ]);
  }
  function remove() {
    if (!userId || !loan) return;
    Alert.alert('Delete loan?', 'This removes the loan and its unpaid installments.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await deleteLoan(userId, loan.id);
            setSelectedId(null);
          }),
      },
    ]);
  }
  async function moreLoans() {
    if (!userId || busyRef.current) return;
    setBusy(true);
    try {
      const page = await listLoans(userId, archived, listPage + 1);
      setLoans((items) => [...items, ...page.items]);
      setListPage((v) => v + 1);
      setListMore(page.hasMore);
    } catch {
      setError('More loans could not be loaded.');
    } finally {
      setBusy(false);
    }
  }
  async function moreInstallments(section: 'overdue' | 'paid') {
    if (!userId || !selectedId || busyRef.current) return;
    setBusy(true);
    try {
      const pageNumber = (section === 'overdue' ? overduePage : paidPage) + 1;
      const page = await listLoanInstallments(userId, selectedId, section, localDate, pageNumber);
      if (section === 'overdue') {
        setOverdue((items) => [...items, ...page.items]);
        setOverduePage(pageNumber);
        setOverdueMore(page.hasMore);
      } else {
        setPaid((items) => [...items, ...page.items]);
        setPaidPage(pageNumber);
        setPaidMore(page.hasMore);
      }
    } catch {
      setError(`More ${section} installments could not be loaded.`);
    } finally {
      setBusy(false);
    }
  }
  function back() {
    setMode(null);
    setSelectedId(null);
    router.setParams({ loanId: '' });
  }

  if (selectedId && !mode) {
    type DetailItem =
      | { kind: 'overdue' | 'paid'; installment: LoanInstallment }
      | { kind: 'more-overdue' | 'paid-heading' | 'more-paid' };
    const detailItems: DetailItem[] = [
      ...overdue.map((installment): DetailItem => ({ kind: 'overdue', installment })),
      ...(overdueMore ? [{ kind: 'more-overdue' as const }] : []),
      { kind: 'paid-heading' },
      ...paid.map((installment): DetailItem => ({ kind: 'paid', installment })),
      ...(paidMore ? [{ kind: 'more-paid' as const }] : []),
    ];
    const currentLoan = loan?.id === selectedId ? loan : null;
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <FlatList
          data={detailItems}
          keyExtractor={(item) =>
            'installment' in item ? `${item.kind}:${item.installment.id}` : item.kind
          }
          contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.md }}
          ListHeaderComponent={
            <View style={{ gap: theme.spacing.lg }}>
              <AppButton label="Back to loans" variant="secondary" onPress={back} />
              {loading ? <LoadingState label="Loading loanâ€¦" /> : null}
              {currentLoan ? (
                <>
                  <View style={{ gap: theme.spacing.md }}>
                    <AppText variant="title">Loan Summary</AppText>
                    <LoanSummary loan={currentLoan} localDate={localDate} />
                    <AppText>First due: {displayDate(currentLoan.first_due_date)}</AppText>
                    {currentLoan.notes ? <AppText>Notes: {currentLoan.notes}</AppText> : null}
                  </View>
                  <View style={{ gap: theme.spacing.md }}>
                    <AppText variant="title">Next Payment</AppText>
                    {nextPayment ? (
                      <View
                        style={{
                          padding: theme.spacing.md,
                          gap: theme.spacing.sm,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          borderRadius: theme.radius.md,
                          backgroundColor: theme.colors.surface,
                        }}
                      >
                        <AppText style={{ fontWeight: '700' }}>
                          Installment {nextPayment.installment_number}
                        </AppText>
                        <AppText>{displayDate(nextPayment.due_date)}</AppText>
                        <AppText>{formatPesos(nextPayment.monthly_payment_centavos)}</AppText>
                        {!currentLoan.archived_at ? (
                          <AppButton
                            label="Mark as paid"
                            accessibilityLabel={`Mark installment ${nextPayment.installment_number} paid`}
                            submitting={busy}
                            onPress={() => markPaid(nextPayment.id)}
                          />
                        ) : null}
                      </View>
                    ) : (
                      <AppText>
                        {remainingMonths(currentLoan) === 0
                          ? 'Paid Off'
                          : 'No upcoming installment remains. Review Overdue Payments below.'}
                      </AppText>
                    )}
                  </View>
                  <AppText variant="title">Overdue Payments</AppText>
                  {!overdue.length && !overdueMore ? (
                    <AppText tone="mutedText">No overdue payments.</AppText>
                  ) : null}
                </>
              ) : null}
            </View>
          }
          renderItem={({ item }) => {
            if ('installment' in item)
              return (
                <HistoryRow
                  item={item.installment}
                  section={item.kind}
                  archived={Boolean(currentLoan?.archived_at)}
                  busy={busy}
                  markPaid={markPaid}
                  correctPaid={correctPaid}
                />
              );
            if (item.kind === 'paid-heading')
              return (
                <View style={{ gap: theme.spacing.sm }}>
                  <AppText variant="title">Paid History</AppText>
                  {!paid.length ? (
                    <AppText tone="mutedText">No paid installments yet.</AppText>
                  ) : null}
                </View>
              );
            return (
              <AppButton
                label={
                  item.kind === 'more-overdue'
                    ? 'Load more overdue payments'
                    : 'Load more paid history'
                }
                variant="secondary"
                disabled={busy}
                onPress={() =>
                  void moreInstallments(item.kind === 'more-overdue' ? 'overdue' : 'paid')
                }
              />
            );
          }}
          ListFooterComponent={
            <View style={{ gap: theme.spacing.md }}>
              {currentLoan && !currentLoan.archived_at ? (
                <>
                  <AppButton
                    label="Edit loan"
                    variant="secondary"
                    disabled={busy}
                    onPress={openEdit}
                  />
                  <AppButton
                    label="Archive loan"
                    variant="secondary"
                    disabled={busy}
                    onPress={archive}
                  />
                  {currentLoan.paid_months === 0 ? (
                    <AppButton
                      label="Delete loan"
                      variant="secondary"
                      disabled={busy}
                      onPress={remove}
                    />
                  ) : null}
                </>
              ) : null}
              {error ? <ErrorState description={error} onRetry={refresh} /> : null}
              {notice ? <AppText accessibilityRole="alert">{notice}</AppText> : null}
              <AppText tone="mutedText">Paid means you paid outside LifeOps AI.</AppText>
            </View>
          }
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <View style={{ gap: theme.spacing.lg }}>
          {selectedId ? (
            <AppButton label="Back to loans" variant="secondary" onPress={back} />
          ) : null}
          {mode ? (
            <View style={{ gap: theme.spacing.md }}>
              <AppText variant="title">{mode === 'create' ? 'Add loan' : 'Edit loan'}</AppText>
              <LoanFormField
                label="Loan name"
                value={draft.title}
                change={(v) => change('title', v)}
                busy={busy}
              />
              <LoanFormField
                label="Monthly payment (PHP)"
                value={draft.monthlyPayment}
                change={(v) => change('monthlyPayment', v)}
                busy={busy}
                keyboardType="decimal-pad"
              />
              <LoanFormField
                label="First due date (YYYY-MM-DD)"
                value={draft.firstDueDate}
                change={(v) => change('firstDueDate', v)}
                busy={busy}
                keyboardType="numbers-and-punctuation"
              />
              <LoanFormField
                label="Months to pay"
                value={draft.totalMonths}
                change={(v) => change('totalMonths', v)}
                busy={busy}
                keyboardType="number-pad"
              />
              <LoanFormField
                label="Notes (optional)"
                value={draft.notes}
                change={(v) => change('notes', v)}
                busy={busy}
                multiline
              />
              {mode === 'edit' && loan && loan.paid_months > 0 ? (
                <AppText tone="mutedText">
                  Paid installment dates are kept when you change the schedule. You cannot shorten
                  the term past a paid installment.
                </AppText>
              ) : null}
              <AppButton
                label={mode === 'create' ? 'Save loan' : 'Save changes'}
                submitting={busy}
                onPress={save}
              />
              <AppButton
                label="Cancel"
                variant="secondary"
                disabled={busy}
                onPress={() => setMode(null)}
              />
            </View>
          ) : (
            <View style={{ gap: theme.spacing.lg }}>
              <AppText variant="title">Loans</AppText>
              <AppButton label="Add loan" onPress={openCreate} />
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <AppButton
                  label="Current"
                  variant={archived ? 'secondary' : 'primary'}
                  onPress={() => setArchived(false)}
                />
                <AppButton
                  label="Archived"
                  variant={archived ? 'primary' : 'secondary'}
                  onPress={() => setArchived(true)}
                />
              </View>
              {loading ? <LoadingState label="Loading loansâ€¦" /> : null}
              {!loading && !error && !loans.length ? (
                <EmptyState
                  title={archived ? 'No archived loans.' : 'No loans yet.'}
                  description="Add a loan to track monthly installments."
                />
              ) : null}
              {loans.map((item) => (
                <View
                  key={item.id}
                  style={{
                    padding: theme.spacing.md,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.surface,
                    gap: theme.spacing.md,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.title} loan`}
                    onPress={() => setSelectedId(item.id)}
                    style={({ pressed }) => ({ minHeight: 48, opacity: pressed ? 0.7 : 1 })}
                  >
                    <LoanSummary loan={item} localDate={localDate} />
                  </Pressable>
                </View>
              ))}
              {listMore ? (
                <AppButton
                  label="Load more loans"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => void moreLoans()}
                />
              ) : null}
            </View>
          )}
          {error ? <ErrorState description={error} onRetry={refresh} /> : null}
          {notice ? <AppText accessibilityRole="alert">{notice}</AppText> : null}
          <AppText tone="mutedText">Paid means you paid outside LifeOps AI.</AppText>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
