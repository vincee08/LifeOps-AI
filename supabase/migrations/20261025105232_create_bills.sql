-- Bills record outside obligations. All dependent writes run in one private command transaction.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'lifeops_bill_commands') then
    create role lifeops_bill_commands login noinherit;
  end if;
end $$;
revoke all on schema public from lifeops_bill_commands;
grant usage on schema app_private to lifeops_bill_commands;

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_request_id uuid not null,
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title)),
  category text not null default 'other' check (category in
    ('utilities','housing','subscription','insurance','installment','school','other')),
  amount_minor bigint not null check (amount_minor between 1 and 1000000000000),
  currency_code text not null default 'PHP' check (currency_code = 'PHP'),
  recurrence text not null default 'none' check (recurrence in ('none','weekly','monthly','yearly')),
  anchor_due_on date not null check (anchor_due_on between date '2000-01-01' and date '2100-12-31'),
  notes text check (notes is null or char_length(notes) <= 2000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, client_request_id)
);

create table public.bill_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bill_id uuid not null,
  ordinal integer not null check (ordinal >= 0),
  due_on date not null check (due_on between date '2000-01-01' and date '2100-12-31'),
  amount_minor bigint not null check (amount_minor between 1 and 1000000000000),
  status text not null default 'unpaid' check (status in ('unpaid','paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bill_occurrence_owner_fk foreign key (user_id, bill_id)
    references public.bills (user_id, id) on delete cascade,
  constraint bill_occurrence_status_check check ((status = 'paid') = (paid_at is not null)),
  unique (bill_id, ordinal)
);

create index bills_active_owner_idx on public.bills (user_id, id) where archived_at is null;
create index bill_occurrences_unpaid_due_idx
  on public.bill_occurrences (user_id, due_on, id) where status = 'unpaid';
create index bill_occurrences_paid_idx
  on public.bill_occurrences (user_id, paid_at desc, id desc) where status = 'paid';

alter table public.bills enable row level security;
alter table public.bill_occurrences enable row level security;
revoke all on public.bills, public.bill_occurrences from public, anon, authenticated;
grant select on public.bills, public.bill_occurrences to authenticated;
create policy "Owner reads bills" on public.bills for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Owner reads bill occurrences" on public.bill_occurrences for select to authenticated
  using ((select auth.uid()) = user_id);

-- Invoker views encode bigint amounts as decimal strings on the wire.
create view public.bill_read with (security_invoker = true) as
  select id, user_id, client_request_id, title, category, amount_minor::text as amount_minor,
    currency_code, recurrence, anchor_due_on, notes, archived_at, created_at, updated_at
  from public.bills;
create view public.bill_occurrence_read with (security_invoker = true) as
  select id, user_id, bill_id, ordinal, due_on, amount_minor::text as amount_minor,
    status, paid_at, created_at, updated_at
  from public.bill_occurrences;
create view public.active_bill_occurrence_read with (security_invoker = true) as
  select occurrence.id, occurrence.user_id, occurrence.bill_id, occurrence.ordinal,
    occurrence.due_on, occurrence.amount_minor::text as amount_minor,
    occurrence.status, occurrence.paid_at, occurrence.created_at, occurrence.updated_at
  from public.bill_occurrences occurrence
  join public.bills bill on bill.id = occurrence.bill_id and bill.user_id = occurrence.user_id
  where bill.archived_at is null;
create view public.archived_bill_occurrence_read with (security_invoker = true) as
  select occurrence.id, occurrence.user_id, occurrence.bill_id, occurrence.ordinal,
    occurrence.due_on, occurrence.amount_minor::text as amount_minor,
    occurrence.status, occurrence.paid_at, occurrence.created_at, occurrence.updated_at
  from public.bill_occurrences occurrence
  join public.bills bill on bill.id = occurrence.bill_id and bill.user_id = occurrence.user_id
  where bill.archived_at is not null;
revoke all on public.bill_read, public.bill_occurrence_read,
  public.active_bill_occurrence_read, public.archived_bill_occurrence_read
  from public, anon, authenticated;
grant select on public.bill_read, public.bill_occurrence_read,
  public.active_bill_occurrence_read, public.archived_bill_occurrence_read to authenticated;

create table app_private.bill_command_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  request_id uuid not null,
  payload_hash bytea not null check (octet_length(payload_hash) = 32),
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, action, request_id)
);
alter table app_private.bill_command_receipts enable row level security;
revoke all on app_private.bill_command_receipts from public, anon, authenticated,
  lifeops_bill_commands;

