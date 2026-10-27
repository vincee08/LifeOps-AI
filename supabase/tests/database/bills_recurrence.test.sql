begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'bill-recurrence-a@example.test',
    'test-only', now(), now(), now()),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'bill-recurrence-b@example.test',
    'test-only', now(), now(), now());

select is(has_function_privilege('authenticated',
  'app_private.generate_bill_occurrences_from(uuid,date,date)', 'EXECUTE'), false,
  'clients cannot choose the recurrence as-of date');
select is(has_function_privilege('lifeops_bill_commands',
  'app_private.generate_bill_occurrences_from(uuid,date,date)', 'EXECUTE'), false,
  'restricted Edge role cannot bypass the owner command');

with created as (
  insert into public.bills (user_id, client_request_id, title, amount_minor,
    recurrence, anchor_due_on) values
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', gen_random_uuid(),
      'September anchor', 100, 'monthly', date '2026-09-30') returning id
)
select set_config('test.sep_bill', id::text, true) from created;
select app_private.generate_bill_occurrences_from(
  current_setting('test.sep_bill')::uuid, date '2026-09-25', date '2026-09-30');
select is((select count(*) from public.bill_occurrences
  where bill_id = current_setting('test.sep_bill')::uuid), 1::bigint,
  'initial September cycle exists by itself before the next month');
select app_private.generate_bill_occurrences_from(
  current_setting('test.sep_bill')::uuid, date '2026-10-25', date '2027-01-23');
select results_eq($$select due_on from public.bill_occurrences
  where bill_id = current_setting('test.sep_bill')::uuid order by ordinal$$,
  $$values (date '2026-09-30'), (date '2026-10-30'),
    (date '2026-11-30'), (date '2026-12-30')$$,
  'overdue September cycle continues through all dates inside the 90-day horizon');
select results_eq($$select ordinal from public.bill_occurrences
  where bill_id = current_setting('test.sep_bill')::uuid order by ordinal$$,
  $$values (0), (1), (2), (3)$$,
  'September recurrence keeps unique cycle ordinals');
select app_private.generate_bill_occurrences_from(
  current_setting('test.sep_bill')::uuid, date '2026-10-25', date '2027-01-23');
select is((select count(*) from public.bill_occurrences
  where bill_id = current_setting('test.sep_bill')::uuid), 4::bigint,
  'repeated reconciliation does not duplicate cycles');

with created as (
  insert into public.bills (user_id, client_request_id, title, amount_minor,
    recurrence, anchor_due_on) values
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', gen_random_uuid(),
      'November anchor', 100, 'monthly', date '2026-11-30') returning id
)
select set_config('test.nov_bill', id::text, true) from created;
select app_private.generate_bill_occurrences_from(
  current_setting('test.nov_bill')::uuid, date '2026-10-25', date '2027-01-23');
select results_eq($$select due_on from public.bill_occurrences
  where bill_id = current_setting('test.nov_bill')::uuid order by ordinal$$,
  $$values (date '2026-11-30'), (date '2026-12-30')$$,
  'November anchor generates December but January 30 is outside the horizon');

with created as (
  insert into public.bills (user_id, client_request_id, title, amount_minor,
    recurrence, anchor_due_on) values
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', gen_random_uuid(),
      'January future anchor', 100, 'monthly', date '2027-01-31') returning id
)
select set_config('test.jan_future_bill', id::text, true) from created;
select app_private.generate_bill_occurrences_from(
  current_setting('test.jan_future_bill')::uuid, date '2026-10-25', date '2027-01-23');
select results_eq($$select due_on from public.bill_occurrences
  where bill_id = current_setting('test.jan_future_bill')::uuid order by ordinal$$,
  $$values (date '2027-01-31')$$,
  'January 31 initial occurrence exists even though it is beyond the horizon');

with created as (
  insert into public.bills (user_id, client_request_id, title, amount_minor,
    recurrence, anchor_due_on) values
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', gen_random_uuid(),
      'Skipped months', 100, 'monthly', date '2026-01-15') returning id
)
select set_config('test.skipped_bill', id::text, true) from created;
select app_private.generate_bill_occurrences_from(
  current_setting('test.skipped_bill')::uuid, date '2026-01-01', date '2026-04-01');
update public.bill_occurrences set status = 'paid', paid_at = '2026-02-16 09:00+08'
  where bill_id = current_setting('test.skipped_bill')::uuid and ordinal = 1;
