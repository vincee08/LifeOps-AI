# Database design

## Active schema

After all migrations, the active user-owned domain tables are `public.profiles`, `public.tasks`, `public.loans`, `public.loan_installments`, `public.exercises`, `public.workout_sessions`, and `public.workout_session_exercises`. `profiles.id` is the Auth user ID. Tasks has `user_id uuid`, server UUID ID, owner-scoped `client_request_id`, title, optional description and due instant, category, priority, completion timestamp, and timestamps. Loan rows hold a name, monthly PHP amount as integer centavos, first due date, term, notes, and archive timestamp. A trigger creates exactly one installment per month from the original date anchor. Installments have owner-matched foreign keys, unique `(loan_id, installment_number)`, due date, historical amount, and nullable `paid_at`. Counts, next due, and status are derived, never stored as editable counters. Today queries Tasks, unpaid Loan installments, and Workout sessions; there is no Today table.

Both Loan tables use owner RLS and narrow grants. Clients can read Loan views that cast centavos to decimal strings; they cannot insert, delete, or directly update installments. `public.set_loan_installment_paid(uuid, boolean)` checks Auth identity, locks the owner loan, and changes paid state transactionally and idempotently. The shared `app_private` schema holds the Loan schedule and guard triggers. The final schema contains no Bills table, view, function, policy, index, grant, trigger, or Bill-specific enum. The old Bills role remains inert: `NOLOGIN`, no private-schema usage, and no command function.

## Migration sequence

1. `20261022110752_create_profiles.sql`: Auth-linked profiles and their access controls.
2. `20261023024613_create_tasks.sql`: Tasks and their access controls.
3. `20261025105232_create_bills.sql`: historical Bills schema.
4. `20261025133030_skip_unobserved_bill_cycles.sql`: historical recurrence change.
5. `20261026024934_restore_missing_bill_cycles.sql`: historical recurrence repair.
6. `20261030033936_remove_bills.sql`: forward retirement of all active Bills database objects.
7. `20261101043249_create_loans.sql`: simplified Loan and installment tables, RLS, schedule triggers, read views, and payment-state function.
8. `20261102102736_create_workouts.sql`: exercise library, sessions, entries, owner RLS, transactional commands, progress read view, and full-week activity function.

The first six migration files are historical and remain unchanged. A clean local reset applies them in order, removes active Bills objects, then creates Loans and Workouts. Bills removal and Loans are applied in the linked Development project; Workouts is local only as of 2026-11-02.

## Workout Tracker Phase 1

`exercises` holds owner-created definitions with an owner-scoped request UUID and an archive timestamp. `workout_sessions` holds a title, original planned date, actual performed date, server completion timestamp, and request/version metadata. `workout_session_exercises` holds one uniform measurement per exercise per session plus immutable name/type snapshots. Both child foreign keys match the owner. All three tables have owner RLS. Clients read them under narrow grants; only exercises have direct authenticated insert/update. `save_workout_session` and `delete_workout_session` are restricted, owner-checked transaction commands. The `workout_progress_read` security-invoker view and `workout_week_activity` security-invoker function derive factual progress. Completed history and exercise progress are bounded/paginated; no editable summary counters or Today table exist.

## Photo Proof Phase 2

After Phase 1 rollout and physical verification, add owner-private proof records, challenge state, Storage policies, and object cleanup. A deleted proof, workout, or account must not leave private objects behind. Phase 1 adds no proof schema or bucket.
