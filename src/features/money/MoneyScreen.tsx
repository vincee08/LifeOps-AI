import { randomUUID } from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  billReminderWarning,
  reconcileUpcomingBillReminders,
} from '@/features/money/bill-notifications';
import {
  BILL_CATEGORIES,
  BILL_RECURRENCES,
  billDueState,
  billListAfterCreate,
  formatPesos,
  pesoInputFromMinor,
} from '@/features/money/bills-model';
import {
  archiveBill,
  createBill,
  deleteBill,
  editBill,
  editBillDue,
  generateBillOccurrences,
  listBillItems,
  setBillPaid,
  type BillDraft,
  type BillItem,
} from '@/features/money/bills-service';
import { loadProfile } from '@/features/settings/profile-service';
import { getTodayWindow } from '@/features/today/today-model';
import { useAppTheme } from '@/hooks/useAppTheme';

type Filter = 'upcoming' | 'overdue' | 'paid' | 'archived';
const blankDraft: BillDraft = {
  title: '',
  amount: '',
  due_on: '',
  category: 'other',
  recurrence: 'none',
  notes: '',
};

function BillCard({
  item,
  localDate,
  busy,
  onStatus,
  onEdit,
  onDue,
  onArchive,
  onDelete,
}: {
  item: BillItem;
  localDate: string;
  busy: boolean;
  onStatus: () => void;
  onEdit: () => void;
  onDue: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const theme = useAppTheme();
  const { bill, occurrence } = item;
  const paid = occurrence.status === 'paid';
  const dueState = billDueState(occurrence.status, occurrence.due_on, localDate);
  return (
    <View
      style={{
        gap: theme.spacing.sm,
        padding: theme.spacing.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
      }}
    >
      <AppText variant="title">{bill.title}</AppText>
      <AppText>
        {formatPesos(occurrence.amount_minor)} · Due {occurrence.due_on}
      </AppText>
      <AppText tone="mutedText">
        {bill.category}
        {bill.recurrence !== 'none' ? ` · ${bill.recurrence}` : ''}
        {bill.archived_at ? ' · archived' : ''}
      </AppText>
      {paid ? <AppText tone="mutedText">Marked paid outside LifeOps AI.</AppText> : null}
      {!paid && !bill.archived_at && dueState !== 'upcoming' ? (
        <AppText tone={dueState === 'overdue' ? 'danger' : 'mutedText'}>
          {dueState === 'overdue' ? 'Overdue' : 'Due today'}
        </AppText>
      ) : null}
      {!bill.archived_at ? (
        <AppButton
          label={paid ? 'Mark unpaid' : 'Mark paid'}
          variant="secondary"
          disabled={busy}
          onPress={onStatus}
        />
      ) : null}
      {!bill.archived_at ? (
        <AppButton
          label={`Edit ${bill.title}`}
          variant="secondary"
          disabled={busy}
          onPress={onEdit}
        />
      ) : null}
      {!bill.archived_at && !paid ? (
        <AppButton
          label={`Change ${bill.title} due date`}
          variant="secondary"
          disabled={busy}
          onPress={onDue}
        />
      ) : null}
      {!bill.archived_at ? (
        <AppButton
          label={`Archive ${bill.title}`}
          variant="secondary"
          disabled={busy}
          onPress={onArchive}
        />
      ) : null}
      <AppButton
        label={`Delete ${bill.title}`}
        variant="secondary"
        disabled={busy}
        onPress={onDelete}
      />
    </View>
  );
}

export function MoneyScreen() {
  const theme = useAppTheme();
  const { state } = useAuth();
  const userId = state.status === 'signed-in' ? state.session.user.id : null;
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [items, setItems] = useState<BillItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [localDate, setLocalDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [dueEditing, setDueEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<BillDraft>(blankDraft);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestRef = useRef<string | null>(null);
  const actionRequests = useRef(new Map<string, string>());
  const busyRef = useRef(false);
  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useFocusEffect(
    useCallback(() => {
      void refreshKey; // Re-fetch after a confirmed bill mutation or Retry.
      if (!userId) return;
      let active = true;
      setLoading(true);
      setError('');
      setPage(0);
      setItems([]);
      setHasMore(false);
      void (async () => {
        try {
          const profile = await loadProfile(userId);
          const today = getTodayWindow(Date.now(), profile.timezone).date;
          await generateBillOccurrences();
          const result = await listBillItems(userId, filter, today);
          if (active) {
            setItems(result.items);
            setHasMore(result.hasMore);
            setLocalDate(today);
          }
        } catch (caught) {
          if (active)
            setError(caught instanceof Error ? caught.message : 'Bills could not be loaded.');
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [userId, filter, refreshKey]),
  );

  function change<K extends keyof BillDraft>(key: K, value: BillDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function openNew() {
    requestRef.current = randomUUID();
    setEditing(null);
    setDueEditing(null);
    setDraft(blankDraft);
    setFormOpen(true);
    setError('');
  }
  function openEdit(item: BillItem) {
    requestRef.current = randomUUID();
    setEditing(item.bill.id);
    setDueEditing(null);
    setDraft({
      title: item.bill.title,
      amount: pesoInputFromMinor(item.bill.amount_minor),
      due_on: item.bill.anchor_due_on,
      category: item.bill.category,
      recurrence: item.bill.recurrence,
      notes: item.bill.notes ?? '',
    });
    setFormOpen(true);
    setError('');
  }
  function openDue(item: BillItem) {
    requestRef.current = randomUUID();
    setEditing(null);
    setDueEditing(item.occurrence.id);
    setDraft({ ...blankDraft, due_on: item.occurrence.due_on });
    setFormOpen(true);
    setError('');
  }
  async function save() {
    if (!userId || busyRef.current) return;
    const createdOverdueRecurring =
      !dueEditing && !editing && draft.recurrence !== 'none' && draft.due_on < localDate;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const requestId = requestRef.current ?? (requestRef.current = randomUUID());
      if (dueEditing) await editBillDue(requestId, dueEditing, draft.due_on);
      else if (editing) await editBill(requestId, editing, draft);
      else {
        await createBill(requestId, draft);
        setFilter(billListAfterCreate(draft.due_on, draft.recurrence, localDate));
      }
      requestRef.current = null;
      setFormOpen(false);
      setEditing(null);
      setDueEditing(null);
      const reminder = await reconcileUpcomingBillReminders(userId);
      setNotice(
        billReminderWarning(reminder) ||
          (createdOverdueRecurring
            ? 'Future cycles are in Upcoming. The initial unpaid due date is in Overdue.'
            : 'Bill saved. Payments are made outside LifeOps AI.'),
      );
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Bill could not be saved.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function runAction(key: string, work: (requestId: string) => Promise<void>) {
    if (!userId || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const requestId = actionRequests.current.get(key) ?? randomUUID();
      actionRequests.current.set(key, requestId);
      await work(requestId);
      actionRequests.current.delete(key);
      const reminder = await reconcileUpcomingBillReminders(userId);
      setNotice(billReminderWarning(reminder) || 'Bill updated.');
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Bill could not be updated.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function confirmDestructive(item: BillItem, deletion: boolean) {
    const action = deletion ? 'Delete' : 'Archive';
    Alert.alert(
      `${action} bill?`,
      deletion
        ? `Delete ${item.bill.title} and its payment history permanently?`
        : `Archive ${item.bill.title}? Its history remains available.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          style: deletion ? 'destructive' : 'default',
          onPress: () =>
            void runAction(`${action}:${item.bill.id}`, (id) =>
              deletion ? deleteBill(id, item.bill.id) : archiveBill(id, item.bill.id),
            ),
        },
      ],
    );
  }
  async function more() {
    if (!userId || busy || !hasMore) return;
    setBusy(true);
    setError('');
    try {
      const next = page + 1;
      const result = await listBillItems(userId, filter, localDate, next);
      setItems((current) => [...current, ...result.items]);
      setHasMore(result.hasMore);
      setPage(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'More bills could not be loaded.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="display">Money</AppText>
          <AppText variant="title">Bills</AppText>
          <AppText tone="mutedText">Track obligations you pay outside LifeOps AI.</AppText>
        </View>
        <AppButton
          label={formOpen ? 'Close bill form' : 'Add bill'}
          onPress={() => {
            if (formOpen) {
              setFormOpen(false);
              requestRef.current = null;
            } else openNew();
          }}
          disabled={busy || loading}
        />
        {formOpen ? (
          <View style={{ gap: theme.spacing.md }}>
            <AppText variant="title">
              {dueEditing ? 'Change this due date' : editing ? 'Edit bill' : 'New bill'}
            </AppText>
            {dueEditing ? (
              <AppText tone="mutedText">
                This changes one unpaid cycle. Later recurring cycles keep the original schedule.
              </AppText>
            ) : null}
            {(dueEditing
              ? ([['Due date (YYYY-MM-DD)', 'due_on']] as const)
              : ([
                  ['Title', 'title'],
                  ['Amount (PHP)', 'amount'],
                  ['Due date (YYYY-MM-DD)', 'due_on'],
                  ['Notes (optional)', 'notes'],
                ] as const)
            ).map(([label, key]) => (
              <View key={key} style={{ gap: theme.spacing.sm }}>
                <AppText>{label}</AppText>
                <TextInput
                  accessibilityLabel={label}
                  value={draft[key]}
                  onChangeText={(value) => change(key, value)}
                  editable={!busy}
                  keyboardType={
                    key === 'amount'
                      ? 'decimal-pad'
                      : key === 'due_on'
                        ? 'numbers-and-punctuation'
                        : 'default'
                  }
                  autoCapitalize={key === 'title' ? 'sentences' : 'none'}
                  multiline={key === 'notes'}
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
            ))}
            {!dueEditing ? (
              <>
                <AppText>Category</AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {BILL_CATEGORIES.map((category) => (
                    <Pressable
                      key={category}
                      accessibilityRole="button"
                      accessibilityLabel={`Category ${category}`}
                      accessibilityState={{ selected: draft.category === category }}
                      onPress={() => change('category', category)}
                      disabled={busy}
                      style={{
                        minHeight: 44,
                        justifyContent: 'center',
                        padding: theme.spacing.md,
                        borderRadius: theme.radius.md,
                        backgroundColor:
                          draft.category === category
                            ? theme.colors.softPrimary
                            : theme.colors.surface,
                      }}
                    >
                      <AppText>{category}</AppText>
                    </Pressable>
                  ))}
                </View>
                <AppText>Recurrence</AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {BILL_RECURRENCES.map((recurrence) => (
                    <Pressable
                      key={recurrence}
                      accessibilityRole="button"
                      accessibilityLabel={`Recurrence ${recurrence}`}
                      accessibilityState={{ selected: draft.recurrence === recurrence }}
                      onPress={() => change('recurrence', recurrence)}
                      disabled={busy}
                      style={{
                        minHeight: 44,
                        justifyContent: 'center',
                        padding: theme.spacing.md,
                        borderRadius: theme.radius.md,
                        backgroundColor:
                          draft.recurrence === recurrence
                            ? theme.colors.softPrimary
                            : theme.colors.surface,
                      }}
                    >
                      <AppText>{recurrence}</AppText>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            <AppButton
              label={dueEditing ? 'Save due date' : editing ? 'Save bill changes' : 'Save bill'}
              submitting={busy}
              onPress={() => void save()}
            />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {(['upcoming', 'overdue', 'paid', 'archived'] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`Show ${value} bills`}
              accessibilityState={{ selected: filter === value }}
              onPress={() => setFilter(value)}
              style={{
                minHeight: 44,
                justifyContent: 'center',
                padding: theme.spacing.md,
                backgroundColor: filter === value ? theme.colors.softPrimary : theme.colors.surface,
                borderRadius: theme.radius.md,
              }}
            >
              <AppText>
                {value === 'paid'
                  ? 'Paid history'
                  : value === 'upcoming'
                    ? 'Upcoming'
                    : value === 'archived'
                      ? 'Archived'
                      : 'Overdue'}
              </AppText>
            </Pressable>
          ))}
        </View>
        {error ? <ErrorState description={error} onRetry={refresh} /> : null}
        {notice ? <AppText accessibilityRole="alert">{notice}</AppText> : null}
        {loading ? <LoadingState label="Loading bills…" /> : null}
        {!loading && items.length === 0 && !error ? (
          <EmptyState
            title={
              filter === 'paid'
                ? 'No paid bills yet.'
                : filter === 'overdue'
                  ? 'No overdue bills.'
                  : filter === 'archived'
                    ? 'No archived bills.'
                    : 'No upcoming bills.'
            }
            description="Add a bill to track its due date and reminders."
          />
        ) : null}
        {!loading
          ? items.map((item) => (
              <BillCard
                key={item.occurrence.id}
                item={item}
                localDate={localDate}
                busy={busy}
                onStatus={() =>
                  void runAction(`status:${item.occurrence.id}:${item.occurrence.status}`, (id) =>
                    setBillPaid(id, item.occurrence.id, item.occurrence.status !== 'paid'),
                  )
                }
                onEdit={() => openEdit(item)}
                onDue={() => openDue(item)}
                onArchive={() => confirmDestructive(item, false)}
                onDelete={() => confirmDestructive(item, true)}
              />
            ))
          : null}
        {hasMore ? (
          <AppButton
            label="Load more bills"
            variant="secondary"
            disabled={busy}
            onPress={() => void more()}
          />
        ) : null}
        <AppText tone="mutedText">
          Bills track outside payments. Debts, expenses, and budgets are not available yet.
        </AppText>
      </Screen>
    </KeyboardAvoidingView>
  );
}
