begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'bills-a@example.test', 'test-only', now(), now(), now()),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'bills-b@example.test', 'test-only', now(), now(), now());

select is((select relrowsecurity from pg_class where oid = 'public.bills'::regclass), true,
  'bills RLS is enabled');
select is((select relrowsecurity from pg_class where oid = 'public.bill_occurrences'::regclass), true,
  'occurrences RLS is enabled');
select is((select relrowsecurity from pg_class where oid = 'app_private.bill_command_receipts'::regclass), true,
  'private receipts RLS is enabled');
select is(has_table_privilege('authenticated', 'public.bills', 'INSERT'), false,
  'clients cannot directly insert bills');
select is(has_table_privilege('authenticated', 'public.bill_occurrences', 'UPDATE'), false,
  'clients cannot directly update occurrences');
select is(has_table_privilege('anon', 'public.bills', 'SELECT'), false,
  'anonymous users cannot read bills');
select is(has_function_privilege('authenticated',
  'app_private.bill_command(uuid,text,uuid,jsonb)', 'EXECUTE'), false,
  'clients cannot execute private commands');
select is(has_function_privilege('lifeops_bill_commands',
  'app_private.bill_command(uuid,text,uuid,jsonb)', 'EXECUTE'), true,
  'restricted Edge role can execute command');
select is(has_table_privilege('lifeops_bill_commands', 'public.bills', 'INSERT'), false,
  'restricted Edge role has no broad bill DML');

select is(app_private.bill_due_on(date '2028-01-31','monthly',1), date '2028-02-29',
  'January 31 clamps to leap February');
select is(app_private.bill_due_on(date '2028-01-31','monthly',2), date '2028-03-31',
  'monthly anchor does not drift');
select is(app_private.bill_due_on(date '2025-01-31','monthly',1), date '2025-02-28',
  'January 31 clamps to ordinary February');
select is(app_private.bill_due_on(date '2024-02-29','yearly',1), date '2025-02-28',
  'leap day clamps in a non-leap year');
select is(app_private.bill_due_on(date '2024-02-29','yearly',4), date '2028-02-29',
  'yearly leap anchor returns on leap year');
select is(app_private.bill_due_on(date '2027-11-15','weekly',1), date '2027-11-22',
  'weekly recurrence is seven calendar days');

select set_config('test.bill_a',
  app_private.bill_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc','create',
    'c0000000-0000-4000-8000-000000000001',
    '{"title":"Internet","amount_minor":"169900","due_on":"2026-11-15"}'::jsonb)->>'bill_id', true);
select set_config('test.bill_b',
  app_private.bill_command('dddddddd-dddd-4ddd-8ddd-dddddddddddd','create',
    'd0000000-0000-4000-8000-000000000001',
    '{"title":"Water","amount_minor":"235050","due_on":"2026-11-20"}'::jsonb)->>'bill_id', true);
select is(app_private.bill_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc','create',
    'c0000000-0000-4000-8000-000000000001',
    '{"title":"Internet","amount_minor":"169900","due_on":"2026-11-15"}'::jsonb)->>'bill_id',
  current_setting('test.bill_a'), 'same request and payload returns one bill');
select throws_ok($$select app_private.bill_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'create','c0000000-0000-4000-8000-000000000001',
  '{"title":"Changed","amount_minor":"169900","due_on":"2026-11-15"}'::jsonb)$$,
  'P0001', null, 'same request ID with changed payload is rejected');
select throws_ok($$select app_private.bill_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'create','c0000000-0000-4000-8000-000000000002',
  '{"title":"Bad","amount_minor":"0","due_on":"2026-11-15"}'::jsonb)$$,
  'P0001', null, 'zero amount is rejected');
select throws_ok($$select app_private.bill_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'create','c0000000-0000-4000-8000-000000000003',
  '{"title":"Bad","amount_minor":"1","due_on":"2026-11-15","category":"bank"}'::jsonb)$$,
  'P0001', null, 'invalid category is rejected');
select throws_ok($$select app_private.bill_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'create','c0000000-0000-4000-8000-000000000004',
  '{"title":"Bad","amount_minor":"1","due_on":"2026-11-15","recurrence":"daily"}'::jsonb)$$,
  'P0001', null, 'invalid recurrence is rejected');