create function app_private.bill_due_on(anchor date, rule text, n integer)
returns date language plpgsql immutable set search_path = '' as $$
declare target_year integer; target_month integer; last_day integer;
begin
  if n < 0 then raise exception 'Invalid bill cycle'; end if;
  if rule = 'none' then
    if n <> 0 then raise exception 'Invalid one-time cycle'; end if;
    return anchor;
  elsif rule = 'weekly' then
    return anchor + n * 7;
  elsif rule = 'monthly' then
    target_year := extract(year from anchor)::integer +
      (extract(month from anchor)::integer - 1 + n) / 12;
    target_month := (extract(month from anchor)::integer - 1 + n) % 12 + 1;
  elsif rule = 'yearly' then
    target_year := extract(year from anchor)::integer + n;
    target_month := extract(month from anchor)::integer;
  else
    raise exception 'Invalid recurrence';
  end if;
  last_day := extract(day from (pg_catalog.make_date(target_year, target_month, 1) +
    interval '1 month - 1 day'))::integer;
  return pg_catalog.make_date(target_year, target_month,
    least(extract(day from anchor)::integer, last_day));
end;
$$;
revoke all on function app_private.bill_due_on(date,text,integer) from public, anon, authenticated,
  lifeops_bill_commands;

create function app_private.generate_bill_occurrences(target_id uuid, horizon date)
returns void language plpgsql security definer set search_path = '' as $$
declare bill public.bills%rowtype; cycle integer; due date;
begin
  select * into bill from public.bills where id = target_id for update;
  if not found or bill.archived_at is not null then return; end if;
  select coalesce(max(ordinal), -1) + 1 into cycle from public.bill_occurrences where bill_id = bill.id;
  loop
    if bill.recurrence = 'none' and cycle > 0 then exit; end if;
    due := app_private.bill_due_on(bill.anchor_due_on, bill.recurrence, cycle);
    if due > horizon and cycle > 0 then exit; end if;
    exit when due > date '2100-12-31';
    insert into public.bill_occurrences (user_id, bill_id, ordinal, due_on, amount_minor)
      values (bill.user_id, bill.id, cycle, due, bill.amount_minor)
      on conflict (bill_id, ordinal) do nothing;
    cycle := cycle + 1;
    exit when cycle > 6000; -- Defensive bound for old weekly anchors.
  end loop;
end;
$$;
revoke all on function app_private.generate_bill_occurrences(uuid,date)
  from public, anon, authenticated, lifeops_bill_commands;

