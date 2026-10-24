import { randomUUID } from 'expo-crypto';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import { useAuth } from '@/features/auth/AuthProvider';
import { loadProfile } from '@/features/settings/profile-service';
import { profileTimezone } from '@/features/settings/profile-timezone';
import { reminderWarning, type ReminderResult } from '@/features/tasks/task-notifications';
import {
  createTaskWithReminders,
  deleteTaskWithReminders,
  editTaskWithReminders,
  setTaskCompletedWithReminders,
} from '@/features/tasks/task-reminder-commands';
import {
  formatTaskDueAt,
  isTaskOverdue,
  parseTaskDueAt,
  taskDueInput,
} from '@/features/tasks/task-time';
import { getTask, listTasks, type Task, type TaskFilter } from '@/features/tasks/tasks-service';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { TaskCategory, TaskPriority } from '@/lib/database.types';

type Form = {
  title: string;
  description: string;
  due: string;
  category: TaskCategory;
  priority: TaskPriority;
};
const blank: Form = {
  title: '',
  description: '',
  due: '',
  category: 'personal',
  priority: 'medium',
};

function savedReminderNotice(reminder: ReminderResult, hasDueDate: boolean) {
  if (!hasDueDate) return '';
  if (reminder.status === 'scheduled') return 'Reminders scheduled.';
  if (reminder.status === 'none')
    return 'Task saved. No reminder times remain before this deadline.';
  if (reminder.status === 'off') return 'Task saved. Task reminders are off in Settings.';
  return `Task saved. ${reminderWarning(reminder)}`;
}

function formFromTask(task: Task, timezone: string): Form {
  return {
    title: task.title,
    description: task.description ?? '',
    due: taskDueInput(task.due_at, timezone),
    category: task.category,
    priority: task.priority,
  };
}

function Choice({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        minWidth: 58,
        paddingHorizontal: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: selected ? theme.colors.softPrimary : theme.colors.surface,
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <AppText style={{ fontWeight: selected ? '700' : '400' }}>{label}</AppText>
    </Pressable>
  );
}