select throws_ok($$select app_private.bill_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'create','c0000000-0000-4000-8000-000000000005',
  '{"title":"Only title"}'::jsonb)$$,
  'P0001', null, 'title-only bill is invalid');

reset role;
select is((select count(*) from public.bills where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  1::bigint, 'retry created one bill definition');
select is((select octet_length(payload_hash) from app_private.bill_command_receipts
  where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and action = 'create'
    and request_id = 'c0000000-0000-4000-8000-000000000001'),
  32, 'receipt stores a digest rather than bill details');
select is((select count(*) from public.bill_occurrences where bill_id = current_setting('test.bill_a')::uuid),
  1::bigint, 'one-time bill has one occurrence');
select is((select amount_minor from public.bill_occurrences where bill_id = current_setting('test.bill_a')::uuid),
  169900::bigint, 'centavos stored as integer');
select is((select currency_code from public.bills where id = current_setting('test.bill_a')::uuid),
  'PHP', 'currency defaults to PHP');
select throws_ok(format($$insert into public.bill_occurrences(user_id,bill_id,ordinal,due_on,amount_minor)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','%s',3,date '2026-11-22',100)$$,
  current_setting('test.bill_b')), '23503', null,
  'owner-matched foreign key rejects another owner bill');
select is((select status from public.bill_occurrences where bill_id = current_setting('test.bill_a')::uuid),
  'unpaid', 'initial status is unpaid');
select is((select count(*) from public.active_bill_occurrence_read where bill_id = current_setting('test.bill_a')::uuid),
  1::bigint, 'active read view exposes occurrence');
select is((select amount_minor from public.bill_occurrence_read where bill_id = current_setting('test.bill_a')::uuid),
  '169900', 'read view transports centavos as a string');

set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
select is((select count(*) from public.bills), 1::bigint, 'A reads only own bill');
select is((select count(*) from public.bill_occurrences), 1::bigint, 'A reads only own occurrence');
select is((select count(*) from public.bills where id = current_setting('test.bill_b')::uuid),
  0::bigint, 'A cannot read B bill');
select is((select count(*) from public.bill_occurrences where bill_id = current_setting('test.bill_b')::uuid),
  0::bigint, 'A cannot read B occurrence');
select throws_ok($$insert into public.bills(user_id,client_request_id,title,amount_minor,anchor_due_on)
  values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',gen_random_uuid(),'Forged',100,date '2026-11-15')$$,
  '42501', null, 'A cannot create B-owned bill directly');
select throws_ok($$update public.bills set title='Stolen' where user_id =
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$,
  '42501', null, 'A cannot modify B bill directly');
select throws_ok($$update public.bill_occurrences set status='paid' where user_id =
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$,
  '42501', null, 'A cannot modify B occurrence directly');
reset role;

select set_config('test.occ_a', (select id::text from public.bill_occurrences
  where bill_id = current_setting('test.bill_a')::uuid), true);
select set_config('test.occ_b', (select id::text from public.bill_occurrences
  where bill_id = current_setting('test.bill_b')::uuid), true);
select throws_ok(format($$select app_private.bill_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'set_paid','c0000000-0000-4000-8000-000000000006',
  '{"id":"%s","paid":true}'::jsonb)$$, current_setting('test.occ_b')),
  'P0001', null, 'A command cannot mark B occurrence paid');
select app_private.bill_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'set_paid','c0000000-0000-4000-8000-000000000007',
  jsonb_build_object('id',current_setting('test.occ_a'),'paid',true));
reset role;
select is((select status from public.bill_occurrences where id = current_setting('test.occ_a')::uuid),
  'paid', 'mark paid persists status');
select ok((select paid_at is not null from public.bill_occurrences
  where id = current_setting('test.occ_a')::uuid), 'paid_at is server-stamped');
select app_private.bill_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'set_paid','c0000000-0000-4000-8000-000000000008',
  jsonb_build_object('id',current_setting('test.occ_a'),'paid',false));
reset role;
select is((select status from public.bill_occurrences where id = current_setting('test.occ_a')::uuid),
  'unpaid', 'reopen persists unpaid status');
select is((select paid_at from public.bill_occurrences where id = current_setting('test.occ_a')::uuid),
  null::timestamptz, 'reopening clears paid_at');
select app_private.bill_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'edit_due','c0000000-0000-4000-8000-000000000011',
  jsonb_build_object('id',current_setting('test.occ_a'),'due_on','2026-11-16'));
