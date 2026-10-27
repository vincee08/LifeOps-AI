-- Keep the requested first occurrence, then materialize only current/future cycles.
-- Cycle ordinals may have gaps after a long absence; the original anchor remains authoritative.
create function app_private.generate_bill_occurrences_from(
  target_id uuid, local_today date, horizon date)
returns void language plpgsql security definer set search_path = '' as $$
declare bill public.bills%rowtype;
  cycle integer; first_current_cycle integer; due date;
begin
  if local_today is null or horizon is null then raise exception 'Invalid bill horizon'; end if;
  select * into bill from public.bills where id = target_id for update;
  if not found or bill.archived_at is not null then return; end if;

  select coalesce(max(ordinal), -1) + 1 into cycle
    from public.bill_occurrences where bill_id = bill.id;
  if cycle = 0 then
    insert into public.bill_occurrences (user_id, bill_id, ordinal, due_on, amount_minor)
      values (bill.user_id, bill.id, 0, bill.anchor_due_on, bill.amount_minor)
      on conflict (bill_id, ordinal) do nothing;
    cycle := 1;
  end if;
  if bill.recurrence = 'none' or horizon < local_today then return; end if;

  if bill.recurrence = 'weekly' then
    first_current_cycle := greatest(0,
      (local_today - bill.anchor_due_on + 6) / 7);
  elsif bill.recurrence = 'monthly' then
    first_current_cycle := greatest(0,
      (extract(year from local_today)::integer -
       extract(year from bill.anchor_due_on)::integer) * 12 +
      extract(month from local_today)::integer -
      extract(month from bill.anchor_due_on)::integer);
  elsif bill.recurrence = 'yearly' then
    first_current_cycle := greatest(0,
      extract(year from local_today)::integer -
      extract(year from bill.anchor_due_on)::integer);
  else
    raise exception 'Invalid recurrence';
  end if;
  if app_private.bill_due_on(bill.anchor_due_on, bill.recurrence,
      first_current_cycle) < local_today then
    first_current_cycle := first_current_cycle + 1;
  end if;
  cycle := greatest(cycle, first_current_cycle);

  loop
    exit when cycle > 6000;
    due := app_private.bill_due_on(bill.anchor_due_on, bill.recurrence, cycle);
    exit when due > horizon or due > date '2100-12-31';
    insert into public.bill_occurrences (user_id, bill_id, ordinal, due_on, amount_minor)
      values (bill.user_id, bill.id, cycle, due, bill.amount_minor)
      on conflict (bill_id, ordinal) do nothing;
    cycle := cycle + 1;
  end loop;
end;
$$;
revoke all on function app_private.generate_bill_occurrences_from(uuid,date,date)
  from public, anon, authenticated, lifeops_bill_commands;

create or replace function app_private.generate_bill_occurrences(target_id uuid, horizon date)
returns void language plpgsql security definer set search_path = '' as $$
declare local_today date;
begin
  select (now() at time zone profile.timezone)::date into local_today
    from public.bills bill join public.profiles profile on profile.id = bill.user_id
    where bill.id = target_id;
  if not found then return; end if;
  perform app_private.generate_bill_occurrences_from(target_id, local_today, horizon);
end;
$$;
revoke all on function app_private.generate_bill_occurrences(uuid,date)
  from public, anon, authenticated, lifeops_bill_commands;
