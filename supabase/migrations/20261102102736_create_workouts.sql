-- Phase 1: text-only workouts. The owner is always derived from auth.uid().
create type public.workout_measurement as enum ('reps', 'weighted_reps', 'duration');

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_request_id uuid not null,
  name text not null check (char_length(name) between 1 and 100 and name = btrim(name)),
  measurement_kind public.workout_measurement not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, client_request_id)
);
create unique index exercises_active_name_idx on public.exercises (user_id, lower(name)) where archived_at is null;
create index exercises_owner_list_idx on public.exercises (user_id, name, id) where archived_at is null;

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_request_id uuid not null,
  title text not null check (char_length(title) between 1 and 100 and title = btrim(title)),
  planned_date date,
  performed_date date,
  completed_at timestamptz,
  last_request_id uuid not null,
  last_request_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, client_request_id),
  check (planned_date is null or planned_date between date '2000-01-01' and date '2100-12-31'),
  check (performed_date is null or performed_date between date '2000-01-01' and date '2100-12-31'),
  check ((performed_date is null and completed_at is null and planned_date is not null)
    or (performed_date is not null and completed_at is not null))
);
create index workout_history_idx on public.workout_sessions (user_id, performed_date desc, id desc)
  where completed_at is not null;
create index workout_plans_idx on public.workout_sessions (user_id, planned_date, id)
  where completed_at is null;

create table public.workout_session_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id uuid not null,
  exercise_id uuid not null,
  position integer not null check (position between 1 and 20),
  name_snapshot text not null,
  measurement_kind public.workout_measurement not null,
  sets integer,
  reps integer,
  weight_kg numeric(7,2),
  duration_seconds integer,
  foreign key (session_id, user_id) references public.workout_sessions(id, user_id) on delete cascade,
  foreign key (exercise_id, user_id) references public.exercises(id, user_id) on delete cascade,
  unique (session_id, exercise_id),
  check (char_length(name_snapshot) between 1 and 100),
  check (coalesce((
    (sets is null and reps is null and weight_kg is null and duration_seconds is null) or
    (measurement_kind = 'reps' and sets between 1 and 60 and reps between 1 and 1000
      and weight_kg is null and duration_seconds is null) or
    (measurement_kind = 'weighted_reps' and sets between 1 and 60 and reps between 1 and 1000
      and weight_kg > 0 and weight_kg <= 2000 and duration_seconds is null) or
    (measurement_kind = 'duration' and sets is null and reps is null and weight_kg is null
      and duration_seconds between 1 and 86400)
  ), false))
);
create index workout_entries_progress_idx on public.workout_session_exercises (user_id, exercise_id, session_id);

create function app_private.touch_exercise()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.archived_at is not null and new.archived_at is distinct from old.archived_at then
    raise exception 'Archived exercise cannot be restored' using errcode = '22023';
  end if;
  if old.archived_at is not null and
    (new.name, new.measurement_kind) is distinct from (old.name, old.measurement_kind) then
    raise exception 'Archived exercise cannot be edited' using errcode = '22023';
  end if;
  if old.archived_at is null and new.archived_at is not null then
    new.archived_at := clock_timestamp();
  end if;
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
revoke all on function app_private.touch_exercise() from public, anon, authenticated;
create trigger on_exercise_updated before update on public.exercises
  for each row execute function app_private.touch_exercise();

alter table public.exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_session_exercises enable row level security;
revoke all on public.exercises, public.workout_sessions, public.workout_session_exercises
  from public, anon, authenticated;
grant select (id, user_id, client_request_id, name, measurement_kind, archived_at, created_at, updated_at)
  on public.exercises to authenticated;
grant insert (client_request_id, name, measurement_kind) on public.exercises to authenticated;
grant update (name, measurement_kind, archived_at) on public.exercises to authenticated;
grant select (id, user_id, client_request_id, title, planned_date, performed_date, completed_at,
  created_at, updated_at) on public.workout_sessions to authenticated;
grant select (id, user_id, session_id, exercise_id, position, name_snapshot, measurement_kind,
  sets, reps, weight_kg, duration_seconds) on public.workout_session_exercises to authenticated;
grant usage on type public.workout_measurement to authenticated;
create policy exercises_select on public.exercises for select to authenticated using ((select auth.uid()) = user_id);
create policy exercises_insert on public.exercises for insert to authenticated with check ((select auth.uid()) = user_id);
create policy exercises_update on public.exercises for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workout_sessions_select on public.workout_sessions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy workout_entries_select on public.workout_session_exercises for select to authenticated
  using ((select auth.uid()) = user_id);