-- Model rows already materialized by the applied skip migration, leaving a gap.
insert into public.bill_occurrences (user_id, bill_id, ordinal, due_on, amount_minor)
  values
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', current_setting('test.skipped_bill')::uuid,
      10, date '2026-11-15', 175),
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', current_setting('test.skipped_bill')::uuid,
      11, date '2026-12-15', 100),
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', current_setting('test.skipped_bill')::uuid,
      12, date '2027-01-15', 100);
select app_private.generate_bill_occurrences_from(
  current_setting('test.skipped_bill')::uuid, date '2026-10-25', date '2027-01-23');
select results_eq($$select due_on from public.bill_occurrences
  where bill_id = current_setting('test.skipped_bill')::uuid order by ordinal$$,
  $$values (date '2026-01-15'), (date '2026-02-15'), (date '2026-03-15'),
    (date '2026-04-15'), (date '2026-05-15'), (date '2026-06-15'),
    (date '2026-07-15'), (date '2026-08-15'), (date '2026-09-15'),
    (date '2026-10-15'), (date '2026-11-15'), (date '2026-12-15'),
    (date '2027-01-15')$$,
  'long app absence backfills every missing historical cycle and extends the horizon');
select results_eq($$select ordinal from public.bill_occurrences
  where bill_id = current_setting('test.skipped_bill')::uuid order by ordinal$$,
  $$values (0), (1), (2), (3), (4), (5), (6), (7), (8), (9), (10), (11), (12)$$,
  'reconciliation repairs ordinal gaps below the highest existing cycle');
select is((select count(*) from public.bill_occurrences
  where bill_id = current_setting('test.skipped_bill')::uuid
    and ordinal between 3 and 9 and status = 'unpaid' and paid_at is null), 7::bigint,
  'backfilled historical cycles start unpaid and become overdue by date');
select is((select count(*) from public.active_bill_occurrence_read
  where bill_id = current_setting('test.skipped_bill')::uuid
    and due_on < date '2026-10-25' and status = 'unpaid'), 9::bigint,
  'backfilled unpaid historical cycles appear in the derived overdue read');
select is((select paid_at from public.bill_occurrences
  where bill_id = current_setting('test.skipped_bill')::uuid and ordinal = 1),
  '2026-02-16 09:00+08'::timestamptz,
  'paid historical occurrence and timestamp stay unchanged');
select is((select amount_minor from public.bill_occurrences
  where bill_id = current_setting('test.skipped_bill')::uuid and ordinal = 10),
  175::bigint, 'existing unpaid cycle amount stays unchanged');
select app_private.generate_bill_occurrences_from(
  current_setting('test.skipped_bill')::uuid, date '2026-10-25', date '2027-01-23');
select is((select count(*) from public.bill_occurrences
  where bill_id = current_setting('test.skipped_bill')::uuid), 13::bigint,
  'repeated long-gap reconciliation remains idempotent');

with created as (
  insert into public.bills (user_id, client_request_id, title, amount_minor,
    recurrence, anchor_due_on) values
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', gen_random_uuid(),
      'January gap', 100, 'monthly', date '2027-01-31') returning id
)
select set_config('test.january_gap_bill', id::text, true) from created;
select app_private.generate_bill_occurrences_from(
  current_setting('test.january_gap_bill')::uuid, date '2027-01-01', date '2027-01-31');
select app_private.generate_bill_occurrences_from(
  current_setting('test.january_gap_bill')::uuid, date '2027-06-10', date '2027-09-08');
select results_eq($$select due_on from public.bill_occurrences
  where bill_id = current_setting('test.january_gap_bill')::uuid order by ordinal$$,
  $$values (date '2027-01-31'), (date '2027-02-28'),
    (date '2027-03-31'), (date '2027-04-30'), (date '2027-05-31'),
    (date '2027-06-30'), (date '2027-07-31'), (date '2027-08-31')$$,
  'January 31 resumes in June, backfills missed months, and stops at the 90-day horizon');

with created as (
  insert into public.bills (user_id, client_request_id, title, amount_minor,
    recurrence, anchor_due_on) values
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', gen_random_uuid(),
      'Month end', 100, 'monthly', date '2027-01-31') returning id
)
select set_config('test.month_end_bill', id::text, true) from created;
select app_private.generate_bill_occurrences_from(
  current_setting('test.month_end_bill')::uuid, date '2027-01-01', date '2027-05-31');