select is((select due_on from public.bill_occurrences where id = current_setting('test.occ_a')::uuid),
  date '2026-11-16', 'due-date correction updates the occurrence');
select is((select anchor_due_on from public.bills where id = current_setting('test.bill_a')::uuid),
  date '2026-11-16', 'one-time correction updates its definition anchor');
select app_private.bill_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'edit','c0000000-0000-4000-8000-000000000012',
  jsonb_build_object('id',current_setting('test.bill_a'),'title','Internet plan',
    'amount_minor','170000','due_on','2026-11-16','category','subscription','recurrence','none'));
select is((select title from public.bills where id = current_setting('test.bill_a')::uuid),
  'Internet plan', 'owner command edits bill definition');
select is((select amount_minor from public.bill_occurrences where id = current_setting('test.occ_a')::uuid),
  170000::bigint, 'editing default amount corrects unpaid occurrence');

with created as (
  insert into public.bills (user_id,client_request_id,title,amount_minor,recurrence,anchor_due_on)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',gen_random_uuid(),
      'Insurance',10000,'monthly',date '2028-01-31') returning id
)
select set_config('test.monthly', id::text, true) from created;
select app_private.generate_bill_occurrences_from(
  current_setting('test.monthly')::uuid,date '2028-01-01',date '2028-04-30');
select app_private.generate_bill_occurrences_from(
  current_setting('test.monthly')::uuid,date '2028-01-01',date '2028-04-30');
select is((select count(*) from public.bill_occurrences where bill_id = current_setting('test.monthly')::uuid),
  4::bigint, 'recurring generation is idempotent');
select results_eq($$select due_on from public.bill_occurrences where bill_id =
  current_setting('test.monthly')::uuid order by ordinal$$,
  $$values (date '2028-01-31'),(date '2028-02-29'),(date '2028-03-31'),(date '2028-04-30')$$,
  'monthly occurrences preserve anchor across month end');
with created as (
  insert into public.bills (user_id,client_request_id,title,amount_minor,recurrence,anchor_due_on)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',gen_random_uuid(),
      'Annual fee',100,'yearly',date '2024-02-29') returning id
)
select set_config('test.yearly', id::text, true) from created;
select app_private.generate_bill_occurrences_from(
  current_setting('test.yearly')::uuid,date '2024-01-01',date '2028-03-01');
select is((select due_on from public.bill_occurrences where bill_id =
  current_setting('test.yearly')::uuid and ordinal = 1), date '2025-02-28',
  'yearly occurrence clamps after leap day');
select is((select due_on from public.bill_occurrences where bill_id =
  current_setting('test.yearly')::uuid and ordinal = 4), date '2028-02-29',
  'yearly occurrence returns to leap day');

select app_private.bill_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'archive','c0000000-0000-4000-8000-000000000010',
  jsonb_build_object('id',current_setting('test.bill_a')));
reset role;
select is((select count(*) from public.active_bill_occurrence_read where bill_id =
  current_setting('test.bill_a')::uuid), 0::bigint, 'archiving removes bill from active reads');
select is((select count(*) from public.archived_bill_occurrence_read where bill_id =
  current_setting('test.bill_a')::uuid), 1::bigint, 'archived history remains readable');
select is((select count(*) from public.bill_occurrences where bill_id =
  current_setting('test.bill_a')::uuid), 1::bigint, 'archive preserves occurrence history');
select app_private.bill_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'delete','c0000000-0000-4000-8000-000000000014',
  jsonb_build_object('id',current_setting('test.bill_a')));
select is((select count(*) from public.bills where id = current_setting('test.bill_a')::uuid),
  0::bigint, 'owner delete removes definition');
select is((select count(*) from public.bill_occurrences where bill_id =
  current_setting('test.bill_a')::uuid), 0::bigint, 'owner delete cascades occurrence history');

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select * from public.bills$$, '42501', null, 'anon cannot read bills');
select throws_ok($$select * from public.bill_occurrences$$, '42501', null,
  'anon cannot read occurrences');
select throws_ok($$select * from public.bill_read$$, '42501', null,
  'anon cannot read bill view');
select throws_ok($$select app_private.bill_command(gen_random_uuid(),'reconcile',gen_random_uuid(),'{}')$$,
  '42501', null, 'anon cannot execute bill command');

select * from finish();
rollback;
