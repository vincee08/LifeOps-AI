create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create function app_private.is_iana_timezone(value text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = value);
$$;
revoke all on function app_private.is_iana_timezone(text) from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_iana_timezone(text) to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or (
    char_length(display_name) between 1 and 80 and display_name = btrim(display_name)
  )),
  timezone text not null default 'Asia/Manila' check (app_private.is_iana_timezone(timezone)),
  currency_code text not null default 'PHP' check (currency_code = 'PHP'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select (id, display_name, timezone, currency_code, created_at, updated_at)
  on public.profiles to authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create function app_private.create_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, timezone)
  values (new.id, case
    when app_private.is_iana_timezone(new.raw_user_meta_data ->> 'timezone')
      then new.raw_user_meta_data ->> 'timezone'
    else 'Asia/Manila'
  end);
  return new;
end;
$$;
revoke all on function app_private.create_profile_for_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.create_profile_for_user();

create function app_private.touch_profile_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function app_private.touch_profile_updated_at() from public, anon, authenticated;

create trigger on_profile_updated
  before update on public.profiles
  for each row execute function app_private.touch_profile_updated_at();

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
