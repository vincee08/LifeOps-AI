-- Historical Bills migrations remain applied. Remove only the retired Bills slice.
-- Stop new command sessions without dropping the cluster-level role: keeping the
-- role lets a clean replay run the historical CREATE ROLE guard deterministically.
alter role lifeops_bill_commands nologin;

-- Dependent views and private functions precede their source tables.
drop view public.active_bill_occurrence_read;
drop view public.archived_bill_occurrence_read;
drop view public.bill_occurrence_read;
drop view public.bill_read;

drop function app_private.bill_command(uuid, text, uuid, jsonb);
drop function app_private.generate_bill_occurrences(uuid, date);
drop function app_private.generate_bill_occurrences_from(uuid, date, date);
drop function app_private.bill_due_on(date, text, integer);

drop table app_private.bill_command_receipts;
drop table public.bill_occurrences;
drop table public.bills;

-- Table-owned RLS policies, indexes, constraints, and grants disappear with the
-- tables. Function/view grants disappear with those objects.
revoke usage on schema app_private from lifeops_bill_commands;
