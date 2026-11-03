import {
  listExerciseProgress,
  listTodayWorkouts,
  listWorkoutHistory,
  listWorkoutPlanPage,
  saveWorkout,
  type WorkoutSession,
} from '@/features/workout/workout-service';
import type { WorkoutDraft } from '@/features/workout/workout-model';

const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));
const base: WorkoutSession = {
  id: 'session-1',
  user_id: 'owner',
  client_request_id: 'create',
  title: 'Workout',
  planned_date: null,
  performed_date: '2026-11-02',
  completed_at: '2026-11-02T10:00:00Z',
  created_at: '',
  updated_at: '2026-11-02T10:00:00Z',
};
function query(result: { data: unknown; count?: number; error: null }) {
  const q = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn(async () => result),
    limit: jest.fn(async () => result),
    maybeSingle: jest.fn(async () => result),
    then: (resolve: (value: typeof result) => void) => Promise.resolve(result).then(resolve),
  };
  mockFrom.mockReturnValue(q);
  return q;
}
beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

it('pages completed history with exact count and stable ordering', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ ...base, id: `session-${i}` }));
  const q = query({ data: rows, count: 21, error: null });
  const page = await listWorkoutHistory('owner', 0);
  expect(page).toEqual({ items: rows, total: 21, hasMore: true });
  expect(q.eq).toHaveBeenCalledWith('user_id', 'owner');
  expect(q.not).toHaveBeenCalledWith('completed_at', 'is', null);
  expect(q.order).toHaveBeenCalledWith('performed_date', { ascending: false });
  expect(q.order).toHaveBeenCalledWith('id', { ascending: false });
  expect(q.range).toHaveBeenCalledWith(0, 19);
});

it('pages past and future plans so older missed plans remain accessible', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    ...base,
    id: `plan-${i}`,
    completed_at: null,
    planned_date: '2026-10-01',
    performed_date: null,
  }));
  const q = query({ data: rows, count: 42, error: null });
  const page = await listWorkoutPlanPage('owner', 20);
  expect(page.hasMore).toBe(true);
  expect(q.is).toHaveBeenCalledWith('completed_at', null);
  expect(q.range).toHaveBeenCalledWith(20, 39);
});

it('uses separate date and state filters for Today', async () => {
  const planned = { ...base, planned_date: '2026-11-02', performed_date: null, completed_at: null };
  const first = query({ data: [planned], count: 1, error: null });
  await listTodayWorkouts('owner', '2026-11-02', 'planned');
  expect(first.is).toHaveBeenCalledWith('completed_at', null);
  expect(first.eq).toHaveBeenCalledWith('planned_date', '2026-11-02');
  const second = query({ data: [base], count: 1, error: null });
  await listTodayWorkouts('owner', '2026-11-02', 'completed');
  expect(second.not).toHaveBeenCalledWith('completed_at', 'is', null);
  expect(second.eq).toHaveBeenCalledWith('performed_date', '2026-11-02');
});

it('sends one atomic create command using an owner-free payload and reloads persistence', async () => {
  const exercise = {
    id: 'exercise-1',
    user_id: 'owner',
    client_request_id: '',
    name: 'Push-up',
    measurement_kind: 'reps' as const,
    archived_at: null,
    created_at: '',
    updated_at: '',
  };
  const draft: WorkoutDraft = {
    title: ' Push day ',
    plannedDate: '',
    performedDate: '2026-11-02',
    completed: true,
    entries: [{ exercise, sets: '3', reps: '10', weightKg: '', minutes: '', seconds: '' }],
  };
  mockRpc.mockResolvedValue({ data: 'session-1', error: null });
  const session = query({ data: base, error: null });
  mockFrom.mockImplementationOnce(() => session);
  const entries = query({ data: [], error: null });
  mockFrom.mockImplementationOnce(() => entries);
  await expect(saveWorkout('owner', 'request-1', draft, '2026-11-02')).resolves.toEqual({
    session: base,
    entries: [],
  });
  expect(mockRpc).toHaveBeenCalledWith('save_workout_session', {
    p_session_id: null,
    p_request_id: 'request-1',
    p_expected_updated_at: null,
    p_title: 'Push day',
    p_planned_date: null,
    p_performed_date: '2026-11-02',
    p_entries: [
      { exercise_id: 'exercise-1', sets: 3, reps: 10, weight_kg: null, duration_seconds: null },
    ],
  });
});

it('requests only comparable records for exercise progress', async () => {
  const q = query({ data: [], error: null });
  await listExerciseProgress('owner', 'exercise-1', 'reps');
  expect(q.eq).toHaveBeenCalledWith('measurement_kind', 'reps');
  expect(q.eq).toHaveBeenCalledWith('exercise_id', 'exercise-1');
});
