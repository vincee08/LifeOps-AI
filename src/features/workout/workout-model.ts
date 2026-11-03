import type { ExerciseRow, WorkoutMeasurement } from '@/lib/database.types';

export type WorkoutEntryDraft = {
  exercise: ExerciseRow;
  sets: string;
  reps: string;
  weightKg: string;
  minutes: string;
  seconds: string;
};
export type WorkoutDraft = {
  title: string;
  plannedDate: string;
  performedDate: string;
  completed: boolean;
  entries: WorkoutEntryDraft[];
};
export type WorkoutEntryInput = {
  exercise_id: string;
  sets: number | null;
  reps: number | null;
  weight_kg: string | null;
  duration_seconds: number | null;
};

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= '2000-01-01' &&
    value <= '2100-12-31'
  );
}

function wholeNumber(value: string, min: number, max: number, label: string): number {
  if (!/^\d+$/.test(value.trim())) throw new Error(`${label} must be a whole number.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max)
    throw new Error(`${label} must be between ${min} and ${max}.`);
  return number;
}

export function validateWorkoutDraft(draft: WorkoutDraft, today: string) {
  const title = draft.title.trim();
  if (title.length < 1 || title.length > 100)
    throw new Error('Workout name must be 1–100 characters.');
  const plannedDate = draft.plannedDate.trim() || null;
  const performedDate = draft.completed ? draft.performedDate.trim() : null;
  if (plannedDate && !validDate(plannedDate))
    throw new Error('Enter a valid planned date (YYYY-MM-DD).');
  if (draft.completed) {
    if (!performedDate || !validDate(performedDate))
      throw new Error('Enter a valid workout date (YYYY-MM-DD).');
    if (performedDate > today) throw new Error('Workout date cannot be in the future.');
  } else if (!plannedDate) throw new Error('Enter a planned date (YYYY-MM-DD).');
  if (draft.entries.length < 1 || draft.entries.length > 20)
    throw new Error('Add between 1 and 20 exercises.');
  const seen = new Set<string>();
  const entries: WorkoutEntryInput[] = draft.entries.map((entry) => {
    const id = entry.exercise.id;
    if (seen.has(id)) throw new Error('Select each exercise only once.');
    seen.add(id);
    if (!draft.completed)
      return { exercise_id: id, sets: null, reps: null, weight_kg: null, duration_seconds: null };
    if (entry.exercise.measurement_kind === 'duration') {
      const minutes = wholeNumber(entry.minutes.trim() || '0', 0, 1440, 'Minutes');
      const seconds = wholeNumber(entry.seconds.trim() || '0', 0, 59, 'Seconds');
      const duration = minutes * 60 + seconds;
      if (duration < 1 || duration > 86400)
        throw new Error('Duration must be between 1 second and 24 hours.');
      return {
        exercise_id: id,
        sets: null,
        reps: null,
        weight_kg: null,
        duration_seconds: duration,
      };
    }
    const sets = wholeNumber(entry.sets, 1, 60, 'Sets');
    const reps = wholeNumber(entry.reps, 1, 1000, 'Repetitions');
    let weight: string | null = null;
    if (entry.exercise.measurement_kind === 'weighted_reps') {
      const raw = entry.weightKg.trim();
      if (!/^(?:\d{1,4})(?:\.\d{1,2})?$/.test(raw) || Number(raw) <= 0 || Number(raw) > 2000)
        throw new Error(
          'Weight must be above 0 and at most 2,000 kg, with up to 2 decimal places.',
        );
      weight = raw;
    }
    return { exercise_id: id, sets, reps, weight_kg: weight, duration_seconds: null };
  });
  return { title, planned_date: plannedDate, performed_date: performedDate, entries };
}

export function measurementLabel(kind: WorkoutMeasurement) {
  return kind === 'weighted_reps'
    ? 'Weighted repetitions'
    : kind === 'duration'
      ? 'Duration'
      : 'Repetitions';
}

export function formatMeasurement(entry: {
  measurement_kind: WorkoutMeasurement;
  sets: number | null;
  reps: number | null;
  weight_kg: string | number | null;
  duration_seconds: number | null;
}) {
  if (entry.measurement_kind === 'duration') {
    const seconds = entry.duration_seconds ?? 0;
    return `${Math.floor(seconds / 60)} min ${seconds % 60} sec`;
  }
  const base = `${entry.sets} sets × ${entry.reps} reps`;
  return entry.measurement_kind === 'weighted_reps' ? `${base} · ${entry.weight_kg} kg` : base;
}

export function planState(plannedDate: string, today: string) {
  return plannedDate < today ? 'Past plan' : plannedDate === today ? 'Planned today' : 'Planned';
}
