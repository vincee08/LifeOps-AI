import {
  formatMeasurement,
  planState,
  validateWorkoutDraft,
  validDate,
  type WorkoutDraft,
} from '@/features/workout/workout-model';
import type { ExerciseRow } from '@/lib/database.types';

const exercise = (kind: ExerciseRow['measurement_kind'], id = kind): ExerciseRow => ({
  id,
  user_id: 'owner',
  client_request_id: 'request',
  name: kind,
  measurement_kind: kind,
  archived_at: null,
  created_at: '',
  updated_at: '',
});
const draft: WorkoutDraft = {
  title: ' Morning ',
  completed: true,
  plannedDate: '',
  performedDate: '2026-11-02',
  entries: [
    { exercise: exercise('reps'), sets: '3', reps: '10', weightKg: '', minutes: '', seconds: '' },
    {
      exercise: exercise('weighted_reps'),
      sets: '4',
      reps: '8',
      weightKg: '40.50',
      minutes: '',
      seconds: '',
    },
    {
      exercise: exercise('duration'),
      sets: '',
      reps: '',
      weightKg: '',
      minutes: '1',
      seconds: '30',
    },
  ],
};

it('validates and converts the three measurement types', () => {
  expect(validateWorkoutDraft(draft, '2026-11-02')).toEqual({
    title: 'Morning',
    planned_date: null,
    performed_date: '2026-11-02',
    entries: [
      { exercise_id: 'reps', sets: 3, reps: 10, weight_kg: null, duration_seconds: null },
      {
        exercise_id: 'weighted_reps',
        sets: 4,
        reps: 8,
        weight_kg: '40.50',
        duration_seconds: null,
      },
      { exercise_id: 'duration', sets: null, reps: null, weight_kg: null, duration_seconds: 90 },
    ],
  });
  expect(
    formatMeasurement({
      measurement_kind: 'duration',
      sets: null,
      reps: null,
      weight_kg: null,
      duration_seconds: 90,
    }),
  ).toBe('1 min 30 sec');
});

it('keeps one-time plans planned and validates calendar dates', () => {
  const planned = validateWorkoutDraft(
    { ...draft, completed: false, plannedDate: '2026-11-03' },
    '2026-11-02',
  );
  expect(planned.performed_date).toBeNull();
  expect(
    planned.entries.every((entry) => entry.sets === null && entry.duration_seconds === null),
  ).toBe(true);
  expect(planState('2026-11-01', '2026-11-02')).toBe('Past plan');
  expect(planState('2026-11-02', '2026-11-02')).toBe('Planned today');
  expect(validDate('2028-02-29')).toBe(true);
  expect(validDate('2027-02-29')).toBe(false);
  expect(validDate('2026-13-01')).toBe(false);
});

it('rejects missing, duplicate, future, fractional, and excessive values', () => {
  expect(() => validateWorkoutDraft({ ...draft, title: ' ' }, '2026-11-02')).toThrow(
    'Workout name',
  );
  expect(() => validateWorkoutDraft({ ...draft, entries: [] }, '2026-11-02')).toThrow(
    'Add between',
  );
  expect(() =>
    validateWorkoutDraft({ ...draft, performedDate: '2026-11-03' }, '2026-11-02'),
  ).toThrow('future');
  expect(() =>
    validateWorkoutDraft(
      { ...draft, entries: [draft.entries[0]!, draft.entries[0]!] },
      '2026-11-02',
    ),
  ).toThrow('only once');
  expect(() =>
    validateWorkoutDraft(
      { ...draft, entries: [{ ...draft.entries[0]!, sets: '1.5' }] },
      '2026-11-02',
    ),
  ).toThrow('whole number');
  expect(() =>
    validateWorkoutDraft(
      { ...draft, entries: [{ ...draft.entries[0]!, reps: '1001' }] },
      '2026-11-02',
    ),
  ).toThrow('between');
  expect(() =>
    validateWorkoutDraft(
      { ...draft, entries: [{ ...draft.entries[1]!, weightKg: '20.001' }] },
      '2026-11-02',
    ),
  ).toThrow('decimal places');
  expect(() =>
    validateWorkoutDraft(
      { ...draft, entries: [{ ...draft.entries[2]!, minutes: '1441' }] },
      '2026-11-02',
    ),
  ).toThrow('between');
  expect(() =>
    validateWorkoutDraft(
      { ...draft, entries: [{ ...draft.entries[2]!, minutes: '0', seconds: '0' }] },
      '2026-11-02',
    ),
  ).toThrow('Duration');
});
