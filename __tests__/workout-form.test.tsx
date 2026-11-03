import { fireEvent, render, screen } from '@testing-library/react-native';
import { WorkoutForm } from '@/features/workout/WorkoutForm';
import type { WorkoutDraft } from '@/features/workout/workout-model';
import type { ExerciseRow } from '@/lib/database.types';

const exercise = (id: string, kind: ExerciseRow['measurement_kind']): ExerciseRow => ({
  id,
  user_id: 'owner',
  client_request_id: 'request',
  name: id,
  measurement_kind: kind,
  archived_at: null,
  created_at: '',
  updated_at: '',
});
const base: WorkoutDraft = {
  title: 'Training',
  plannedDate: '',
  performedDate: '2026-11-02',
  completed: true,
  entries: [
    {
      exercise: exercise('Push-up', 'reps'),
      sets: '3',
      reps: '10',
      weightKg: '',
      minutes: '',
      seconds: '',
    },
    {
      exercise: exercise('Squat', 'weighted_reps'),
      sets: '3',
      reps: '8',
      weightKg: '40',
      minutes: '',
      seconds: '',
    },
    {
      exercise: exercise('Plank', 'duration'),
      sets: '',
      reps: '',
      weightKg: '',
      minutes: '1',
      seconds: '30',
    },
  ],
};

it('shows only measurements appropriate to each exercise and submits once pressed', async () => {
  const save = jest.fn();
  await render(
    <WorkoutForm
      draft={base}
      today="2026-11-02"
      busy={false}
      error=""
      editing={false}
      onChange={jest.fn()}
      onAddExercise={jest.fn()}
      onBack={jest.fn()}
      onSave={save}
    />,
  );
  expect(screen.getByLabelText('Push-up sets')).toBeTruthy();
  expect(screen.getByLabelText('Push-up repetitions per set')).toBeTruthy();
  expect(screen.queryByLabelText('Push-up weight (kg)')).toBeNull();
  expect(screen.getByLabelText('Squat weight (kg)')).toBeTruthy();
  expect(screen.getByLabelText('Plank minutes')).toBeTruthy();
  expect(screen.getByLabelText('Plank seconds')).toBeTruthy();
  expect(screen.queryByLabelText('Plank sets')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Save completed workout' }));
  expect(save).toHaveBeenCalledTimes(1);
});

it('keeps the original planned date while switching an edited plan to completed', async () => {
  const change = jest.fn();
  await render(
    <WorkoutForm
      draft={{ ...base, completed: false, plannedDate: '2026-11-03', performedDate: '' }}
      today="2026-11-02"
      busy={false}
      error=""
      editing
      onChange={change}
      onAddExercise={jest.fn()}
      onBack={jest.fn()}
      onSave={jest.fn()}
    />,
  );
  expect(screen.getByLabelText('Planned date (YYYY-MM-DD)')).toBeTruthy();
  expect(screen.queryByLabelText('Workout date (YYYY-MM-DD)')).toBeNull();
  expect(screen.queryByLabelText('Push-up sets')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Mark as completed' }));
  expect(change).toHaveBeenCalledWith(
    expect.objectContaining({
      completed: true,
      plannedDate: '2026-11-03',
      performedDate: '2026-11-02',
    }),
  );
});

it('disables submission while saving and preserves visible error text', async () => {
  await render(
    <WorkoutForm
      draft={base}
      today="2026-11-02"
      busy
      error="Network unavailable"
      editing={false}
      onChange={jest.fn()}
      onAddExercise={jest.fn()}
      onBack={jest.fn()}
      onSave={jest.fn()}
    />,
  );
  expect(screen.getByText('Network unavailable')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Save completed workout' }).props.accessibilityState.busy,
  ).toBe(true);
});
