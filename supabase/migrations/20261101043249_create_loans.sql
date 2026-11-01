-- Monthly installments only. Apply after the Bills retirement migration.
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title)),
  monthly_payment_centavos bigint not null check (monthly_payment_centavos between 1 and 1000000000000),
  first_due_date date not null check (first_due_date between date '2000-01-01' and date '2100-12-31'),
  total_months integer not null check (total_months between 1 and 600),
  notes text check (notes is null or char_length(notes) <= 2000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create table public.loan_installments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null,
  user_id uuid not null,
  installment_number integer not null check (installment_number between 1 and 600),
  due_date date not null,
  monthly_payment_centavos bigint not null check (monthly_payment_centavos between 1 and 1000000000000),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (loan_id, user_id) references public.loans(id, user_id) on delete cascade,
  unique (loan_id, installment_number)
);
create index loans_list_idx on public.loans (user_id, created_at desc, id desc);
create index loan_installments_owner_due_idx on public.loan_installments (user_id, due_date, id) where paid_at is null;
create index loan_installments_loan_paid_idx on public.loan_installments (loan_id, installment_number) include (paid_at, due_date);

-- Every date is computed from the original anchor, so February never shifts March.
create function app_private.loan_month_date(anchor date, installment_number integer)
returns date language sql immutable set search_path = '' as $$
  select make_date(
    extract(year from (date_trunc('month', anchor::timestamp) + make_interval(months => installment_number - 1)))::integer,
    extract(month from (date_trunc('month', anchor::timestamp) + make_interval(months => installment_number - 1)))::integer,
    least(extract(day from anchor)::integer,
      extract(day from (date_trunc('month', anchor::timestamp) + make_interval(months => installment_number)) - interval '1 day')::integer)
  );
$$;
revoke all on function app_private.loan_month_date(date, integer) from public, anon, authenticated;

create function app_private.sync_loan_installments()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app_private.loan_month_date(new.first_due_date, new.total_months) > date '2100-12-31' then
    raise exception 'Last installment must be by 2100-12-31';
  end if;
  if tg_op = 'UPDATE' then
    if exists (select 1 from public.loan_installments i where i.loan_id = new.id
      and i.installment_number > new.total_months and i.paid_at is not null) then
      raise exception 'Term cannot remove paid installments';
    end if;
    delete from public.loan_installments i where i.loan_id = new.id
      and i.installment_number > new.total_months and i.paid_at is null;
  end if;
  insert into public.loan_installments (loan_id, user_id, installment_number, due_date, monthly_payment_centavos)
  select new.id, new.user_id, n, app_private.loan_month_date(new.first_due_date, n),
    new.monthly_payment_centavos
  from generate_series(1, new.total_months) as n
  on conflict (loan_id, installment_number) do update
    set due_date = excluded.due_date, monthly_payment_centavos = excluded.monthly_payment_centavos
    where public.loan_installments.paid_at is null
      and (public.loan_installments.due_date is distinct from excluded.due_date or
        public.loan_installments.monthly_payment_centavos is distinct from excluded.monthly_payment_centavos);
  return null;
end;
$$;
revoke all on function app_private.sync_loan_installments() from public, anon, authenticated;
create trigger loan_installments_on_create after insert on public.loans
  for each row execute function app_private.sync_loan_installments();
create trigger loan_installments_on_schedule after update of first_due_date, total_months, monthly_payment_centavos on public.loans
  for each row when (old.first_due_date is distinct from new.first_due_date or
    old.total_months is distinct from new.total_months or
    old.monthly_payment_centavos is distinct from new.monthly_payment_centavos)
  execute function app_private.sync_loan_installments();

create function app_private.guard_loan_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    -- Administrative account deletion cascades through Auth without a user JWT.
    if (select auth.uid()) is null then
      return old;
    end if;
    if exists (select 1 from public.loan_installments where loan_id = old.id and paid_at is not null) then
      raise exception 'Archive loans with paid installment history';
    end if;
    return old;
  end if;
  if old.archived_at is not null and new.archived_at is null then
    raise exception 'Archived loans cannot be reopened';
  end if;
  if old.archived_at is not null and new.archived_at is distinct from old.archived_at then
    raise exception 'Archive time cannot be changed';
  end if;
  if old.archived_at is not null and (new.title, new.monthly_payment_centavos, new.first_due_date,
    new.total_months, new.notes) is distinct from
    (old.title, old.monthly_payment_centavos, old.first_due_date, old.total_months, old.notes) then
    raise exception 'Archived loans cannot be edited';
  end if;
  if old.archived_at is null and new.archived_at is not null then
    new.archived_at := clock_timestamp();
  end if;
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
revoke all on function app_private.guard_loan_change() from public, anon, authenticated;
create trigger loan_guard before update or delete on public.loans
  for each row execute function app_private.guard_loan_change();

