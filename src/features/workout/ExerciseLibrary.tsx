import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { EmptyState, LoadingState } from '@/components/ui/StateView';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { WorkoutMeasurement } from '@/lib/database.types';
import { measurementLabel } from './workout-model';
import {
  archiveExercise,
  createExercise,
  listExercises,
  updateExercise,
  type Exercise,
} from './workout-service';

const kinds: WorkoutMeasurement[] = ['reps', 'weighted_reps', 'duration'];

export function ExerciseLibrary({
  ownerId,
  onBack,
  onSelect,
  selectedIds = [],
}: {
  ownerId: string;
  onBack: () => void;
  onSelect?: (exercise: Exercise) => void;
  selectedIds?: string[];
}) {
  const theme = useAppTheme();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Exercise[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<WorkoutMeasurement>('reps');
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [revision, setRevision] = useState(0);
  const requestId = useRef<string | null>(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void listExercises(ownerId, search)
        .then((page) => {
          if (!active) return;
          setItems(page.items);
          setHasMore(page.hasMore);
        })
        .catch(() => {
          if (active) setError('Exercises could not be loaded. Try again.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [ownerId, search, revision]);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = editing
        ? await updateExercise(ownerId, editing, name, kind)
        : await createExercise(
            ownerId,
            requestId.current ?? (requestId.current = randomUUID()),
            name,
            kind,
          );
      setName('');
      setKind('reps');
      setEditing(null);
      requestId.current = null;
      refresh();
      if (onSelect) onSelect(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Exercise could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (busy || !hasMore) return;
    setBusy(true);
    setError('');
    try {
      const page = await listExercises(ownerId, search, items.length);
      setItems((current) => [...current, ...page.items]);
      setHasMore(page.hasMore);
    } catch {
      setError('More exercises could not be loaded.');
    } finally {
      setBusy(false);
    }
  }

  function confirmArchive(exercise: Exercise) {
    Alert.alert(
      'Archive exercise?',
      'Existing workout history will keep its saved name and measurements.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => {
            if (busy) return;
            setBusy(true);
            setError('');
            void archiveExercise(ownerId, exercise)
              .then(refresh)
              .catch((caught: unknown) =>
                setError(
                  caught instanceof Error ? caught.message : 'Exercise could not be archived.',
                ),
              )
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{
        padding: theme.spacing.xl,
        gap: theme.spacing.lg,
        paddingBottom: theme.spacing.xxxl,
      }}
    >
      <AppButton label="Back" variant="secondary" onPress={onBack} disabled={busy} />
      <AppText variant="display">{onSelect ? 'Choose exercise' : 'Exercise library'}</AppText>
      <AppText tone="mutedText">
        Saved exercises can be reused. Editing one will not change past workouts.
      </AppText>
      <View style={{ gap: theme.spacing.sm }}>
        <AppText>Search exercises</AppText>
        <TextInput
          accessibilityLabel="Search exercises"
          value={search}
          onChangeText={setSearch}
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
      {loading ? <LoadingState label="Loading exercises…" /> : null}
      {!loading && items.length === 0 ? (
        <EmptyState
          title="No exercises found"
          description="Add an exercise below to get started."
        />
      ) : null}
      {items.map((exercise) => (
        <View
          key={exercise.id}
          style={{
            padding: theme.spacing.lg,
            gap: theme.spacing.sm,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <AppText style={{ fontWeight: '700' }}>{exercise.name}</AppText>
          <AppText tone="mutedText">{measurementLabel(exercise.measurement_kind)}</AppText>
          {onSelect ? (
            <AppButton
              label={selectedIds.includes(exercise.id) ? 'Already added' : `Add ${exercise.name}`}
              disabled={busy || selectedIds.includes(exercise.id)}
              onPress={() => onSelect(exercise)}
            />
          ) : null}
          <AppButton
            label={`Edit ${exercise.name}`}
            variant="secondary"
            disabled={busy}
            onPress={() => {
              setEditing(exercise);
              setName(exercise.name);
              setKind(exercise.measurement_kind);
              requestId.current = null;
            }}
          />
          <AppButton
            label={`Archive ${exercise.name}`}
            variant="secondary"
            disabled={busy}
            onPress={() => confirmArchive(exercise)}
          />
        </View>
      ))}
      {hasMore ? (
        <AppButton
          label="Load more exercises"
          variant="secondary"
          submitting={busy}
          onPress={() => void loadMore()}
        />
      ) : null}
      <View
        style={{
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        <AppText variant="title">{editing ? 'Edit exercise' : 'Add custom exercise'}</AppText>
        <TextInput
          accessibilityLabel="Exercise name"
          placeholder="Exercise name"
          placeholderTextColor={theme.colors.mutedText}
          value={name}
          editable={!busy}
          onChangeText={(value) => {
            setName(value);
            requestId.current = null;
          }}
          style={{
            minHeight: 48,
            padding: theme.spacing.md,
            color: theme.colors.text,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: theme.radius.md,
          }}
        />
        {kinds.map((option) => (
          <AppButton
            key={option}
            variant={kind === option ? 'primary' : 'secondary'}
            label={measurementLabel(option)}
            accessibilityLabel={`Use ${measurementLabel(option)}`}
            disabled={busy}
            onPress={() => {
              setKind(option);
              requestId.current = null;
            }}
          />
        ))}
        <AppButton
          label={editing ? 'Save exercise changes' : 'Create exercise'}
          submitting={busy}
          onPress={() => void save()}
        />
        {editing ? (
          <AppButton
            label="Cancel editing"
            variant="secondary"
            disabled={busy}
            onPress={() => {
              setEditing(null);
              setName('');
              setKind('reps');
            }}
          />
        ) : null}
      </View>
      {error ? (
        <AppText accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {error}
        </AppText>
      ) : null}
    </ScrollView>
  );
}