-- All parent and entry changes happen in one transaction. A repeated request is accepted
-- only when its canonical payload matches the first committed request.
create function public.save_workout_session(
  p_session_id uuid, p_request_id uuid, p_expected_updated_at timestamptz,
  p_title text, p_planned_date date, p_performed_date date, p_entries jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := (select auth.uid());
  v_session public.workout_sessions%rowtype;
  v_id uuid;
  v_fingerprint text;
  v_entry jsonb;
  v_exercise public.exercises%rowtype;
  v_kind public.workout_measurement;
  v_name text;
  v_seen uuid[] := array[]::uuid[];
  v_exercise_id uuid;
  v_position integer := 0;
  v_sets integer;
  v_reps integer;
  v_weight numeric;
  v_duration integer;
  v_timezone text;
begin
  if v_owner is null or p_request_id is null or p_title is null or
    p_title <> btrim(p_title) or char_length(p_title) not between 1 and 100 or
    p_entries is null or jsonb_typeof(p_entries) <> 'array' or
    jsonb_array_length(p_entries) not between 1 and 20 or
    (p_performed_date is null and p_planned_date is null) then
    raise exception 'Invalid workout' using errcode = '22023';
  end if;
  select timezone into v_timezone from public.profiles where id = v_owner;
  if p_performed_date is not null and
    (v_timezone is null or p_performed_date > (clock_timestamp() at time zone v_timezone)::date) then
    raise exception 'Workout date cannot be in the future' using errcode = '22023';
  end if;
  v_fingerprint := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    jsonb_build_object('title', p_title, 'planned_date', p_planned_date,
      'performed_date', p_performed_date, 'entries', p_entries)::text, 'UTF8')), 'hex');

  if p_session_id is null then
    insert into public.workout_sessions (user_id, client_request_id, title, planned_date,
      performed_date, completed_at, last_request_id, last_request_fingerprint)
    values (v_owner, p_request_id, p_title, p_planned_date, p_performed_date,
      case when p_performed_date is not null then clock_timestamp() end, p_request_id, v_fingerprint)
    on conflict (user_id, client_request_id) do nothing returning id into v_id;
    if v_id is null then
      select * into v_session from public.workout_sessions
        where user_id = v_owner and client_request_id = p_request_id for update;
      if v_session.last_request_fingerprint <> v_fingerprint then
        raise exception 'Workout request was already used' using errcode = '23505';
      end if;
      return v_session.id;
    end if;
  else
    select * into v_session from public.workout_sessions
      where id = p_session_id and user_id = v_owner for update;
    if not found then
      raise exception 'Workout unavailable' using errcode = '42501';
    end if;
    if v_session.last_request_id = p_request_id then
      if v_session.last_request_fingerprint <> v_fingerprint then
        raise exception 'Workout request was already used' using errcode = '23505';
      end if;
      return v_session.id;
    end if;
    if p_expected_updated_at is null or v_session.updated_at <> p_expected_updated_at then
      raise exception 'Workout changed; reload and try again' using errcode = '40001';
    end if;
    update public.workout_sessions set title = p_title, planned_date = p_planned_date,
      performed_date = p_performed_date,
      completed_at = case when p_performed_date is null then null
        when completed_at is null then clock_timestamp() else completed_at end,
      updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond'),
      last_request_id = p_request_id, last_request_fingerprint = v_fingerprint
      where id = p_session_id and user_id = v_owner;
    v_id := p_session_id;
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_position := v_position + 1;
    if jsonb_typeof(v_entry) <> 'object' or
      v_entry ?| array['user_id', 'name_snapshot', 'measurement_kind', 'session_id'] then
      raise exception 'Invalid exercise entry' using errcode = '22023';
    end if;
    v_exercise_id := (v_entry ->> 'exercise_id')::uuid;
    if v_exercise_id is null or v_exercise_id = any(v_seen) then
      raise exception 'Select each exercise once' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_exercise_id);
    select * into v_exercise from public.exercises
      where id = v_exercise_id and user_id = v_owner;
    if not found then
      raise exception 'Exercise unavailable' using errcode = '42501';
    end if;
    select measurement_kind, name_snapshot into v_kind, v_name
      from public.workout_session_exercises
      where session_id = v_id and exercise_id = v_exercise_id and user_id = v_owner;
    if not found then
      if v_exercise.archived_at is not null then
        raise exception 'Archived exercise cannot be added' using errcode = '22023';
      end if;
      v_kind := v_exercise.measurement_kind;
      v_name := v_exercise.name;
    end if;
    v_sets := (v_entry ->> 'sets')::integer;
    v_reps := (v_entry ->> 'reps')::integer;
    v_weight := (v_entry ->> 'weight_kg')::numeric;
    v_duration := (v_entry ->> 'duration_seconds')::integer;
    if not coalesce(((p_performed_date is null and v_sets is null and v_reps is null
        and v_weight is null and v_duration is null) or
      (v_kind = 'reps' and v_sets between 1 and 60 and v_reps between 1 and 1000
        and v_weight is null and v_duration is null) or
      (v_kind = 'weighted_reps' and v_sets between 1 and 60 and v_reps between 1 and 1000
        and v_weight > 0 and v_weight <= 2000 and v_weight = round(v_weight, 2)
        and v_duration is null) or
      (v_kind = 'duration' and v_sets is null and v_reps is null and v_weight is null
        and v_duration between 1 and 86400)), false) then
      raise exception 'Invalid exercise measurements' using errcode = '22023';
    end if;
    insert into public.workout_session_exercises (user_id, session_id, exercise_id, position,
      name_snapshot, measurement_kind, sets, reps, weight_kg, duration_seconds)
    values (v_owner, v_id, v_exercise_id, v_position, v_name, v_kind,
      v_sets, v_reps, v_weight, v_duration)
    on conflict (session_id, exercise_id) do update set
      position = excluded.position, sets = excluded.sets, reps = excluded.reps,
      weight_kg = excluded.weight_kg, duration_seconds = excluded.duration_seconds;
  end loop;
  delete from public.workout_session_exercises
    where session_id = v_id and user_id = v_owner and not (exercise_id = any(v_seen));
  return v_id;
