import { randomUUID } from 'expo-crypto';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, FlatList, Pressable, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import { useAuth } from '@/features/auth/AuthProvider';
import { loadProfile } from '@/features/settings/profile-service';
import { getTodayWindow } from '@/features/today/today-model';
import { useAppTheme } from '@/hooks/useAppTheme';
import { ExerciseLibrary } from './ExerciseLibrary';
import { WorkoutForm } from './WorkoutForm';
import {
  formatMeasurement,
  measurementLabel,
  planState,
  type WorkoutDraft,
  type WorkoutEntryDraft,
} from './workout-model';
import {
  deleteWorkout,
  getWorkout,
  listExerciseProgress,
  listWorkoutHistory,
  listWorkoutPlans,
  listWorkoutPlanPage,
  saveWorkout,
  workoutWeekActivity,
  type Exercise,
  type WorkoutEntry,
  type WorkoutProgress,
  type WorkoutSession,
} from './workout-service';

type Mode = 'home' | 'form' | 'choose' | 'library' | 'detail' | 'history' | 'plans' | 'progress';
type Detail = { session: WorkoutSession; entries: WorkoutEntry[] };
type Page = { items: WorkoutSession[]; total: number; hasMore: boolean };
type Plans = { past: WorkoutSession[]; upcoming: WorkoutSession[] };
type Week = { week_start: string; session_count: number };
const blankPage: Page = { items: [], total: 0, hasMore: false };
function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}
function draftEntry(exercise: Exercise): WorkoutEntryDraft {
  return { exercise, sets: '', reps: '', weightKg: '', minutes: '', seconds: '' };
}
function draftFromDetail(detail: Detail, today: string): WorkoutDraft {
  return {
    title: detail.session.title,
    plannedDate: detail.session.planned_date ?? '',
    performedDate: detail.session.performed_date ?? today,
    completed: detail.session.completed_at !== null,
    entries: detail.entries.map((entry) => ({
      exercise: {
        id: entry.exercise_id,
        user_id: entry.user_id,
        client_request_id: '',
        name: entry.name_snapshot,
        measurement_kind: entry.measurement_kind,
        archived_at: null,
        created_at: '',
        updated_at: '',
      },
      sets: entry.sets?.toString() ?? '',
      reps: entry.reps?.toString() ?? '',
      weightKg: entry.weight_kg ?? '',
      minutes:
        entry.duration_seconds === null ? '' : String(Math.floor(entry.duration_seconds / 60)),
      seconds: entry.duration_seconds === null ? '' : String(entry.duration_seconds % 60),
    })),
  };
}
function WorkoutCard({
  session,
  today,
  onPress,
}: {
  session: WorkoutSession;
  today: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const date = session.performed_date ?? session.planned_date!;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${session.title} workout`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 64,
        padding: theme.spacing.lg,
        gap: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <AppText style={{ fontWeight: '700' }}>{session.title}</AppText>
      <AppText tone="mutedText">
        {session.completed_at ? 'Completed' : planState(session.planned_date!, today)} ·{' '}
        {dateLabel(date)}
      </AppText>
    </Pressable>
  );
}

export function WorkoutScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { workoutId } = useLocalSearchParams<{ workoutId?: string }>();
  const { state } = useAuth();
  const ownerId = state.status === 'signed-in' ? state.session.user.id : null;
  const [mode, setMode] = useState<Mode>('home');
  const [today, setToday] = useState('');
  const [timezone, setTimezone] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [homeError, setHomeError] = useState('');
  const [plans, setPlans] = useState<Plans>({ past: [], upcoming: [] });
  const [history, setHistory] = useState<Page>(blankPage);
  const [planPage, setPlanPage] = useState<Page>(blankPage);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const requestId = useRef<string | null>(null);
  const [pickerReturn, setPickerReturn] = useState<'form' | 'progress'>('form');
  const [progressExercise, setProgressExercise] = useState<Exercise | null>(null);
  const [progress, setProgress] = useState<WorkoutProgress[]>([]);
  const [progressError, setProgressError] = useState('');
  const refresh = () => setRevision((value) => value + 1);
  const activeMode: Mode = mode === 'home' && workoutId ? 'detail' : mode;
  const activeId = selectedId ?? workoutId ?? null;

  useFocusEffect(
    useCallback(() => {
      void revision;
      if (!ownerId) return;
      let active = true;
      setLoading(true);
      setHomeError('');
      void loadProfile(ownerId)
        .then(async (profile) => {
          const date = getTodayWindow(Date.now(), profile.timezone).date;
          if (!active) return;
          setTimezone(profile.timezone);
          setToday(date);
          const results = await Promise.allSettled([
            listWorkoutPlans(ownerId, date),
            listWorkoutHistory(ownerId),
            workoutWeekActivity(date),
          ]);
          if (!active) return;
          if (results[0]?.status === 'fulfilled') setPlans(results[0].value);
          if (results[1]?.status === 'fulfilled') setHistory(results[1].value);
          if (results[2]?.status === 'fulfilled') setWeeks(results[2].value);
          if (results.some((result) => result.status === 'rejected'))
            setHomeError('Some workout information could not be loaded. Try again.');
        })
        .catch(() => {
          if (active) setHomeError('Workout information could not be loaded. Try again.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [ownerId, revision]),
  );
  useEffect(() => {
    if (!ownerId || !timezone || !today) return;
    const checkDay = () => {
      if (getTodayWindow(Date.now(), timezone).date !== today) setRevision((value) => value + 1);
    };
    const timer = setInterval(checkDay, 60_000);
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') setRevision((value) => value + 1);
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [ownerId, timezone, today]);
  useEffect(() => {
    if (!ownerId || !activeId || activeMode !== 'detail') return;
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (active) {
          setDetail(null);
          setDetailError('');
          setDetailLoading(true);
        }
      })
      .then(() => getWorkout(ownerId, activeId))
      .then((value) => {
        if (active) {
          if (value) setDetail(value);
          else setDetailError('Workout unavailable.');
        }
      })
      .catch(() => {
        if (active) setDetailError('Workout could not be loaded.');
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ownerId, activeId, activeMode, revision]);
  useEffect(() => {
    if (!ownerId || !progressExercise || activeMode !== 'progress') return;
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (active) {
          setProgress([]);
          setProgressError('');
        }
      })
      .then(() =>
        listExerciseProgress(ownerId, progressExercise.id, progressExercise.measurement_kind),
      )
      .then((value) => {
        if (active) setProgress(value);
      })
      .catch(() => {
        if (active) setProgressError('Exercise progress could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [ownerId, progressExercise, activeMode]);

  function backHome() {
    setMode('home');
    setSelectedId(null);
    setDetail(null);
    router.setParams({ workoutId: '' });
  }
  function open(id: string) {
    setSelectedId(id);
    setMode('detail');
  }
  function changeDraft(next: WorkoutDraft) {
    setDraft(next);
    setFormError('');
    requestId.current = null;
  }
  function startForm(completed: boolean, current?: Detail) {
    requestId.current = null;
    setFormError('');
    setDraft(
      current
        ? draftFromDetail(current, today)
        : {
            title: '',
            plannedDate: completed ? '' : today,
            performedDate: today,
            completed,
            entries: [],
          },
    );
    setMode('form');
  }
  async function save() {
    if (!ownerId || !draft || !today || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFormError('');
    try {
      const value = await saveWorkout(
        ownerId,
        requestId.current ?? (requestId.current = randomUUID()),
        draft,
        today,
        detail?.session ?? null,
      );
      setSelectedId(value.session.id);
      setDetail(value);
      setMode('detail');
      requestId.current = null;
      refresh();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Workout could not be saved.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function remove() {
    if (!detail || busyRef.current) return;
    Alert.alert('Delete workout?', 'This removes the workout and its exercise records.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (busyRef.current) return;
          busyRef.current = true;
          setBusy(true);
          setDetailError('');
          void deleteWorkout(detail.session)
            .then(() => {
              backHome();
              refresh();
            })
            .catch((caught: unknown) =>
              setDetailError(
                caught instanceof Error ? caught.message : 'Workout could not be deleted.',
              ),
            )
            .finally(() => {
              busyRef.current = false;
              setBusy(false);
            });
        },
      },
    ]);
  }
  async function moreHistory() {
    if (!ownerId || busyRef.current || !history.hasMore) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const page = await listWorkoutHistory(ownerId, history.items.length);
      setHistory((current) => ({ ...page, items: [...current.items, ...page.items] }));
    } catch {
      setHomeError('More history could not be loaded.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function showPlans() {
    if (!ownerId || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setHomeError('');
    try {
      setPlanPage(await listWorkoutPlanPage(ownerId));
      setMode('plans');
    } catch {
      setHomeError('Planned workouts could not be loaded.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function morePlans() {
    if (!ownerId || busyRef.current || !planPage.hasMore) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const page = await listWorkoutPlanPage(ownerId, planPage.items.length);
      setPlanPage((current) => ({ ...page, items: [...current.items, ...page.items] }));
    } catch {
      setHomeError('More planned workouts could not be loaded.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function choose(exercise: Exercise) {
    if (pickerReturn === 'progress') {
      setProgressExercise(exercise);
      setMode('progress');
      return;
    }
    if (!draft || draft.entries.some((entry) => entry.exercise.id === exercise.id)) return;
    changeDraft({ ...draft, entries: [...draft.entries, draftEntry(exercise)] });
    setMode('form');
  }

  if (mode === 'choose' || mode === 'library')
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        {ownerId ? (
          <ExerciseLibrary
            ownerId={ownerId}
            onSelect={mode === 'choose' ? choose : undefined}
            selectedIds={draft?.entries.map((entry) => entry.exercise.id) ?? []}
            onBack={() => setMode(mode === 'library' ? 'home' : pickerReturn)}
          />
        ) : null}
      </View>
    );
  if (mode === 'form' && draft)
    return (
      <WorkoutForm
        draft={draft}
        today={today}
        busy={busy}
        editing={detail !== null}
        error={formError}
        onChange={changeDraft}
        onAddExercise={() => {
          setPickerReturn('form');
          setMode('choose');
        }}
        onBack={() => setMode(detail ? 'detail' : 'home')}
        onSave={() => void save()}
      />
    );
  if (activeMode === 'detail')
    return (
      <Screen>
        <AppButton label="Back to workouts" variant="secondary" onPress={backHome} />
        {detailLoading ? <LoadingState label="Loading workout…" /> : null}
        {detailError ? <ErrorState description={detailError} onRetry={refresh} /> : null}
        {detail ? (
          <>
            <AppText variant="display">{detail.session.title}</AppText>
            <AppText style={{ fontWeight: '700' }}>
              {detail.session.completed_at
                ? 'Completed'
                : planState(detail.session.planned_date!, today)}
            </AppText>
            {detail.session.planned_date ? (
              <AppText>Planned: {dateLabel(detail.session.planned_date)}</AppText>
            ) : null}
            {detail.session.performed_date ? (
              <AppText>Workout date: {dateLabel(detail.session.performed_date)}</AppText>
            ) : null}
            <AppText variant="title">Exercises</AppText>
            {detail.entries.map((entry) => (
              <View
                key={entry.id}
                style={{
                  padding: theme.spacing.lg,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surface,
                  gap: theme.spacing.sm,
                }}
              >
                <AppText style={{ fontWeight: '700' }}>{entry.name_snapshot}</AppText>
                <AppText>{formatMeasurement(entry)}</AppText>
              </View>
            ))}
            {!detail.session.completed_at ? (
              <AppButton
                label="Complete workout"
                disabled={busy}
                onPress={() => {
                  setDraft({
                    ...draftFromDetail(detail, today),
                    completed: true,
                    performedDate: today,
                  });
                  requestId.current = null;
                  setFormError('');
                  setMode('form');
                }}
              />
            ) : null}
            <AppButton
              label="Edit workout"
              variant="secondary"
              disabled={busy}
              onPress={() => startForm(false, detail)}
            />
            <AppButton
              label="Delete workout"
              variant="secondary"
              submitting={busy}
              onPress={remove}
            />
          </>
        ) : null}
      </Screen>
    );
  if (mode === 'history')
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <FlatList
          data={history.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.md }}
          ListHeaderComponent={
            <View style={{ gap: theme.spacing.md }}>
              <AppButton label="Back to workouts" variant="secondary" onPress={backHome} />
              <AppText variant="display">Workout history</AppText>
              <AppText tone="mutedText">{history.total} completed workouts</AppText>
              {homeError ? <ErrorState description={homeError} onRetry={refresh} /> : null}
            </View>
          }
          renderItem={({ item }) => (
            <WorkoutCard session={item} today={today} onPress={() => open(item.id)} />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No completed workouts yet"
              description="Log a workout to start your history."
            />
          }
          ListFooterComponent={
            history.hasMore ? (
              <AppButton
                label="Load more workouts"
                variant="secondary"
                submitting={busy}
                onPress={() => void moreHistory()}
              />
            ) : undefined
          }
        />
      </View>
    );
  if (mode === 'plans')
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <FlatList
          data={planPage.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.md }}
          ListHeaderComponent={
            <View style={{ gap: theme.spacing.md }}>
              <AppButton label="Back to workouts" variant="secondary" onPress={backHome} />
              <AppText variant="display">Planned workouts</AppText>
              <AppText tone="mutedText">{planPage.total} plans, including past plans</AppText>
              {homeError ? (
                <ErrorState description={homeError} onRetry={() => void showPlans()} />
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <WorkoutCard session={item} today={today} onPress={() => open(item.id)} />
          )}
          ListEmptyComponent={
            <EmptyState title="No planned workouts" description="Plan a workout to see it here." />
          }
          ListFooterComponent={
            planPage.hasMore ? (
              <AppButton
                label="Load more plans"
                variant="secondary"
                submitting={busy}
                onPress={() => void morePlans()}
              />
            ) : undefined
          }
        />
      </View>
    );
  if (mode === 'progress')
    return (
      <Screen>
        <AppButton label="Back to workouts" variant="secondary" onPress={backHome} />
        <AppText variant="display">Exercise progress</AppText>
        {progressExercise ? (
          <>
            <AppText variant="title">{progressExercise.name}</AppText>
            <AppText tone="mutedText">
              Recent comparable {measurementLabel(progressExercise.measurement_kind).toLowerCase()}{' '}
              records.
            </AppText>
            {progressError ? <ErrorState description={progressError} /> : null}
            {progress.length === 0 && !progressError ? (
              <EmptyState
                title="No matching records yet"
                description="Complete a workout with this exercise to see progress."
              />
            ) : null}
            {progress.map((record) => (
              <View
                key={record.session_id}
                style={{
                  padding: theme.spacing.lg,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surface,
                }}
              >
                <AppText>
                  {dateLabel(record.performed_date)} · {formatMeasurement(record)}
                </AppText>
              </View>
            ))}
          </>
        ) : null}
        <AppButton
          label="Choose another exercise"
          variant="secondary"
          onPress={() => {
            setPickerReturn('progress');
            setMode('choose');
          }}
        />
      </Screen>
    );
  return (
    <Screen>
      <AppText variant="display">Workout</AppText>
      <AppText tone="mutedText">
        Log exercises, keep one-time plans, and review your activity.
      </AppText>
      <AppButton
        label="Log workout"
        disabled={!today}
        onPress={() => {
          setDetail(null);
          startForm(true);
        }}
      />
      <AppButton
        label="Plan workout"
        variant="secondary"
        disabled={!today}
        onPress={() => {
          setDetail(null);
          startForm(false);
        }}
      />
      {loading ? <LoadingState label="Loading workouts…" /> : null}
      {homeError ? <ErrorState description={homeError} onRetry={refresh} /> : null}
      <AppText variant="title">Planned workouts</AppText>
      {!loading && !plans.past.length && !plans.upcoming.length ? (
        <EmptyState
          title="No planned workouts"
          description="Plan a workout for a date that works for you."
        />
      ) : null}
      {[...plans.past, ...plans.upcoming].map((item) => (
        <WorkoutCard key={item.id} session={item} today={today} onPress={() => open(item.id)} />
      ))}
      {plans.past.length === 10 || plans.upcoming.length === 20 ? (
        <AppText tone="mutedText">Showing recent past plans and the next 20 plans.</AppText>
      ) : null}
      <AppButton
        label="View all planned workouts"
        variant="secondary"
        submitting={busy}
        onPress={() => void showPlans()}
      />
      <AppText variant="title">Progress</AppText>
      <AppText>{history.total} completed workouts</AppText>
      <AppText tone="mutedText">Past four full calendar weeks</AppText>
      {weeks.map((week) => (
        <AppText key={week.week_start}>
          Week of {dateLabel(week.week_start)}: {week.session_count}{' '}
          {week.session_count === 1 ? 'workout' : 'workouts'}
        </AppText>
      ))}
      <AppText style={{ fontWeight: '700' }}>
        {weeks.filter((week) => week.session_count > 0).length} of 4 weeks active
      </AppText>
      <AppButton
        label="View exercise progress"
        variant="secondary"
        onPress={() => {
          setPickerReturn('progress');
          setMode('choose');
        }}
      />
      <AppText variant="title">Recent workouts</AppText>
      {history.items.slice(0, 5).map((item) => (
        <WorkoutCard key={item.id} session={item} today={today} onPress={() => open(item.id)} />
      ))}
      {!loading && !history.total ? (
        <EmptyState
          title="No workouts logged"
          description="Your completed workouts will appear here."
        />
      ) : null}
      <AppButton
        label="View workout history"
        variant="secondary"
        onPress={() => setMode('history')}
      />
      <AppButton
        label="Manage exercise library"
        variant="secondary"
        onPress={() => setMode('library')}
      />
    </Screen>
  );
}