create function app_private.bill_command(owner_id uuid, action_name text,
  request_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare receipt app_private.bill_command_receipts%rowtype;
  bill public.bills%rowtype; occurrence public.bill_occurrences%rowtype;
  command_result jsonb; amount_value bigint; due_value date; category_value text;
  recurrence_value text; title_value text; notes_value text; target_id uuid;
  local_today date;
begin
  if owner_id is null or request_id is null or payload is null or jsonb_typeof(payload) <> 'object'
    or action_name not in ('create','edit','edit_due','set_paid','archive','delete','reconcile') then
    raise exception 'Invalid bill command';
  end if;
  if not exists (select 1 from auth.users where id = owner_id) then
    raise exception 'Account unavailable';
  end if;
  select (now() at time zone timezone)::date into local_today
    from public.profiles where id = owner_id;
  if local_today is null then raise exception 'Profile unavailable'; end if;
  if action_name = 'reconcile' then
    for bill in select * from public.bills where user_id = owner_id and archived_at is null
      order by id
    loop
      perform app_private.generate_bill_occurrences(bill.id, local_today + 90);
    end loop;
    return jsonb_build_object('ok', true);
  end if;
  -- Receipts keep a digest, never a second copy of bill title, amount, or notes.
  delete from app_private.bill_command_receipts
    where user_id = owner_id and created_at < now() - interval '90 days';
  insert into app_private.bill_command_receipts (user_id, action, request_id, payload_hash)
    values (owner_id, action_name, request_id,
      pg_catalog.sha256(pg_catalog.convert_to(payload::text, 'UTF8')))
    on conflict do nothing;
  select * into receipt from app_private.bill_command_receipts as command_receipt
    where command_receipt.user_id = owner_id and command_receipt.action = action_name
      and command_receipt.request_id = bill_command.request_id
    for update;
  if receipt.payload_hash <> pg_catalog.sha256(pg_catalog.convert_to(payload::text, 'UTF8')) then
    raise exception 'Request ID was used with different details';
  end if;
  if receipt.result is not null then return receipt.result; end if;

  if action_name in ('create','edit') then
    title_value := btrim(payload->>'title');
    category_value := coalesce(payload->>'category','other');
    recurrence_value := coalesce(payload->>'recurrence','none');
    notes_value := nullif(btrim(payload->>'notes'),'');
    if title_value is null or char_length(title_value) not between 1 and 200
      or category_value not in ('utilities','housing','subscription','insurance',
        'installment','school','other')
      or recurrence_value not in ('none','weekly','monthly','yearly')
      or (notes_value is not null and char_length(notes_value) > 2000)
      or coalesce(payload->>'amount_minor','') !~ '^[1-9][0-9]{0,12}$' then
      raise exception 'Invalid bill details';
    end if;
    amount_value := (payload->>'amount_minor')::bigint;
    if amount_value > 1000000000000 then raise exception 'Amount is too large'; end if;
    if coalesce(payload->>'due_on','') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Invalid due date';
    end if;
    due_value := (payload->>'due_on')::date;
    if due_value not between date '2000-01-01' and date '2100-12-31' then
      raise exception 'Invalid due date';
    end if;
  end if;

  if action_name = 'create' then
    insert into public.bills (user_id, client_request_id, title, category, amount_minor,
      recurrence, anchor_due_on, notes)
      values (owner_id, request_id, title_value, category_value, amount_value,
        recurrence_value, due_value, notes_value) returning * into bill;
    perform app_private.generate_bill_occurrences(bill.id, local_today + 90);
    command_result := jsonb_build_object('bill_id', bill.id);
  else
    if coalesce(payload->>'id','') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'Invalid record ID';
    end if;
    target_id := (payload->>'id')::uuid;
    if action_name in ('set_paid','edit_due') then
      select * into occurrence from public.bill_occurrences
        where id = target_id and user_id = owner_id for update;
      if not found then raise exception 'Bill occurrence unavailable'; end if;
      if action_name = 'set_paid' then
        if coalesce(payload->>'paid','') not in ('true','false') then
          raise exception 'Invalid status';
        end if;
        update public.bill_occurrences set status = case when (payload->>'paid')::boolean
          then 'paid' else 'unpaid' end,
          paid_at = case when (payload->>'paid')::boolean
            then coalesce(occurrence.paid_at, clock_timestamp()) else null end,
          updated_at = clock_timestamp()
          where id = target_id and user_id = owner_id;
      else
        if occurrence.status <> 'unpaid' or coalesce(payload->>'due_on','') !~
          '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid due-date correction'; end if;
        due_value := (payload->>'due_on')::date;
        if due_value not between date '2000-01-01' and date '2100-12-31' then
          raise exception 'Invalid due date';
        end if;
        select * into bill from public.bills where id = occurrence.bill_id
          and user_id = owner_id and archived_at is null for update;
        if not found then raise exception 'Bill unavailable'; end if;
        update public.bill_occurrences set due_on = due_value, updated_at = clock_timestamp()
          where id = target_id and user_id = owner_id;
        if bill.recurrence = 'none' then
          update public.bills set anchor_due_on = due_value, updated_at = clock_timestamp()
            where id = bill.id;
        end if;
      end if;
      command_result := jsonb_build_object('occurrence_id', target_id);
    else
      select * into bill from public.bills where id = target_id and user_id = owner_id for update;
      if not found then raise exception 'Bill unavailable'; end if;
      if action_name = 'edit' then
        if (due_value <> bill.anchor_due_on or recurrence_value <> bill.recurrence) and
          exists (select 1 from public.bill_occurrences
            where bill_id = bill.id and status = 'paid') then
          raise exception 'Archive this series and create a new one to change a paid schedule';
        end if;
        if due_value <> bill.anchor_due_on or recurrence_value <> bill.recurrence then
          delete from public.bill_occurrences where bill_id = bill.id;
        else
          update public.bill_occurrences set amount_minor = amount_value,
            updated_at = clock_timestamp()
            where bill_id = bill.id and status = 'unpaid';
        end if;
        update public.bills set title = title_value, category = category_value,
          amount_minor = amount_value, recurrence = recurrence_value,
          anchor_due_on = due_value, notes = notes_value, updated_at = clock_timestamp()
          where id = bill.id;
        perform app_private.generate_bill_occurrences(bill.id, local_today + 90);
      elsif action_name = 'archive' then
        update public.bills set archived_at = coalesce(archived_at, clock_timestamp()),
          updated_at = clock_timestamp() where id = bill.id;
      elsif action_name = 'delete' then
        delete from public.bills where id = bill.id;
      end if;
      command_result := jsonb_build_object('bill_id', target_id);
    end if;
  end if;
  update app_private.bill_command_receipts as command_receipt set result = command_result
    where command_receipt.user_id = owner_id and command_receipt.action = action_name
      and command_receipt.request_id = bill_command.request_id;
  return command_result;
end;
$$;
revoke all on function app_private.bill_command(uuid,text,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function app_private.bill_command(uuid,text,uuid,jsonb)
  to lifeops_bill_commands;
