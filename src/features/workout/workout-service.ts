import type {
  ExerciseRow,
  WorkoutMeasurement,
  WorkoutProgressRow,
  WorkoutSessionExerciseRow,
  WorkoutSessionRow,
} from '@/lib/database.types';
import { getSupabaseClient } from '@/lib/supabase';
import { validateWorkoutDraft, type WorkoutDraft } from './workout-model';

export type Exercise = ExerciseRow;
export type WorkoutSession = WorkoutSessionRow;
export type WorkoutEntry = WorkoutSessionExerciseRow;
export type WorkoutProgress = WorkoutProgressRow;
const exerciseFields =
  'id,user_id,client_request_id,name,measurement_kind,archived_at,created_at,updated_at';
const sessionFields =
  'id,user_id,client_request_id,title,planned_date,performed_date,completed_at,created_at,updated_at';
const entryFields =
  'id,user_id,session_id,exercise_id,position,name_snapshot,measurement_kind,sets,reps,weight_kg,duration_seconds';
export const WORKOUT_PAGE_SIZE = 20;

function errorMessage(error: { code?: string; message: string } | null, fallback: string) {
  if (error?.code === '40001') return 'This workout changed. Reload it before saving again.';
  if (error?.code === '23505') return 'This request was already used or the exercise name exists.';
  if (error?.code === '42501') return 'This workout or exercise is unavailable.';
  if (error?.code === '22023' || error?.code === '23514')
    return 'Check the workout fields and exercise measurements.';
  return fallback;
}

export async function listExercises(ownerId: string, search = '', offset = 0, archived = false) {
  let query = getSupabaseClient()
    .from('exercises')
    .select(exerciseFields, { count: 'exact' })
    .eq('user_id', ownerId)
    .order('name')
    .order('id');
  query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  const term = search.trim();
  if (term) query = query.ilike('name', `%${term.replace(/[\\%_]/g, '\\$&')}%`);
  const { data, count, error } = await query.range(offset, offset + WORKOUT_PAGE_SIZE - 1);
  if (error) throw new Error('Exercises could not be loaded. Try again.');
  return {
    items: (data ?? []) as Exercise[],
    total: count ?? 0,
    hasMore: offset + WORKOUT_PAGE_SIZE < (count ?? 0),
  };
}

export async function createExercise(
  ownerId: string,
  requestId: string,
  name: string,
  kind: WorkoutMeasurement,
) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) throw new Error('Exercise name must be 1–100 characters.');
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('exercises')
    .insert({ client_request_id: requestId, name: trimmed, measurement_kind: kind })
    .select(exerciseFields)
    .single();
  if (data) return data as Exercise;
  const existing = await client
    .from('exercises')
    .select(exerciseFields)
    .eq('user_id', ownerId)
    .eq('client_request_id', requestId)
    .maybeSingle();
  if (existing.data) {
    if (existing.data.name !== trimmed || existing.data.measurement_kind !== kind)
      throw new Error('This exercise request was already used.');
    return existing.data as Exercise;
  }
  if (error?.code === '23505') throw new Error('An active exercise with this name already exists.');
  throw new Error(errorMessage(error, 'Exercise could not be saved. Try again.'));
}

export async function updateExercise(
  ownerId: string,
  exercise: Exercise,
  name: string,
  kind: WorkoutMeasurement,
) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) throw new Error('Exercise name must be 1–100 characters.');
  const { data, error } = await getSupabaseClient()
    .from('exercises')
    .update({ name: trimmed, measurement_kind: kind })
    .eq('id', exercise.id)
    .eq('user_id', ownerId)
    .eq('updated_at', exercise.updated_at)
    .is('archived_at', null)
    .select(exerciseFields)
    .maybeSingle();
  if (error?.code === '23505') throw new Error('An active exercise with this name already exists.');
  if (error || !data)
    throw new Error(
      error
        ? errorMessage(error, 'Exercise could not be updated.')
        : 'Exercise changed. Reload and try again.',
    );
  return data as Exercise;
}

export async function archiveExercise(ownerId: string, exercise: Exercise) {
  const { data, error } = await getSupabaseClient()
    .from('exercises')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', exercise.id)
    .eq('user_id', ownerId)
    .eq('updated_at', exercise.updated_at)
    .is('archived_at', null)
    .select(exerciseFields)
    .maybeSingle();
  if (error || !data)
    throw new Error(
      error
        ? errorMessage(error, 'Exercise could not be archived.')
        : 'Exercise changed. Reload and try again.',
    );
  return data as Exercise;
}

export async function getWorkout(ownerId: string, id: string) {
  const client = getSupabaseClient();
  const session = await client
    .from('workout_sessions')
    .select(sessionFields)
    .eq('user_id', ownerId)
    .eq('id', id)
    .maybeSingle();
  if (session.error) throw new Error('Workout could not be loaded.');
  if (!session.data) return null;
  const entries = await client
    .from('workout_session_exercises')
    .select(entryFields)
    .eq('user_id', ownerId)
    .eq('session_id', id)
    .order('position');
  if (entries.error) throw new Error('Workout exercises could not be loaded.');
  return {
    session: session.data as WorkoutSession,
    entries: (
      (entries.data ?? []) as (Omit<WorkoutEntry, 'weight_kg'> & { weight_kg: number | null })[]
    ).map((entry) => ({
      ...entry,
      weight_kg: entry.weight_kg === null ? null : String(entry.weight_kg),
    })),
  };
}