-- Lock the parent first, matching loan edits, archive, and deletion.
create function public.set_loan_installment_paid(p_installment_id uuid, p_paid boolean)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_loan_id uuid;
  v_paid_at timestamptz;
begin
  if (select auth.uid()) is null or p_installment_id is null or p_paid is null then
    raise exception 'Invalid loan installment command' using errcode = '22023';
  end if;
  select l.id into v_loan_id
  from public.loans l
  join public.loan_installments i on i.loan_id = l.id and i.user_id = l.user_id
  where i.id = p_installment_id and l.user_id = (select auth.uid())
    and l.archived_at is null
  for update of l;
  if v_loan_id is null then
    raise exception 'Loan installment unavailable' using errcode = '42501';
  end if;
  if p_paid then
    update public.loan_installments set paid_at = clock_timestamp()
      where id = p_installment_id and loan_id = v_loan_id and paid_at is null
      returning paid_at into v_paid_at;
  else
    update public.loan_installments set paid_at = null
      where id = p_installment_id and loan_id = v_loan_id and paid_at is not null;
  end if;
  if not found then
    select paid_at into v_paid_at from public.loan_installments
      where id = p_installment_id and loan_id = v_loan_id;
  end if;
  return v_paid_at;
end;
$$;
revoke all on function public.set_loan_installment_paid(uuid, boolean) from public, anon;
grant execute on function public.set_loan_installment_paid(uuid, boolean) to authenticated;

alter table public.loans enable row level security;
alter table public.loan_installments enable row level security;
revoke all on public.loans, public.loan_installments from public, anon, authenticated;
grant select (id, user_id, title, monthly_payment_centavos, first_due_date, total_months, notes,
  archived_at, created_at, updated_at) on public.loans to authenticated;
grant insert (id, title, monthly_payment_centavos, first_due_date, total_months, notes) on public.loans to authenticated;
grant update (title, monthly_payment_centavos, first_due_date, total_months, notes, archived_at) on public.loans to authenticated;
grant delete on public.loans to authenticated;
grant select (id, loan_id, user_id, installment_number, due_date, monthly_payment_centavos, paid_at, created_at)
  on public.loan_installments to authenticated;
create policy loans_select on public.loans for select to authenticated using ((select auth.uid()) = user_id);
create policy loans_insert on public.loans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy loans_update on public.loans for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy loans_delete on public.loans for delete to authenticated using ((select auth.uid()) = user_id);
create policy installments_select on public.loan_installments for select to authenticated using ((select auth.uid()) = user_id);
create policy installments_update on public.loan_installments for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Exact centavo strings for JavaScript; security invoker preserves base-table RLS.
create view public.loan_summary_read with (security_invoker = true) as
select l.id, l.user_id, l.title, l.monthly_payment_centavos::text, l.first_due_date,
  l.total_months, l.notes, l.archived_at, l.created_at, l.updated_at,
  (select count(*)::integer from public.loan_installments i where i.loan_id = l.id and i.paid_at is not null) as paid_months,
  (select min(i.due_date) from public.loan_installments i where i.loan_id = l.id and i.paid_at is null) as next_due_date,
  (select i.id from public.loan_installments i where i.loan_id = l.id and i.paid_at is null
    order by i.due_date, i.installment_number limit 1) as next_installment_id
from public.loans l;
create view public.loan_installment_read with (security_invoker = true) as
select i.id, i.loan_id, i.user_id, i.installment_number, i.due_date, i.paid_at, i.created_at,
  l.title, i.monthly_payment_centavos::text, l.archived_at
from public.loan_installments i join public.loans l on l.id = i.loan_id and l.user_id = i.user_id;
revoke all on public.loan_summary_read, public.loan_installment_read from public, anon, authenticated;
grant select on public.loan_summary_read, public.loan_installment_read to authenticated;
