begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','00000000-0000-0000-0000-000000000000',
    'authenticated','authenticated','loans-a@example.test','test-only',now(),now(),now()),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff','00000000-0000-0000-0000-000000000000',
    'authenticated','authenticated','loans-b@example.test','test-only',now(),now(),now());

select is((select relrowsecurity from pg_class where oid = 'public.loans'::regclass), true, 'loans RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.loan_installments'::regclass), true, 'installments RLS enabled');
select is(has_table_privilege('anon','public.loans','SELECT'), false, 'anonymous loans denied');
select is(has_table_privilege('authenticated','public.loan_installments','INSERT'), false, 'clients cannot create installments');
select is(has_table_privilege('authenticated','public.loan_installments','DELETE'), false, 'clients cannot delete installments');
select is(has_column_privilege('authenticated','public.loans','user_id','UPDATE'), false, 'owner cannot be changed');
select is(has_column_privilege('authenticated','public.loan_installments','due_date','UPDATE'), false, 'clients cannot rewrite due dates');
select is(has_column_privilege('authenticated','public.loan_installments','paid_at','UPDATE'), false, 'clients cannot change payment state directly');
select is(has_function_privilege('anon','public.set_loan_installment_paid(uuid, boolean)','EXECUTE'),
  false, 'anonymous cannot call installment mutation');
select is(has_function_privilege('authenticated','public.set_loan_installment_paid(uuid, boolean)','EXECUTE'),
  true, 'authenticated owner can call installment mutation');
select is(app_private.loan_month_date(date '2028-01-31',2), date '2028-02-29', 'leap February clamps');
select is(app_private.loan_month_date(date '2028-01-31',3), date '2028-03-31', 'March returns to 31');
select is(app_private.loan_month_date(date '2027-01-31',2), date '2027-02-28', 'ordinary February clamps');
select is(app_private.loan_month_date(date '2028-01-31',4), date '2028-04-30', 'April clamps');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', true);
insert into public.loans (id,title,monthly_payment_centavos,first_due_date,total_months) values
  ('e0000000-0000-4000-8000-000000000001','Motorcycle Loan',350000,'2026-11-15',12);
select is((select count(*) from public.loan_installments where loan_id = 'e0000000-0000-4000-8000-000000000001'),
  12::bigint, 'a 12 month loan creates exactly 12 installments');
select is((select due_date from public.loan_installments where loan_id = 'e0000000-0000-4000-8000-000000000001'
  and installment_number = 1), date '2026-11-15', 'first installment uses first due date');
select is((select due_date from public.loan_installments where loan_id = 'e0000000-0000-4000-8000-000000000001'
  and installment_number = 12), date '2027-10-15', 'twelfth installment is the last');
select is((select paid_months from public.loan_summary_read where id = 'e0000000-0000-4000-8000-000000000001'),
  0, 'initial paid months zero');
select is((select next_due_date from public.loan_summary_read where id = 'e0000000-0000-4000-8000-000000000001'),
  date '2026-11-15', 'initial next due');
select is((select monthly_payment_centavos from public.loan_summary_read where id = 'e0000000-0000-4000-8000-000000000001'),
  '350000', 'amount is transported as exact decimal text');
select throws_ok($$insert into public.loans (id,title,monthly_payment_centavos,first_due_date,total_months) values
  ('e0000000-0000-4000-8000-000000000001','Duplicate',350000,'2026-11-15',12)$$,
  '23505', null, 'retry with the same UUID cannot duplicate loan or installments');
select throws_ok($$insert into public.loans (id,title,monthly_payment_centavos,first_due_date,total_months) values
  ('e0000000-0000-4000-8000-000000000002','Bad',0,'2026-11-15',12)$$,
  '23514', null, 'zero payment denied');
select throws_ok($$insert into public.loans (id,user_id,title,monthly_payment_centavos,first_due_date,total_months) values
  ('e0000000-0000-4000-8000-000000000003','ffffffff-ffff-4fff-8fff-ffffffffffff','Forged',350000,'2026-11-15',12)$$,
  '42501', null, 'client cannot supply another owner');