export function TasksScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { editTaskId } = useLocalSearchParams<{ editTaskId?: string }>();
  const { state } = useAuth();
  const userId = state.status === 'signed-in' ? state.session.user.id : null;
  const [timezone, setTimezone] = useState('Asia/Manila');
  const [filter, setFilter] = useState<TaskFilter>('active');
  const [category, setCategory] = useState<TaskCategory | 'all'>('all');
  const [priority, setPriority] = useState<TaskPriority | 'all'>('all');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [reminderNotice, setReminderNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshAt, setRefreshAt] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const pageRef = useRef(0);
  const cutoffRef = useRef('');
  const createRequestRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const requestSeq = useRef(0);
  const refresh = useCallback(
    () =>
      setRefreshAt((previous) =>
        new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString(),
      ),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let active = true;
      requestSeq.current += 1;
      const cutoff = new Date(
        Math.max(Date.now(), refreshAt ? Date.parse(refreshAt) : 0),
      ).toISOString();
      cutoffRef.current = cutoff;
      setNow(Date.parse(cutoff));
      pageRef.current = 0;
      setLoading(true);
      setError('');
      setTasks([]);
      setHasMore(false);
      const requestedTaskId = editTaskId;
      void Promise.all([
        listTasks(userId, {
          filter,
          category,
          priority,
          page: 0,
          now: cutoff,
        }),
        loadProfile(userId),
      ])
        .then(async ([result, profile]) => {
          if (!active) return;
          const selectedTask = requestedTaskId
            ? (result.tasks.find((task) => task.id === requestedTaskId) ??
              (await getTask(userId, requestedTaskId)))
            : null;
          if (!active) return;
          setTasks(result.tasks);
          setHasMore(result.hasMore);
          const zone = profileTimezone(profile.timezone);
          setTimezone(zone);
          if (requestedTaskId) {
            if (selectedTask) {
              setEditing(selectedTask);
              setForm(formFromTask(selectedTask, zone));
              setFormError('');
              setFormOpen(true);
            } else setError('Task could not be found. Refresh and try again.');
            router.setParams({ editTaskId: undefined });
          }
        })
        .catch((caught: unknown) => {
          if (active)
            setError(caught instanceof Error ? caught.message : 'Tasks could not be loaded.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      const clock = setInterval(() => {
        setNow(Date.now());
        if (filter === 'overdue') refresh();
      }, 60_000);
      return () => {
        active = false;
        requestSeq.current += 1;
        clearInterval(clock);
      };
    }, [userId, filter, category, priority, refreshAt, refresh, router, editTaskId]),
  );

  async function loadMore() {
    if (!userId || moreLoading || !hasMore) return;
    setMoreLoading(true);
    setError('');
    const page = pageRef.current + 1;
    const request = requestSeq.current;
    try {
      const result = await listTasks(userId, {
        filter,
        category,
        priority,
        page,
        now: cutoffRef.current,
      });
      if (request !== requestSeq.current) return;
      pageRef.current = page;
      setTasks((current) => [...current, ...result.tasks]);
      setHasMore(result.hasMore);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'More tasks could not be loaded.');
    } finally {
      setMoreLoading(false);
    }
  }

  function openNew() {
    createRequestRef.current = randomUUID();
    setEditing(null);
    setForm(blank);
    setFormError('');
    setReminderNotice('');
    setFormOpen(true);
  }
  function openEdit(task: Task) {
    setEditing(task);
    setForm(formFromTask(task, timezone));
    setFormError('');
    setReminderNotice('');
    setFormOpen(true);
  }
  async function save() {
    if (!userId || busyRef.current) return;
    let dueAt: string | null;
    try {
      dueAt = parseTaskDueAt(form.due, timezone);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Invalid due date.');
      return;
    }
    busyRef.current = true;
    setSaving(true);
    setFormError('');
    try {
      const draft = {
        title: form.title,
        description: form.description,
        due_at: dueAt,
        category: form.category,
        priority: form.priority,
      };
      const result = editing
        ? await editTaskWithReminders(userId, editing, draft)
        : await createTaskWithReminders(
            userId,
            createRequestRef.current ?? (createRequestRef.current = randomUUID()),
            draft,
          );
      setReminderNotice(savedReminderNotice(result.reminder, result.task.due_at !== null));
      createRequestRef.current = null;
      setFormOpen(false);
      setEditing(null);
      refresh();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Task could not be saved.');
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }
  async function toggle(task: Task) {
    if (!userId || busyRef.current) return;
    busyRef.current = true;
    setBusyId(task.id);
    setError('');
    try {
      const result = await setTaskCompletedWithReminders(
        userId,
        task.id,
        task.completed_at === null,
      );
      setReminderNotice(reminderWarning(result.reminder));
      setTasks((current) => current.filter((item) => item.id !== task.id));
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Task status could not be saved.');
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }
  function confirmDelete(task: Task) {
    const remove = async () => {
      if (!userId || busyRef.current) return;
      busyRef.current = true;
      setBusyId(task.id);
      setError('');
      try {
        const reminder = await deleteTaskWithReminders(userId, task.id);
        setReminderNotice(reminderWarning(reminder));
        setTasks((current) => current.filter((item) => item.id !== task.id));
        refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Task could not be deleted.');
      } finally {
        busyRef.current = false;
        setBusyId(null);
      }
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`Delete “${task.title}”?`)) void remove();
    } else
      Alert.alert('Delete task?', `Delete “${task.title}”? This cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void remove() },
      ]);
  }

  const inputStyle = {
    minHeight: 48,
    padding: theme.spacing.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
  };
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="display">Tasks</AppText>
          <AppText tone="mutedText">Keep your next steps in one place.</AppText>
        </View>
        {reminderNotice ? (
          <View style={{ gap: theme.spacing.sm }}>
            <AppText accessibilityRole="alert">{reminderNotice}</AppText>
            {reminderNotice.includes('Settings') ||
            reminderNotice.includes('disabled on this device') ? (
              <AppButton
                label="Task reminder settings"
                variant="secondary"
                onPress={() => router.navigate('/settings')}
              />
            ) : null}
          </View>
        ) : null}
        {formOpen ? (
          <View style={{ gap: theme.spacing.md }}>
            <AppText variant="title">{editing ? 'Edit task' : 'Add a task'}</AppText>
            <TextInput
              accessibilityLabel="Task title"
              placeholder="What needs doing?"
              placeholderTextColor={theme.colors.mutedText}
              value={form.title}
              onChangeText={(title) => setForm({ ...form, title })}
              maxLength={200}
              editable={!saving}
              autoFocus
              style={inputStyle}
            />
            <TextInput
              accessibilityLabel="Description"
              placeholder="Details (optional)"
              placeholderTextColor={theme.colors.mutedText}
              value={form.description}
              onChangeText={(description) => setForm({ ...form, description })}
              maxLength={2000}
              editable={!saving}
              multiline
              style={[inputStyle, { minHeight: 70 }]}
            />
            <AppText>Due date and time (optional)</AppText>
            <TextInput
              accessibilityLabel="Due date and time"
              placeholder="YYYY-MM-DD HH:mm"
              placeholderTextColor={theme.colors.mutedText}
              value={form.due}
              onChangeText={(due) => setForm({ ...form, due })}
              editable={!saving}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              style={inputStyle}
            />
            <AppText tone="mutedText">Time in {timezone}. Example: 2026-10-30 09:00</AppText>
            <AppText>Category</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {(['personal', 'work', 'other'] as const).map((value) => (
                <Choice
                  key={value}
                  label={value}
                  selected={form.category === value}
                  disabled={saving}
                  onPress={() => setForm({ ...form, category: value })}
                />
              ))}
            </View>
            <AppText>Priority</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {(['low', 'medium', 'high'] as const).map((value) => (
                <Choice
                  key={value}
                  label={value}
                  selected={form.priority === value}
                  disabled={saving}
                  onPress={() => setForm({ ...form, priority: value })}
                />
              ))}
            </View>
            {formError ? (
              <AppText tone="danger" accessibilityRole="alert">
                {formError}
              </AppText>
            ) : null}
            <AppButton
              label={editing ? 'Save changes' : 'Create task'}
              submitting={saving}
              disabled={!form.title.trim() || busyId !== null}
              onPress={() => void save()}
            />
            <AppButton
              label="Cancel"
              variant="secondary"
              disabled={saving}
              onPress={() => {
                setFormOpen(false);
                setEditing(null);
              }}
            />
          </View>
        ) : (
          <AppButton label="Add task" disabled={busyId !== null} onPress={openNew} />
        )}
        <View style={{ gap: theme.spacing.sm }}>
          <AppText>View</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {(['active', 'overdue', 'completed'] as const).map((value) => (
              <Choice
                key={value}
                label={value}
                selected={filter === value}
                onPress={() => setFilter(value)}
              />
            ))}
          </View>
          <AppText>Category</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {(['all', 'personal', 'work', 'other'] as const).map((value) => (
              <Choice
                key={value}
                label={value}
                selected={category === value}
                onPress={() => setCategory(value)}
              />
            ))}
          </View>
          <AppText>Priority</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {(['all', 'high', 'medium', 'low'] as const).map((value) => (
              <Choice
                key={value}
                label={value}
                selected={priority === value}
                onPress={() => setPriority(value)}
              />
            ))}
          </View>
        </View>
        {error ? <ErrorState description={error} onRetry={refresh} /> : null}
        {loading ? (
          <LoadingState label="Loading tasks…" />
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {tasks.length === 0 && !error ? (
              <EmptyState
                title={
                  filter === 'completed'
                    ? 'No completed tasks'
                    : filter === 'overdue'
                      ? 'Nothing overdue'
                      : 'No tasks here'
                }
                description={
                  filter === 'active'
                    ? 'Add a task to get started.'
                    : 'Tasks will appear here when they match this view.'
                }
              />
            ) : null}
            {tasks.map((task) => (
              <View
                key={task.id}
                style={{
                  gap: theme.spacing.sm,
                  padding: theme.spacing.lg,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                }}
              >
                <AppText style={{ fontWeight: '700' }}>{task.title}</AppText>
                {task.description ? <AppText tone="mutedText">{task.description}</AppText> : null}
                <AppText tone={isTaskOverdue(task, now) ? 'danger' : 'mutedText'}>
                  {task.priority} priority · {task.category}
                  {task.due_at
                    ? ` · ${isTaskOverdue(task, now) ? 'Overdue: ' : 'Due: '}${formatTaskDueAt(task.due_at, timezone)}`
                    : ''}
                </AppText>
                {task.completed_at ? (
                  <AppText tone="mutedText">
                    Completed {formatTaskDueAt(task.completed_at, timezone)}
                  </AppText>
                ) : null}
                <AppButton
                  label={task.completed_at ? 'Mark incomplete' : 'Complete'}
                  accessibilityLabel={`${task.completed_at ? 'Mark incomplete' : 'Complete'} ${task.title}`}
                  submitting={busyId === task.id}
                  disabled={busyId !== null && busyId !== task.id}
                  onPress={() => void toggle(task)}
                />
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label="Edit"
                      variant="secondary"
                      disabled={busyId !== null}
                      accessibilityLabel={`Edit ${task.title}`}
                      onPress={() => openEdit(task)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label="Delete"
                      variant="secondary"
                      disabled={busyId !== null}
                      accessibilityLabel={`Delete ${task.title}`}
                      onPress={() => confirmDelete(task)}
                    />
                  </View>
                </View>
              </View>
            ))}
            {hasMore ? (
              <AppButton
                label="Load more"
                variant="secondary"
                submitting={moreLoading}
                onPress={() => void loadMore()}
              />
            ) : null}
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
