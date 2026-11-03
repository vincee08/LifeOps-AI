import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { WorkoutDraft, WorkoutEntryDraft } from './workout-model';
import { measurementLabel } from './workout-model';

function Field({
  label,
  value,
  onChange,
  busy,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  numeric?: 'integer' | 'decimal';
}) {
  const theme = useAppTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText>{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        editable={!busy}
        keyboardType={
          numeric === 'integer' ? 'number-pad' : numeric === 'decimal' ? 'decimal-pad' : 'default'
        }
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

export function WorkoutForm({
  draft,
  today,
  busy,
  error,
  editing,
  onChange,
  onAddExercise,
  onBack,
  onSave,
}: {
  draft: WorkoutDraft;
  today: string;
  busy: boolean;
  error: string;
  editing: boolean;
  onChange: (next: WorkoutDraft) => void;
  onAddExercise: () => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const theme = useAppTheme();
  const nextDay = new Date(`${today}T12:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const tomorrow = nextDay.toISOString().slice(0, 10);
  const changeEntry = (index: number, changes: Partial<WorkoutEntryDraft>) =>
    onChange({
      ...draft,
      entries: draft.entries.map((entry, i) => (i === index ? { ...entry, ...changes } : entry)),
    });
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          padding: theme.spacing.xl,
          gap: theme.spacing.lg,
          paddingBottom: theme.spacing.xxxl,
        }}
      >
        <AppButton label="Back to workouts" variant="secondary" onPress={onBack} disabled={busy} />
        <AppText variant="display">
          {editing ? 'Edit workout' : draft.completed ? 'Log workout' : 'Plan workout'}
        </AppText>
        <Field
          label="Workout name"
          value={draft.title}
          busy={busy}
          onChange={(title) => onChange({ ...draft, title })}
        />
        {editing ? (
          <AppButton
            variant="secondary"
            label={draft.completed ? 'Change to planned' : 'Mark as completed'}
            disabled={busy}
            onPress={() =>
              onChange({
                ...draft,
                completed: !draft.completed,
                plannedDate: draft.completed ? draft.plannedDate || today : draft.plannedDate,
                performedDate: draft.completed ? '' : today,
              })
            }
          />
        ) : null}
        {editing && !draft.completed ? (
          <AppText tone="mutedText">
            Saving as planned clears logged measurements. Add them when you complete the workout.
          </AppText>
        ) : null}
        {!draft.completed || draft.plannedDate ? (
          <>
            <Field
              label="Planned date (YYYY-MM-DD)"
              value={draft.plannedDate}
              busy={busy}
              onChange={(plannedDate) => onChange({ ...draft, plannedDate })}
            />
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <AppButton
                  label="Today"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => onChange({ ...draft, plannedDate: today })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton
                  label="Tomorrow"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => onChange({ ...draft, plannedDate: tomorrow })}
                />
              </View>
            </View>
          </>
        ) : null}
        {draft.completed ? (
          <>
            <Field
              label="Workout date (YYYY-MM-DD)"
              value={draft.performedDate}
              busy={busy}
              onChange={(performedDate) => onChange({ ...draft, performedDate })}
            />
            <AppButton
              label="Use today"
              variant="secondary"
              disabled={busy}
              onPress={() => onChange({ ...draft, performedDate: today })}
            />
          </>
        ) : null}
        <View style={{ gap: theme.spacing.md }}>
          <AppText variant="title">Exercises</AppText>
          {draft.entries.map((entry, index) => (
            <View
              key={entry.exercise.id}
              style={{
                padding: theme.spacing.lg,
                gap: theme.spacing.md,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              }}
            >
              <AppText style={{ fontWeight: '700' }}>{entry.exercise.name}</AppText>
              <AppText tone="mutedText">
                {measurementLabel(entry.exercise.measurement_kind)}
              </AppText>
              {!draft.completed ? null : entry.exercise.measurement_kind === 'duration' ? (
                <>
                  <Field
                    label={`${entry.exercise.name} minutes`}
                    value={entry.minutes}
                    busy={busy}
                    numeric="integer"
                    onChange={(minutes) => changeEntry(index, { minutes })}
                  />
                  <Field
                    label={`${entry.exercise.name} seconds`}
                    value={entry.seconds}
                    busy={busy}
                    numeric="integer"
                    onChange={(seconds) => changeEntry(index, { seconds })}
                  />
                </>
              ) : (
                <>
                  <Field
                    label={`${entry.exercise.name} sets`}
                    value={entry.sets}
                    busy={busy}
                    numeric="integer"
                    onChange={(sets) => changeEntry(index, { sets })}
                  />
                  <Field
                    label={`${entry.exercise.name} repetitions per set`}
                    value={entry.reps}
                    busy={busy}
                    numeric="integer"
                    onChange={(reps) => changeEntry(index, { reps })}
                  />
                  {entry.exercise.measurement_kind === 'weighted_reps' ? (
                    <Field
                      label={`${entry.exercise.name} weight (kg)`}
                      value={entry.weightKg}
                      busy={busy}
                      numeric="decimal"
                      onChange={(weightKg) => changeEntry(index, { weightKg })}
                    />
                  ) : null}
                </>
              )}
              <AppButton
                label={`Remove ${entry.exercise.name}`}
                variant="secondary"
                disabled={busy}
                onPress={() =>
                  onChange({ ...draft, entries: draft.entries.filter((_, i) => i !== index) })
                }
              />
            </View>
          ))}
          <AppButton
            label="Add exercise"
            variant="secondary"
            onPress={onAddExercise}
            disabled={busy || draft.entries.length >= 20}
          />
        </View>
        {error ? (
          <AppText accessibilityRole="alert" style={{ color: theme.colors.danger }}>
            {error}
          </AppText>
        ) : null}
        <AppButton
          label={draft.completed ? 'Save completed workout' : 'Save planned workout'}
          submitting={busy}
          onPress={onSave}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