select public.set_loan_installment_paid((select id from public.loan_installments
  where loan_id = 'e0000000-0000-4000-8000-000000000001' and installment_number = 1), true);
select ok((select paid_at > now() - interval '1 minute' from public.loan_installments
  where loan_id = 'e0000000-0000-4000-8000-000000000001' and installment_number = 1),
  'mark paid uses server time');
select is((select paid_months from public.loan_summary_read where id = 'e0000000-0000-4000-8000-000000000001'),
  1, 'paid count increases');
select is((select total_months - paid_months from public.loan_summary_read where id = 'e0000000-0000-4000-8000-000000000001'),
  11, 'remaining count decreases');
select is((select next_due_date from public.loan_summary_read where id = 'e0000000-0000-4000-8000-000000000001'),
  date '2026-12-15', 'next due advances');
select is(public.set_loan_installment_paid((select id from public.loan_installments
  where loan_id = 'e0000000-0000-4000-8000-000000000001' and installment_number = 1), true),
  (select paid_at from public.loan_installments where loan_id = 'e0000000-0000-4000-8000-000000000001'
   and installment_number = 1), 'repeated mark paid preserves original timestamp');
select is(public.set_loan_installment_paid((select id from public.loan_installments
  where loan_id = 'e0000000-0000-4000-8000-000000000001' and installment_number = 1), false),
  null::timestamptz, 'correction returns installment to unpaid');
select is((select paid_months from public.loan_summary_read where id = 'e0000000-0000-4000-8000-000000000001'),
  0, 'correction restores paid count');
select public.set_loan_installment_paid((select id from public.loan_installments
  where loan_id = 'e0000000-0000-4000-8000-000000000001' and installment_number = 1), true);
select throws_ok($$delete from public.loans where id = 'e0000000-0000-4000-8000-000000000001'$$,
  'P0001', null, 'loan with paid history cannot be deleted');
