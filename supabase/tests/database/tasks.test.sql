begin;
select plan(31);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'tasks-a@example.test', 'test-only', now(), now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'tasks-b@example.test', 'test-only', now(), now(), now());

select is((select relrowsecurity from pg_class where oid = 'public.tasks'::regclass), true,
  'tasks RLS is enabled');
select is(has_table_privilege('anon', 'public.tasks', 'SELECT'), false, 'anon has no select grant');
select is(has_table_privilege('anon', 'public.tasks', 'INSERT'), false, 'anon has no insert grant');
select is(has_column_privilege('authenticated', 'public.tasks', 'user_id', 'UPDATE'), false,
  'owner column cannot be updated');
select is(has_column_privilege('authenticated', 'public.tasks', 'created_at', 'INSERT'), false,
  'clients cannot set created_at');
select is(has_column_privilege('authenticated', 'public.tasks', 'completed_at', 'INSERT'), false,
  'clients cannot create completed tasks');
select is(has_column_privilege('authenticated', 'public.tasks', 'id', 'INSERT'), false,
  'clients cannot select globally unique task IDs on insert');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
insert into public.tasks (client_request_id, user_id, title) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Own task');
select is((select count(*) from public.tasks), 1::bigint, 'A creates and reads own task');
select is((select priority::text from public.tasks where client_request_id = 'a0000000-0000-4000-8000-000000000001'),
  'medium', 'minimum task has default priority');
select is((select category from public.tasks where client_request_id = 'a0000000-0000-4000-8000-000000000001'),
  'personal', 'minimum task has default category');
with changed as (update public.tasks set title = 'Edited task', priority = 'high'
  where client_request_id = 'a0000000-0000-4000-8000-000000000001' returning id)
select is((select count(*) from changed), 1::bigint, 'A edits own task');
select ok((select updated_at > created_at from public.tasks
  where client_request_id = 'a0000000-0000-4000-8000-000000000001'), 'edit advances optimistic timestamp');
with changed as (update public.tasks set completed_at = '2000-01-01T00:00:00Z'
  where client_request_id = 'a0000000-0000-4000-8000-000000000001' returning completed_at)
select ok((select completed_at > now() - interval '1 minute' from changed),
  'completion uses server timestamp');
select set_config('task.original_completion', (select completed_at::text from public.tasks
  where client_request_id = 'a0000000-0000-4000-8000-000000000001'), true);
update public.tasks set completed_at = '1999-01-01T00:00:00Z'
  where client_request_id = 'a0000000-0000-4000-8000-000000000001';
select is((select completed_at::text from public.tasks where client_request_id = 'a0000000-0000-4000-8000-000000000001'),
  current_setting('task.original_completion'), 'repeated completion preserves timestamp');
update public.tasks set completed_at = null where client_request_id = 'a0000000-0000-4000-8000-000000000001';
select is((select completed_at from public.tasks where client_request_id = 'a0000000-0000-4000-8000-000000000001'),
  null::timestamptz, 'reopening clears completion timestamp');

select throws_ok($$insert into public.tasks (client_request_id, user_id, title) values
  ('a0000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Forged')$$,
  '42501', null, 'A cannot insert B-owned task');
select throws_ok($$insert into public.tasks (client_request_id, user_id, title) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Duplicate')$$,
  '23505', null, 'retrying same owner request UUID cannot create a duplicate');
select throws_ok($$insert into public.tasks (client_request_id, user_id, title) values
  ('a0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ' ')$$,
  '23514', null, 'blank title is rejected');
select throws_ok($$insert into public.tasks (client_request_id, user_id, title, category) values
  ('a0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Task', 'invalid')$$,
  '23514', null, 'invalid category is rejected');
select throws_ok($$insert into public.tasks (client_request_id, user_id, title, priority) values
  ('a0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Task', 'urgent')$$,
  '22P02', null, 'invalid priority is rejected');
select throws_ok($$update public.tasks set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  where client_request_id = 'a0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'A cannot transfer task ownership');

reset role;
insert into public.tasks (client_request_id, user_id, title) values
  ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B task'),
  ('a0000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B reused A request UUID');
select is((select count(*) from public.tasks where user_id =
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and client_request_id =
  'a0000000-0000-4000-8000-000000000001'), 1::bigint,
  'another owner may use the same request UUID without an identifier collision');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select is((select count(*) from public.tasks where client_request_id = 'b0000000-0000-4000-8000-000000000001'),
  0::bigint, 'A cannot read B task');
with changed as (update public.tasks set title = 'stolen'
  where client_request_id = 'b0000000-0000-4000-8000-000000000001' returning id)
select is((select count(*) from changed), 0::bigint, 'A cannot update B task');
with removed as (delete from public.tasks
  where client_request_id = 'b0000000-0000-4000-8000-000000000001' returning id)
select is((select count(*) from removed), 0::bigint, 'A cannot delete B task');
with removed as (delete from public.tasks
  where client_request_id = 'a0000000-0000-4000-8000-000000000001' returning id)
select is((select count(*) from removed), 1::bigint, 'A deletes own task');

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select is((select count(*) from public.tasks), 2::bigint, 'B sees only B tasks');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select * from public.tasks$$, '42501', null, 'anon cannot read tasks');
select throws_ok($$insert into public.tasks (client_request_id, user_id, title) values
  ('a0000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Anon')$$,
  '42501', null, 'anon cannot insert tasks');
select throws_ok($$update public.tasks set title = 'Anon'$$,
  '42501', null, 'anon cannot update tasks');
select throws_ok($$delete from public.tasks$$,
  '42501', null, 'anon cannot delete tasks');

select * from finish();
rollback;

