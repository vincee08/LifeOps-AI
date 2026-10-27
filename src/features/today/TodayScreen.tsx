import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import { useAuth } from '@/features/auth/AuthProvider';
import { loadProfile } from '@/features/settings/profile-service';
import { reminderWarning } from '@/features/tasks/task-notifications';
import { setTaskCompletedWithReminders } from '@/features/tasks/task-reminder-commands';
import { formatTaskDueAt } from '@/features/tasks/task-time';
import {
  listTodayTaskSection,
  type Task,
  type TodayTaskPage,
} from '@/features/tasks/tasks-service';
import {
  DEFAULT_TIMEZONE,
  getTodayWindow,
  orderTodayTasks,
  profileTimezone,
  type TodaySection,
  type TodayWindow,
} from '@/features/today/today-model';
import { useAppTheme } from '@/hooks/useAppTheme';
import { TodayBills } from '@/features/today/TodayBills';

const sections: TodaySection[] = ['overdue', 'today', 'completed'];
type SectionData = Record<TodaySection, TodayTaskPage | null>;
type SectionErrors = Record<TodaySection, string>;
const emptyData: SectionData = { overdue: null, today: null, completed: null };
const emptyErrors: SectionErrors = { overdue: '', today: '', completed: '' };

function TaskCard({
  task,
  section,
  timezone,
  busyId,
  onToggle,
  onOpen,
}: {
  task: Task;
  section: TodaySection;
  timezone: string;
  busyId: string | null;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
}) {
  const theme = useAppTheme();
  const completed = section === 'completed';
  const time = completed ? task.completed_at : task.due_at;
  return (
    <View
      style={{
        padding: theme.spacing.lg,
        gap: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: section === 'overdue' ? theme.colors.danger : theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${task.title} in Tasks`}
        onPress={() => onOpen(task)}
        style={({ pressed }) => ({
          minHeight: 44,
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <AppText style={{ fontWeight: '700' }}>{task.title}</AppText>
        <AppText tone="mutedText">
          {completed ? 'Completed' : 'Due'} {time ? formatTaskDueAt(time, timezone) : ''}
          {' · '}
          {task.category}
          {' · '}
          {task.priority} priority
        </AppText>
      </Pressable>
      <AppButton
        label={completed ? 'Reopen' : 'Complete'}
        variant="secondary"
        accessibilityLabel={`${completed ? 'Reopen' : 'Complete'} ${task.title}`}
        submitting={busyId === task.id}
        disabled={busyId !== null && busyId !== task.id}
        onPress={() => onToggle(task)}
      />
    </View>
  );
}

export function TodayScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { state } = useAuth();
  const userId = state.status === 'signed-in' ? state.session.user.id : null;
  const [window, setWindow] = useState<TodayWindow | null>(null);
  const [fallbackTimezone, setFallbackTimezone] = useState(false);
  const [data, setData] = useState<SectionData>(emptyData);
  const [errors, setErrors] = useState<SectionErrors>(emptyErrors);
  const [profileError, setProfileError] = useState('');
  const [actionError, setActionError] = useState('');
  const [reminderNotice, setReminderNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshAt, setRefreshAt] = useState<string | null>(null);
  const busyRef = useRef(false);
  const windowRef = useRef<TodayWindow | null>(null);
  const dataRef = useRef<SectionData>(emptyData);
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
      setLoading(true);
      setProfileError('');
      setErrors(emptyErrors);
      setData(emptyData);
      setActionError('');
      void loadProfile(userId)
        .then(async (profile) => {
          if (!active) return;
          const timezone = profileTimezone(profile.timezone);
          const nextWindow = getTodayWindow(
            Math.max(Date.now(), refreshAt ? Date.parse(refreshAt) : 0),
            timezone,
          );
          setFallbackTimezone(timezone === DEFAULT_TIMEZONE && profile.timezone !== timezone);
          setWindow(nextWindow);
          windowRef.current = nextWindow;
          const results = await Promise.allSettled(
            sections.map((section) => listTodayTaskSection(userId, section, nextWindow)),
          );
          if (!active) return;
          const nextData = { ...emptyData };
          const nextErrors = { ...emptyErrors };
          results.forEach((result, index) => {
            const section = sections[index]!;
            if (result.status === 'fulfilled') nextData[section] = result.value;
            else
              nextErrors[section] =
                result.reason instanceof Error
                  ? result.reason.message
                  : 'This section could not be loaded.';
          });
          dataRef.current = nextData;
          setData(nextData);
          setErrors(nextErrors);
        })
        .catch((caught: unknown) => {
          if (active)
            setProfileError(
              caught instanceof Error ? caught.message : 'Today could not be loaded.',
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      const clock = setInterval(() => {
        const current = windowRef.current;
        if (!current) return;
        const now = Date.now();
        const nextDue = dataRef.current.today?.tasks[0]?.due_at;
        if (now >= Date.parse(current.end) || (nextDue && now > Date.parse(nextDue))) refresh();
      }, 30_000);
      return () => {
        active = false;
        clearInterval(clock);
      };
    }, [userId, refreshAt, refresh]),
  );

  async function toggle(task: Task) {
    if (!userId || busyRef.current) return;
    busyRef.current = true;
    setBusyId(task.id);
    setActionError('');
    try {
      const result = await setTaskCompletedWithReminders(
        userId,
        task.id,
        task.completed_at === null,
      );
      setReminderNotice(reminderWarning(result.reminder));
      refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Task status could not be saved.');
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  const heading = window
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: window.timezone,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(window.now))
    : 'Today';
  const available = sections.filter((section) => data[section] !== null);
  return (
    <Screen>
      <View style={{ gap: theme.spacing.sm }}>
        <AppText tone="mutedText">{heading}</AppText>
        <AppText variant="display">Today</AppText>
        <AppText tone="mutedText">Your tasks and bills for this day.</AppText>
      </View>
      <AppButton
        label="View all tasks"
        variant="secondary"
        onPress={() => router.navigate('/(tabs)/tasks')}
      />
      {fallbackTimezone ? (
        <AppText tone="mutedText">
          Using Asia/Manila because your profile timezone is unavailable.
        </AppText>
      ) : null}
      {profileError ? <ErrorState description={profileError} onRetry={refresh} /> : null}
      {actionError ? <ErrorState description={actionError} onRetry={refresh} /> : null}
      {reminderNotice ? <AppText accessibilityRole="alert">{reminderNotice}</AppText> : null}
      {loading ? <LoadingState label="Loading today’s tasks…" /> : null}
      {!loading && !profileError && window ? (
        <>
          {available.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {sections.map((section) =>
                data[section] ? (
                  <View
                    key={section}
                    style={{
                      padding: theme.spacing.md,
                      borderRadius: theme.radius.md,
                      backgroundColor: theme.colors.softPrimary,
                    }}
                  >
                    <AppText style={{ fontWeight: '700' }}>
                      {data[section]!.total} {data[section]!.total === 1 ? 'task' : 'tasks'}{' '}
                      {section === 'today'
                        ? 'due today'
                        : section === 'overdue'
                          ? 'overdue'
                          : 'completed today'}
                    </AppText>
                  </View>
                ) : null,
              )}
            </View>
          ) : null}
          {sections.map((section) => {
            const page = data[section];
            if (section === 'overdue' && page?.total === 0) return null;
            if (section === 'completed' && page?.total === 0) return null;
            const title =
              section === 'completed'
                ? 'Completed today'
                : section === 'overdue'
                  ? 'Overdue'
                  : 'Due today';
            return (
              <View key={section} style={{ gap: theme.spacing.md }}>
                <AppText variant="title">{title}</AppText>
                {errors[section] ? (
                  <ErrorState
                    title={`${title} unavailable`}
                    description={errors[section]}
                    onRetry={refresh}
                  />
                ) : null}
                {page?.total === 0 && section === 'today' ? (
                  <EmptyState
                    title="No tasks due today."
                    description="Tasks with a due time today appear here."
                  />
                ) : null}
                {page
                  ? orderTodayTasks(page.tasks, section).map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        section={section}
                        timezone={window.timezone}
                        busyId={busyId}
                        onToggle={(item) => void toggle(item)}
                        onOpen={(item) =>
                          router.navigate({
                            pathname: '/(tabs)/tasks',
                            params: { editTaskId: item.id },
                          })
                        }
                      />
                    ))
                  : null}
                {page?.hasMore ? (
                  <AppText tone="mutedText">
                    Showing the first {page.tasks.length}. Open Tasks for the full list.
                  </AppText>
                ) : null}
              </View>
            );
          })}
          <TodayBills window={window} />
        </>
      ) : null}
    </Screen>
  );
}