select throws_ok($$update public.loans set total_months = 0
  where id = 'e0000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'term cannot be zero');

update public.loans set first_due_date = '2026-11-20', monthly_payment_centavos = 360000
  where id = 'e0000000-0000-4000-8000-000000000001';
select is((select due_date from public.loan_installments where loan_id = 'e0000000-0000-4000-8000-000000000001'
  and installment_number = 1), date '2026-11-15', 'paid historical date preserved after edit');
select is((select monthly_payment_centavos from public.loan_installments where loan_id = 'e0000000-0000-4000-8000-000000000001'
  and installment_number = 1), 350000::bigint, 'paid historical amount preserved after edit');
select is((select due_date from public.loan_installments where loan_id = 'e0000000-0000-4000-8000-000000000001'
  and installment_number = 2), date '2026-12-20', 'unpaid date follows new anchor');
select is((select monthly_payment_centavos from public.loan_installments where loan_id = 'e0000000-0000-4000-8000-000000000001'
  and installment_number = 2), 360000::bigint, 'unpaid amount follows edited payment');
select is((select count(*) from public.loan_installments where loan_id = 'e0000000-0000-4000-8000-000000000001'),
  12::bigint, 'edit does not duplicate installments');
select public.set_loan_installment_paid(id, true) from public.loan_installments
  where loan_id = 'e0000000-0000-4000-8000-000000000001' and paid_at is null;
select throws_ok($$update public.loans set total_months = 11
  where id = 'e0000000-0000-4000-8000-000000000001'$$,
  'P0001', null, 'term cannot remove paid installment history');
select is((select paid_months from public.loan_summary_read where id = 'e0000000-0000-4000-8000-000000000001'),
  12, 'all 12 marked paid');
select is((select next_due_date from public.loan_summary_read where id = 'e0000000-0000-4000-8000-000000000001'),
  null::date, 'paid off has no next due');
select is((select count(*) from public.loan_installments where loan_id = 'e0000000-0000-4000-8000-000000000001'),
  12::bigint, 'paid off creates no extra installment');
update public.loans set archived_at = now() where id = 'e0000000-0000-4000-8000-000000000001';
select ok((select archived_at is not null from public.loans where id = 'e0000000-0000-4000-8000-000000000001'),
  'paid loan can be archived');

insert into public.loans (id,title,monthly_payment_centavos,first_due_date,total_months) values
  ('e0000000-0000-4000-8000-000000000004','Month end',250000,'2028-01-31',5);
select results_eq($$select due_date from public.loan_installments where loan_id =
  'e0000000-0000-4000-8000-000000000004' order by installment_number$$,
  $$values (date '2028-01-31'),(date '2028-02-29'),(date '2028-03-31'),
    (date '2028-04-30'),(date '2028-05-31')$$, 'month end generation has no drift');
with removed as (delete from public.loans where id = 'e0000000-0000-4000-8000-000000000004' returning id)
select is((select count(*) from removed), 1::bigint, 'loan without paid history can be deleted');

insert into public.loans (id,title,monthly_payment_centavos,first_due_date,total_months) values
  ('e0000000-0000-4000-8000-000000000005','Overdue',10000,
   ((now() at time zone 'Asia/Manila')::date - 1),2),
  ('e0000000-0000-4000-8000-000000000006','Today',10000,
   ((now() at time zone 'Asia/Manila')::date),2);
select is((select count(*) from public.loan_installment_read where
  due_date < ((now() at time zone 'Asia/Manila')::date) and paid_at is null and archived_at is null),
  1::bigint, 'Today overdue query derives from installments');
select is((select count(*) from public.loan_installment_read where
  due_date = ((now() at time zone 'Asia/Manila')::date) and paid_at is null and archived_at is null),
  1::bigint, 'Today due query derives from installments');
update public.loans set archived_at = now() where id = 'e0000000-0000-4000-8000-000000000005';
select throws_ok($$update public.loans set archived_at = now() + interval '1 day'
  where id = 'e0000000-0000-4000-8000-000000000005'$$,
  'P0001', null, 'archive timestamp cannot be rewritten');
select throws_ok($$select public.set_loan_installment_paid((select id from public.loan_installments
  where loan_id = 'e0000000-0000-4000-8000-000000000005' and installment_number = 1), true)$$,
  '42501', null, 'archived installment cannot be marked paid');
select is((select count(*) from public.loan_installment_read where
  due_date < ((now() at time zone 'Asia/Manila')::date) and paid_at is null and archived_at is null),
  0::bigint, 'archived loan leaves Today');

reset role;
insert into public.loans (id,user_id,title,monthly_payment_centavos,first_due_date,total_months)
  values ('f0000000-0000-4000-8000-000000000001',
    'ffffffff-ffff-4fff-8fff-ffffffffffff','Other owner',10000,'2026-11-15',2);
select set_config('test.other_installment_id',
  (select id::text from public.loan_installments where loan_id = 'f0000000-0000-4000-8000-000000000001'
    and installment_number = 1), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', true);
select is((select count(*) from public.loan_summary_read where id = 'f0000000-0000-4000-8000-000000000001'),
  0::bigint, 'cannot read another loan');
select is((select count(*) from public.loan_installment_read where loan_id = 'f0000000-0000-4000-8000-000000000001'),
  0::bigint, 'cannot read another installment');
select throws_ok($$select public.set_loan_installment_paid(
  current_setting('test.other_installment_id')::uuid, true)$$,
  '42501', null, 'cannot mark another owner installment paid');
with changed as (update public.loans set title = 'Stolen' where id =
  'f0000000-0000-4000-8000-000000000001' returning id)
select is((select count(*) from changed), 0::bigint, 'cannot edit another loan');
with removed as (delete from public.loans where id =
  'f0000000-0000-4000-8000-000000000001' returning id)
select is((select count(*) from removed), 0::bigint, 'cannot delete another loan');

reset role;
select set_config('request.jwt.claim.sub', '', true);
delete from auth.users where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
select is((select count(*) from public.loans where user_id =
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), 0::bigint,
  'administrative account deletion cascades paid history');

select * from finish();
rollback;
