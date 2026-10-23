-- The retry token is unique only within an owner; the task ID is server-generated.
create type public.task_priority as enum ('high', 'medium', 'low');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_request_id uuid not null,
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title)),
  description text check (description is null or char_length(description) <= 2000),
  category text not null default 'personal' check (category in ('personal', 'work', 'other')),
  priority public.task_priority not null default 'medium',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_request_id)
);

create index tasks_active_order_idx
  on public.tasks (user_id, due_at, priority, id) where completed_at is null;
create index tasks_overdue_idx
  on public.tasks (user_id, due_at, id) where completed_at is null and due_at is not null;
create index tasks_completed_idx
  on public.tasks (user_id, completed_at desc, id desc) where completed_at is not null;

create function app_private.touch_task_timestamps()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.completed_at is null and new.completed_at is not null then
    new.completed_at := clock_timestamp();
  elsif old.completed_at is not null and new.completed_at is not null then
    new.completed_at := old.completed_at;
  end if;
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
revoke all on function app_private.touch_task_timestamps() from public, anon, authenticated;
create trigger on_task_updated before update on public.tasks
  for each row execute function app_private.touch_task_timestamps();

alter table public.tasks enable row level security;
revoke all on public.tasks from public, anon, authenticated;
grant select (id, user_id, client_request_id, title, description, category, priority, due_at,
  completed_at, created_at, updated_at) on public.tasks to authenticated;
grant insert (user_id, client_request_id, title, description, category, priority, due_at)
  on public.tasks to authenticated;
grant update (title, description, category, priority, due_at, completed_at)
  on public.tasks to authenticated;
grant delete on public.tasks to authenticated;
grant usage on type public.task_priority to authenticated;

create policy "Users read their own tasks" on public.tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own tasks" on public.tasks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own tasks" on public.tasks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete their own tasks" on public.tasks
  for delete to authenticated using ((select auth.uid()) = user_id);