end;
$$;
revoke all on function public.save_workout_session(uuid, uuid, timestamptz, text, date, date, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_workout_session(uuid, uuid, timestamptz, text, date, date, jsonb)
  to authenticated;

create function public.delete_workout_session(p_session_id uuid, p_expected_updated_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.workout_sessions%rowtype;
begin
  if (select auth.uid()) is null or p_session_id is null or p_expected_updated_at is null then
    raise exception 'Invalid workout command' using errcode = '22023';
  end if;
  select * into v_session from public.workout_sessions
    where id = p_session_id and user_id = (select auth.uid()) for update;
  if not found then
    raise exception 'Workout unavailable' using errcode = '42501';
  end if;
  if v_session.updated_at <> p_expected_updated_at then
    raise exception 'Workout changed; reload and try again' using errcode = '40001';
  end if;
  delete from public.workout_sessions where id = p_session_id and user_id = (select auth.uid());
  return true;
end;
$$;
revoke all on function public.delete_workout_session(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.delete_workout_session(uuid, timestamptz) to authenticated;

create view public.workout_progress_read with (security_invoker = true) as
select e.user_id, e.exercise_id, e.session_id, e.name_snapshot, e.measurement_kind,
  e.sets, e.reps, e.weight_kg::text as weight_kg, e.duration_seconds, s.performed_date
from public.workout_session_exercises e
join public.workout_sessions s on s.id = e.session_id and s.user_id = e.user_id
where s.completed_at is not null;
revoke all on public.workout_progress_read from public, anon, authenticated;
grant select on public.workout_progress_read to authenticated;

create function public.workout_week_activity(p_today date)
returns table (week_start date, session_count bigint)
language sql stable security invoker set search_path = '' as $$
  with weeks as (
    select (date_trunc('week', p_today::timestamp)::date - (n * 7))::date as week_start
    from generate_series(1, 4) n
  )
  select w.week_start, count(s.id) as session_count
  from weeks w left join public.workout_sessions s
    on s.user_id = (select auth.uid()) and s.completed_at is not null
    and s.performed_date >= w.week_start and s.performed_date < w.week_start + 7
  group by w.week_start order by w.week_start;
$$;
revoke all on function public.workout_week_activity(date) from public, anon, authenticated;
grant execute on function public.workout_week_activity(date) to authenticated;
