begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000000-0000-0000-0000-000000000000',
    'authenticated','authenticated','workout-a@example.test','test-only',now(),now(),now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','00000000-0000-0000-0000-000000000000',
    'authenticated','authenticated','workout-b@example.test','test-only',now(),now(),now());

select is((select relrowsecurity from pg_class where oid = 'public.exercises'::regclass), true, 'exercise RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.workout_sessions'::regclass), true, 'session RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.workout_session_exercises'::regclass), true, 'entry RLS enabled');
select is(has_table_privilege('anon','public.workout_sessions','SELECT'), false, 'anonymous session read denied');
select is(has_table_privilege('authenticated','public.workout_sessions','INSERT'), false, 'direct session insert denied');
select is(has_table_privilege('authenticated','public.workout_session_exercises','UPDATE'), false, 'direct entry update denied');
select is(has_column_privilege('authenticated','public.exercises','user_id','UPDATE'), false, 'exercise owner immutable');
select is(has_function_privilege('anon',
  'public.save_workout_session(uuid,uuid,timestamptz,text,date,date,jsonb)','EXECUTE'),
  false, 'anonymous save command denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
insert into public.exercises (client_request_id,name,measurement_kind) values
  ('10000000-0000-4000-8000-000000000001','Squat','weighted_reps'),
  ('10000000-0000-4000-8000-000000000002','Push-up','reps'),
  ('10000000-0000-4000-8000-000000000003','Plank','duration');
select set_config('workout.test_exercise_id',
  (select id::text from public.exercises where name = 'Squat'), true);
select is((select count(*) from public.exercises), 3::bigint, 'owner sees three saved exercises');
select throws_ok($$insert into public.exercises (user_id,client_request_id,name,measurement_kind)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','10000000-0000-4000-8000-000000000004','Forged','reps')$$,
  '42501', null, 'owner cannot be supplied on exercise create');

-- Completed quick log with all three approved measurement kinds.
select public.save_workout_session(null,'20000000-0000-4000-8000-000000000001',null,
  'Morning workout',null,(now() at time zone 'Asia/Manila')::date,
  jsonb_build_array(
    jsonb_build_object('exercise_id',(select id from public.exercises where name='Squat'),
      'sets',3,'reps',8,'weight_kg','40.50'),
    jsonb_build_object('exercise_id',(select id from public.exercises where name='Push-up'),
      'sets',2,'reps',12),
    jsonb_build_object('exercise_id',(select id from public.exercises where name='Plank'),
      'duration_seconds',90)));
select is((select count(*) from public.workout_sessions where completed_at is not null), 1::bigint,
  'completed workout persisted');
select is((select count(*) from public.workout_session_exercises), 3::bigint,
  'all exercise entries persisted atomically');
select is((select weight_kg from public.workout_session_exercises where name_snapshot='Squat'),
  40.50::numeric, 'weighted repetitions stored in kg');
select is((select duration_seconds from public.workout_session_exercises where name_snapshot='Plank'),
  90, 'duration stored in seconds');
select is((select sets from public.workout_session_exercises where name_snapshot='Push-up'),
  2, 'repetition sets stored');
select is((select count(*) from public.workout_progress_read), 3::bigint,
  'progress read derives from completed entries');
select is((select count(*) from public.workout_week_activity((now() at time zone 'Asia/Manila')::date)),
  4::bigint, 'four full prior weeks returned');
select throws_ok($$select public.save_workout_session(null,'20000000-0000-4000-8000-000000000002',null,
  'Invalid',null,(now() at time zone 'Asia/Manila')::date,
  jsonb_build_array(jsonb_build_object('exercise_id',current_setting('workout.test_exercise_id')::uuid,
    'sets',0,'reps',8,'weight_kg','40')))$$,
  '22023', null, 'invalid measurements roll back');
select is((select count(*) from public.workout_sessions), 1::bigint, 'invalid save created no session');
select throws_ok($$select public.save_workout_session(null,'20000000-0000-4000-8000-000000000008',null,
  'Bad weight',null,(now() at time zone 'Asia/Manila')::date,
  jsonb_build_array(jsonb_build_object('exercise_id',current_setting('workout.test_exercise_id')::uuid,
    'sets',3,'reps',8,'weight_kg','40.001')))$$,
  '22023', null, 'weight with excess precision denied');
select throws_ok($$select public.save_workout_session(null,'20000000-0000-4000-8000-000000000009',null,
  'Future',null,((now() at time zone 'Asia/Manila')::date + 1),
  jsonb_build_array(jsonb_build_object('exercise_id',current_setting('workout.test_exercise_id')::uuid,
    'sets',3,'reps',8,'weight_kg','40')))$$,
  '22023', null, 'future completed workout denied');
select throws_ok($$select public.save_workout_session(null,'20000000-0000-4000-8000-000000000010',null,
  'Duplicate',null,(now() at time zone 'Asia/Manila')::date,
  jsonb_build_array(
    jsonb_build_object('exercise_id',current_setting('workout.test_exercise_id')::uuid,
      'sets',3,'reps',8,'weight_kg','40'),
    jsonb_build_object('exercise_id',current_setting('workout.test_exercise_id')::uuid,
      'sets',3,'reps',8,'weight_kg','40')))$$,
  '22023', null, 'duplicate exercise entry denied');

-- The same create request cannot duplicate a workout.
select public.save_workout_session(null,'20000000-0000-4000-8000-000000000001',null,
  'Morning workout',null,(now() at time zone 'Asia/Manila')::date,
  jsonb_build_array(
    jsonb_build_object('exercise_id',(select id from public.exercises where name='Squat'),
      'sets',3,'reps',8,'weight_kg','40.50'),
    jsonb_build_object('exercise_id',(select id from public.exercises where name='Push-up'),
      'sets',2,'reps',12),
    jsonb_build_object('exercise_id',(select id from public.exercises where name='Plank'),
      'duration_seconds',90)));
select is((select count(*) from public.workout_sessions), 1::bigint, 'repeated create is idempotent');
select throws_ok($$select public.save_workout_session(null,'20000000-0000-4000-8000-000000000001',null,
  'Different payload',null,(now() at time zone 'Asia/Manila')::date,
  jsonb_build_array(jsonb_build_object('exercise_id',current_setting('workout.test_exercise_id')::uuid,
    'sets',3,'reps',8,'weight_kg','40.50')))$$,
  '23505', null, 'same request ID with different content denied');

select public.save_workout_session(null,'20000000-0000-4000-8000-000000000003',null,
  'Tomorrow plan',((now() at time zone 'Asia/Manila')::date + 1),null,
  jsonb_build_array(jsonb_build_object('exercise_id',(select id from public.exercises where name='Push-up'))));
select is((select count(*) from public.workout_sessions where completed_at is null), 1::bigint,
  'planned workout remains planned');
select is((select sets from public.workout_session_exercises where session_id =
  (select id from public.workout_sessions where title='Tomorrow plan')), null::integer,
  'planned exercise needs no measurements yet');
select set_config('workout.test_session_id',
  (select id::text from public.workout_sessions where title='Tomorrow plan'), true);
select set_config('workout.test_version',
  (select updated_at::text from public.workout_sessions where title='Tomorrow plan'), true);
select public.save_workout_session(current_setting('workout.test_session_id')::uuid,
  '20000000-0000-4000-8000-000000000004',current_setting('workout.test_version')::timestamptz,
  'Tomorrow plan',((now() at time zone 'Asia/Manila')::date + 1),
  (now() at time zone 'Asia/Manila')::date,
  jsonb_build_array(jsonb_build_object('exercise_id',(select id from public.exercises where name='Push-up'),
    'sets',3,'reps',10)));
select is((select planned_date - performed_date from public.workout_sessions where
  id=current_setting('workout.test_session_id')::uuid), 1, 'original plan date retained after later completion');
select ok((select completed_at is not null from public.workout_sessions where
  id=current_setting('workout.test_session_id')::uuid), 'completion server timestamp recorded');
select throws_ok($$select public.save_workout_session(current_setting('workout.test_session_id')::uuid,
  '20000000-0000-4000-8000-000000000005',current_setting('workout.test_version')::timestamptz,
  'Stale edit',null,(now() at time zone 'Asia/Manila')::date,
  jsonb_build_array(jsonb_build_object('exercise_id',
    (select id from public.exercises where name='Push-up'),'sets',3,'reps',10)))$$,
  '40001', null, 'stale edit denied');
select public.save_workout_session(current_setting('workout.test_session_id')::uuid,
  '20000000-0000-4000-8000-000000000004',current_setting('workout.test_version')::timestamptz,
  'Tomorrow plan',((now() at time zone 'Asia/Manila')::date + 1),
  (now() at time zone 'Asia/Manila')::date,
  jsonb_build_array(jsonb_build_object('exercise_id',(select id from public.exercises where name='Push-up'),
    'sets',3,'reps',10)));
select is((select count(*) from public.workout_session_exercises where
  session_id=current_setting('workout.test_session_id')::uuid), 1::bigint,
  'repeated completion does not duplicate entries');

update public.exercises set name='Barbell squat', measurement_kind='reps'
  where id=current_setting('workout.test_exercise_id')::uuid;
select is((select name_snapshot from public.workout_session_exercises where
  exercise_id=current_setting('workout.test_exercise_id')::uuid), 'Squat',
  'library rename does not rewrite completed history');
select is((select measurement_kind::text from public.workout_session_exercises where
  exercise_id=current_setting('workout.test_exercise_id')::uuid), 'weighted_reps',
  'library measurement edit does not rewrite completed history');
update public.exercises set archived_at=now() where id=current_setting('workout.test_exercise_id')::uuid;
select ok((select archived_at is not null from public.exercises where
  id=current_setting('workout.test_exercise_id')::uuid), 'exercise can be archived');

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select is((select count(*) from public.exercises), 0::bigint, 'other owner cannot read exercises');
select is((select count(*) from public.workout_sessions), 0::bigint, 'other owner cannot read sessions');
select is((select count(*) from public.workout_session_exercises), 0::bigint, 'other owner cannot read entries');
select is((select count(*) from public.workout_progress_read), 0::bigint, 'other owner cannot read progress');
with changed as (update public.exercises set name='Foreign edit'
  where id=current_setting('workout.test_exercise_id')::uuid returning id)
select is((select count(*) from changed), 0::bigint, 'other owner cannot edit exercise library');
select throws_ok($$select public.delete_workout_session(current_setting('workout.test_session_id')::uuid,
  current_setting('workout.test_version')::timestamptz)$$, '42501', null,
  'other owner cannot delete session');
select throws_ok($$select public.save_workout_session(current_setting('workout.test_session_id')::uuid,
  '20000000-0000-4000-8000-000000000006',null,'Forged',null,
  (now() at time zone 'Asia/Manila')::date,
  jsonb_build_array(jsonb_build_object('exercise_id',current_setting('workout.test_exercise_id')::uuid,
    'sets',3,'reps',8,'weight_kg','40')))$$, '42501', null,
  'other owner cannot edit session');
select throws_ok($$select public.save_workout_session(null,
  '20000000-0000-4000-8000-000000000007',null,'Foreign exercise',null,
  (now() at time zone 'Asia/Manila')::date,
  jsonb_build_array(jsonb_build_object('exercise_id',current_setting('workout.test_exercise_id')::uuid,
    'sets',3,'reps',8,'weight_kg','40')))$$, '42501', null,
  'other owner cannot attach foreign exercise');
select is((select count(*) from public.workout_sessions), 0::bigint,
  'failed foreign attach rolled back');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select public.delete_workout_session(current_setting('workout.test_session_id')::uuid,
  (select updated_at from public.workout_sessions where id=current_setting('workout.test_session_id')::uuid));
select is((select count(*) from public.workout_session_exercises where
  session_id=current_setting('workout.test_session_id')::uuid), 0::bigint,
  'session deletion cascades entries');

reset role;
delete from auth.users where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is((select count(*) from public.workout_sessions where
  user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint,
  'account deletion cascades workout sessions and entries');
select is((select count(*) from public.exercises where
  user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint,
  'account deletion cascades exercise library');

select * from finish();
rollback;