export async function saveWorkout(
  ownerId: string,
  requestId: string,
  draft: WorkoutDraft,
  today: string,
  current?: WorkoutSession | null,
) {
  const value = validateWorkoutDraft(draft, today);
  const { data, error } = await getSupabaseClient().rpc('save_workout_session', {
    p_session_id: current?.id ?? null,
    p_request_id: requestId,
    p_expected_updated_at: current?.updated_at ?? null,
    p_title: value.title,
    p_planned_date: value.planned_date,
    p_performed_date: value.performed_date,
    p_entries: value.entries,
  });
  if (error || !data)
    throw new Error(
      errorMessage(error, 'Workout could not be saved. Check your connection and retry.'),
    );
  const saved = await getWorkout(ownerId, data);
  if (!saved)
    throw new Error('Workout saved, but could not be reloaded. Open history to check it.');
  return saved;
}

export async function deleteWorkout(session: WorkoutSession) {
  const { data, error } = await getSupabaseClient().rpc('delete_workout_session', {
    p_session_id: session.id,
    p_expected_updated_at: session.updated_at,
  });
  if (error || !data)
    throw new Error(errorMessage(error, 'Workout could not be deleted. Try again.'));
}

export async function listWorkoutHistory(ownerId: string, offset = 0) {
  const { data, count, error } = await getSupabaseClient()
    .from('workout_sessions')
    .select(sessionFields, { count: 'exact' })
    .eq('user_id', ownerId)
    .not('completed_at', 'is', null)
    .order('performed_date', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + WORKOUT_PAGE_SIZE - 1);
  if (error) throw new Error('Workout history could not be loaded.');
  return {
    items: (data ?? []) as WorkoutSession[],
    total: count ?? 0,
    hasMore: offset + WORKOUT_PAGE_SIZE < (count ?? 0),
  };
}

export async function listWorkoutPlans(ownerId: string, today: string) {
  const client = getSupabaseClient();
  const base = () =>
    client
      .from('workout_sessions')
      .select(sessionFields)
      .eq('user_id', ownerId)
      .is('completed_at', null);
  const [past, upcoming] = await Promise.all([
    base().lt('planned_date', today).order('planned_date', { ascending: false }).limit(10),
    base().gte('planned_date', today).order('planned_date').limit(20),
  ]);
  if (past.error || upcoming.error) throw new Error('Planned workouts could not be loaded.');
  return {
    past: (past.data ?? []) as WorkoutSession[],
    upcoming: (upcoming.data ?? []) as WorkoutSession[],
  };
}

export async function listWorkoutPlanPage(ownerId: string, offset = 0) {
  const { data, count, error } = await getSupabaseClient()
    .from('workout_sessions')
    .select(sessionFields, { count: 'exact' })
    .eq('user_id', ownerId)
    .is('completed_at', null)
    .order('planned_date', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + WORKOUT_PAGE_SIZE - 1);
  if (error) throw new Error('Planned workouts could not be loaded.');
  return {
    items: (data ?? []) as WorkoutSession[],
    total: count ?? 0,
    hasMore: offset + WORKOUT_PAGE_SIZE < (count ?? 0),
  };
}

export async function listTodayWorkouts(
  ownerId: string,
  date: string,
  section: 'planned' | 'completed',
) {
  let query = getSupabaseClient()
    .from('workout_sessions')
    .select(sessionFields, { count: 'exact' })
    .eq('user_id', ownerId);
  query =
    section === 'planned'
      ? query.is('completed_at', null).eq('planned_date', date)
      : query.not('completed_at', 'is', null).eq('performed_date', date);
  const { data, count, error } = await query.order('id').range(0, WORKOUT_PAGE_SIZE - 1);
  if (error) throw new Error('Today workouts could not be loaded.');
  return {
    items: (data ?? []) as WorkoutSession[],
    total: count ?? 0,
    hasMore: (count ?? 0) > WORKOUT_PAGE_SIZE,
  };
}

export async function workoutWeekActivity(today: string) {
  const { data, error } = await getSupabaseClient().rpc('workout_week_activity', {
    p_today: today,
  });
  if (error) throw new Error('Workout activity could not be loaded.');
  return data ?? [];
}

export async function listExerciseProgress(
  ownerId: string,
  exerciseId: string,
  kind: WorkoutMeasurement,
) {
  const { data, error } = await getSupabaseClient()
    .from('workout_progress_read')
    .select(
      'user_id,exercise_id,session_id,name_snapshot,measurement_kind,sets,reps,weight_kg,duration_seconds,performed_date',
    )
    .eq('user_id', ownerId)
    .eq('exercise_id', exerciseId)
    .eq('measurement_kind', kind)
    .order('performed_date', { ascending: false })
    .order('session_id', { ascending: false })
    .limit(5);
  if (error) throw new Error('Exercise progress could not be loaded.');
  return (data ?? []) as WorkoutProgress[];
}
