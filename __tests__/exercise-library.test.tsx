import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ExerciseLibrary } from '@/features/workout/ExerciseLibrary';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'stable-exercise-request' }));

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockArchive = jest.fn();
jest.mock('@/features/workout/workout-service', () => ({
  listExercises: (...args: unknown[]) => mockList(...args),
  createExercise: (...args: unknown[]) => mockCreate(...args),
  updateExercise: (...args: unknown[]) => mockUpdate(...args),
  archiveExercise: (...args: unknown[]) => mockArchive(...args),
}));
const exercise = {
  id: 'exercise-1',
  user_id: 'owner',
  client_request_id: 'request',
  name: 'Push-up',
  measurement_kind: 'reps',
  archived_at: null,
  created_at: '',
  updated_at: '',
};
beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue({ items: [exercise], total: 1, hasMore: false });
  mockCreate.mockResolvedValue({
    ...exercise,
    id: 'new',
    name: 'Plank',
    measurement_kind: 'duration',
  });
});

it('searches owner exercises and selects a reusable entry', async () => {
  const select = jest.fn();
  await render(<ExerciseLibrary ownerId="owner" onBack={jest.fn()} onSelect={select} />);
  expect(await screen.findByText('Push-up')).toBeTruthy();
  expect(mockList).toHaveBeenCalledWith('owner', '');
  fireEvent.press(screen.getByRole('button', { name: 'Add Push-up' }));
  expect(select).toHaveBeenCalledWith(exercise);
}, 15_000);

it('creates a custom duration exercise and selects it', async () => {
  const select = jest.fn();
  await render(<ExerciseLibrary ownerId="owner" onBack={jest.fn()} onSelect={select} />);
  await screen.findByText('Push-up');
  await act(async () => fireEvent.changeText(screen.getByLabelText('Exercise name'), 'Plank'));
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Use Duration' })));
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Create exercise' })));
  expect(mockCreate).toHaveBeenCalledWith('owner', expect.any(String), 'Plank', 'duration');
  await waitFor(() =>
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Plank', measurement_kind: 'duration' }),
    ),
  );
});

it('loads existing exercise information for editing without touching history', async () => {
  await render(<ExerciseLibrary ownerId="owner" onBack={jest.fn()} />);
  await screen.findByText('Push-up');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Edit Push-up' })));
  expect(screen.getByLabelText('Exercise name').props.value).toBe('Push-up');
  expect(screen.getByText('Edit exercise')).toBeTruthy();
});