select results_eq($$select due_on from public.bill_occurrences
  where bill_id = current_setting('test.month_end_bill')::uuid order by ordinal$$,
  $$values (date '2027-01-31'), (date '2027-02-28'),
    (date '2027-03-31'), (date '2027-04-30'), (date '2027-05-31')$$,
  'January 31 anchor clamps February and April without drifting');
select is(app_private.bill_due_on(date '2028-01-31','monthly',1), date '2028-02-29',
  'leap February clamps a January 31 anchor to February 29');

with created as (
  insert into public.bills (user_id, client_request_id, title, amount_minor,
    recurrence, anchor_due_on) values
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', gen_random_uuid(),
      'Leap annual', 100, 'yearly', date '2028-02-29') returning id
)
select set_config('test.leap_bill', id::text, true) from created;
select app_private.generate_bill_occurrences_from(
  current_setting('test.leap_bill')::uuid, date '2028-01-01', date '2028-02-29');
select app_private.generate_bill_occurrences_from(
  current_setting('test.leap_bill')::uuid, date '2032-01-01', date '2032-03-01');
select results_eq($$select due_on from public.bill_occurrences
  where bill_id = current_setting('test.leap_bill')::uuid order by ordinal$$,
  $$values (date '2028-02-29'), (date '2029-02-28'),
    (date '2030-02-28'), (date '2031-02-28'), (date '2032-02-29')$$,
  'missed yearly leap-day cycles backfill and return to February 29 without drift');

with created as (
  insert into public.bills (user_id, client_request_id, title, amount_minor,
    recurrence, anchor_due_on, archived_at) values
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', gen_random_uuid(),
      'Archived', 100, 'monthly', date '2026-09-30', now()) returning id
)
select set_config('test.archived_bill', id::text, true) from created;
select app_private.generate_bill_occurrences_from(
  current_setting('test.archived_bill')::uuid, date '2026-10-25', date '2027-01-23');
select is((select count(*) from public.bill_occurrences
  where bill_id = current_setting('test.archived_bill')::uuid), 0::bigint,
  'archived bill does not generate occurrences');

with created as (
  insert into public.bills (user_id, client_request_id, title, amount_minor,
    recurrence, anchor_due_on) values
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', gen_random_uuid(),
      'One time', 100, 'none', date '2026-09-30') returning id
)
select set_config('test.once_bill', id::text, true) from created;
select app_private.generate_bill_occurrences_from(
  current_setting('test.once_bill')::uuid, date '2026-10-25', date '2027-01-23');
select is((select count(*) from public.bill_occurrences
  where bill_id = current_setting('test.once_bill')::uuid), 1::bigint,
  'one-time bill keeps only its requested occurrence');

with created as (
  insert into public.bills (user_id, client_request_id, title, amount_minor,
    recurrence, anchor_due_on) values
    ('ffffffff-ffff-4fff-8fff-ffffffffffff', gen_random_uuid(),
      'Other owner', 100, 'monthly', date '2026-09-30') returning id
)
select set_config('test.other_bill', id::text, true) from created;
select app_private.generate_bill_occurrences_from(
  current_setting('test.other_bill')::uuid, date '2026-09-25', date '2026-09-30');
select app_private.bill_command('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'reconcile', gen_random_uuid(), '{}'::jsonb);
select is((select count(*) from public.bill_occurrences
  where bill_id = current_setting('test.other_bill')::uuid), 1::bigint,
  'A reconciliation does not generate B-owned cycles');

-- The public create command uses the profile-local current date and creates future cycles now.
select set_config('test.created_past_bill', app_private.bill_command(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'create', gen_random_uuid(),
  jsonb_build_object('title','Overdue at creation','amount_minor','100',
    'due_on', to_char((date_trunc('month',
      (now() at time zone 'Asia/Manila')::date)::date - interval '1 month' +
      interval '14 days')::date, 'YYYY-MM-DD'), 'recurrence','monthly'))
  ->>'bill_id', true);
select ok((select count(*) > 1 from public.bill_occurrences
  where bill_id = current_setting('test.created_past_bill')::uuid),
  'create command immediately adds upcoming cycles for an overdue anchor');
select is((select due_on from public.bill_occurrences
  where bill_id = current_setting('test.created_past_bill')::uuid and ordinal = 0),
  (select anchor_due_on from public.bills
    where id = current_setting('test.created_past_bill')::uuid),
  'create command preserves the requested overdue initial occurrence');

select * from finish();
rollback;
