begin;
select plan(11);

select is((select count(*)::integer from supabase_migrations.schema_migrations
  where version in ('20261025105232', '20261025133030', '20261026024934')), 3,
  'all historical Bills migrations replayed before removal');
select ok(to_regclass('public.bills') is null, 'Bills table removed');
select ok(to_regclass('public.bill_occurrences') is null, 'Bill occurrences removed');
select ok(to_regclass('app_private.bill_command_receipts') is null, 'Bill receipts removed');
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and c.relname in ('bill_read', 'bill_occurrence_read',
      'active_bill_occurrence_read', 'archived_bill_occurrence_read')), 0,
  'Bill read views removed');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app_private' and p.proname in
    ('bill_command', 'bill_due_on', 'generate_bill_occurrences',
      'generate_bill_occurrences_from')), 0, 'Bill command and recurrence functions removed');
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'app_private') and c.relkind = 'i'
    and c.relname like '%bill%'), 0, 'Bill indexes removed');
select is((select count(*)::integer from pg_policies
  where tablename in ('bills', 'bill_occurrences', 'bill_command_receipts')), 0,
  'Bill policies removed');
select is((select rolcanlogin from pg_roles where rolname = 'lifeops_bill_commands'), false,
  'retired Bills role cannot log in');
select is(has_schema_privilege('lifeops_bill_commands', 'app_private', 'USAGE'), false,
  'retired Bills role has no private schema access');
select ok(to_regclass('public.tasks') is not null and to_regclass('public.profiles') is not null,
  'shared Tasks and profiles remain');

select * from finish();
rollback;
