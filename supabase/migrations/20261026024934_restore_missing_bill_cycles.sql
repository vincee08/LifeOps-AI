-- Repair gaps left by earlier recurrence reconciliation without changing stored cycles.
-- The command caller supplies the profile-local date plus its 90-day future horizon.
create or replace function app_private.generate_bill_occurrences_from(
  target_id uuid, local_today date, horizon date)
returns void language plpgsql security definer set search_path = '' as $$
declare bill public.bills%rowtype;
  cycle integer; highest_cycle integer; existing_count bigint; due date;
begin
  if local_today is null or horizon is null or horizon < local_today then
    raise exception 'Invalid bill horizon';
  end if;
  select * into bill from public.bills where id = target_id for update;
  if not found or bill.archived_at is not null then return; end if;

  select coalesce(max(ordinal), -1), count(*) into highest_cycle, existing_count
    from public.bill_occurrences where bill_id = bill.id;
  -- Unique, nonnegative ordinals are contiguous exactly when count = max + 1.
  -- If any older cycle is missing, revisit the anchor so gaps below max are repaired.
  cycle := case when existing_count = highest_cycle::bigint + 1
    then highest_cycle + 1 else 0 end;

  loop
    if bill.recurrence = 'none' and cycle > 0 then exit; end if;
    exit when cycle > 6000; -- Date bounds permit fewer than 6000 weekly cycles.
    due := app_private.bill_due_on(bill.anchor_due_on, bill.recurrence, cycle);
    if cycle > 0 and due > horizon then exit; end if;
    exit when due > date '2100-12-31';
    insert into public.bill_occurrences (user_id, bill_id, ordinal, due_on, amount_minor)
      values (bill.user_id, bill.id, cycle, due, bill.amount_minor)
      on conflict (bill_id, ordinal) do nothing;
    cycle := cycle + 1;
  end loop;
end;
$$;
revoke all on function app_private.generate_bill_occurrences_from(uuid,date,date)
  from public, anon, authenticated, lifeops_bill_commands;
