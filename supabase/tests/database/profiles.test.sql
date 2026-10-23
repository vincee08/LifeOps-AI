begin;

select plan(22);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'a@example.test', 'test-only', now(), now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'b@example.test', 'test-only', now(), now(), now());

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'c@example.test', 'test-only', now(),
    '{"timezone":"America/New_York"}'::jsonb, now(), now()),
  ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'd@example.test', 'test-only', now(),
    '{"timezone":"not/a-real-place"}'::jsonb, now(), now());

select is((select count(*) from public.profiles where id in
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')),
  2::bigint, 'auth trigger creates one profile per new user');
select is((select currency_code from public.profiles where id =
  '11111111-1111-4111-8111-111111111111'), 'PHP', 'profile defaults to PHP');
select is((select timezone from public.profiles where id =
  '11111111-1111-4111-8111-111111111111'), 'Asia/Manila', 'profile has valid default timezone');
select is((select timezone from public.profiles where id =
  '33333333-3333-4333-8333-333333333333'), 'America/New_York', 'valid device timezone is copied');
select is((select timezone from public.profiles where id =
  '44444444-4444-4444-8444-444444444444'), 'Asia/Manila', 'invalid metadata uses safe fallback');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is((select count(*) from public.profiles), 1::bigint, 'A reads only A profile');
select is((select id from public.profiles limit 1),
  '11111111-1111-4111-8111-111111111111'::uuid, 'A profile is the visible row');
with changed as (update public.profiles set display_name = 'Alice', timezone = 'UTC'
  where id = '11111111-1111-4111-8111-111111111111' returning id)
select is((select count(*) from changed), 1::bigint, 'A updates A profile');
select is((select display_name from public.profiles where id =
  '11111111-1111-4111-8111-111111111111'), 'Alice', 'A sees own update');
select is((select count(*) from public.profiles where id =
  '22222222-2222-4222-8222-222222222222'), 0::bigint, 'A cannot read B profile');
with changed as (update public.profiles set display_name = 'stolen'
  where id = '22222222-2222-4222-8222-222222222222' returning id)
select is((select count(*) from changed), 0::bigint, 'A cannot update B profile');
select throws_ok($$update public.profiles set id = '22222222-2222-4222-8222-222222222222'
  where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', 'permission denied for table profiles', 'A cannot change profile ownership');
select throws_ok($$update public.profiles set currency_code = 'USD'
  where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', 'permission denied for table profiles', 'A cannot change currency');
select throws_ok($$insert into public.profiles (id) values
  ('33333333-3333-4333-8333-333333333333')$$,
  '42501', 'permission denied for table profiles', 'client cannot create profiles');
select throws_ok($$delete from public.profiles where id =
  '11111111-1111-4111-8111-111111111111'$$,
  '42501', 'permission denied for table profiles', 'client cannot delete profiles');

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is((select count(*) from public.profiles), 1::bigint, 'B reads only B profile');
select is((select count(*) from public.profiles where id =
  '11111111-1111-4111-8111-111111111111'), 0::bigint, 'B cannot read A profile');
with changed as (update public.profiles set display_name = 'stolen'
  where id = '11111111-1111-4111-8111-111111111111' returning id)
select is((select count(*) from changed), 0::bigint, 'B cannot update A profile');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select * from public.profiles$$,
  '42501', 'permission denied for table profiles', 'anonymous cannot read profiles');
select throws_ok($$update public.profiles set display_name = 'stolen'$$,
  '42501', 'permission denied for table profiles', 'anonymous cannot update profiles');
select throws_ok($$insert into public.profiles (id) values
  ('33333333-3333-4333-8333-333333333333')$$,
  '42501', 'permission denied for table profiles', 'anonymous cannot insert profiles');
select throws_ok($$delete from public.profiles$$,
  '42501', 'permission denied for table profiles', 'anonymous cannot delete profiles');

select * from finish();
rollback;
