# Database design

## Active schema

After all migrations, the active user-owned domain tables are `public.profiles`, `public.tasks`, `public.loans`, and `public.loan_installments`. `profiles.id` is the Auth user ID. Tasks has `user_id uuid`, server UUID ID, owner-scoped `client_request_id`, title, optional description and due instant, category, priority, completion timestamp, and timestamps. Loan rows hold a name, monthly PHP amount as integer centavos, first due date, term, notes, and archive timestamp. A trigger creates exactly one installment per month from the original date anchor. Installments have owner-matched foreign keys, unique `(loan_id, installment_number)`, due date, historical amount, and nullable `paid_at`. Counts, next due, and status are derived, never stored as editable counters. Today queries Tasks and unpaid Loan installments; there is no Today table.

Both Loan tables use owner RLS and narrow grants. Clients can read Loan views that cast centavos to decimal strings; they cannot insert, delete, or directly update installments. `public.set_loan_installment_paid(uuid, boolean)` checks Auth identity, locks the owner loan, and changes paid state transactionally and idempotently. The shared `app_private` schema holds the Loan schedule and guard triggers. The final schema contains no Bills table, view, function, policy, index, grant, trigger, or Bill-specific enum. The old Bills role remains inert: `NOLOGIN`, no private-schema usage, and no command function.

## Migration sequence

1. `20261022110752_create_profiles.sql`: Auth-linked profiles and their access controls.
2. `20261023024613_create_tasks.sql`: Tasks and their access controls.
3. `20261025105232_create_bills.sql`: historical Bills schema.
4. `20261025133030_skip_unobserved_bill_cycles.sql`: historical recurrence change.
5. `20261026024934_restore_missing_bill_cycles.sql`: historical recurrence repair.
6. `20261030033936_remove_bills.sql`: forward retirement of all active Bills database objects.
7. `20261101043249_create_loans.sql`: simplified Loan and installment tables, RLS, schedule triggers, read views, and payment-state function.

The first six migration files are historical and remain unchanged. A clean local reset applies them in order, removes active Bills objects, then creates Loans. The Bills removal has already been deployed to the hosted project; the Loan migration has not.

## Planned Workouts

Workouts has no tables in the current schema. At implementation, use owner-matched foreign keys, RLS on every user-owned table, least-privilege grants, and cross-user denial tests. Workout proof objects will be private and removed when their proof, workout, or account is permanently deleted. Add indexes for observed access patterns and paginate growing histories.
