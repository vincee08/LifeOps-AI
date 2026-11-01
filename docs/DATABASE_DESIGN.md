# Database design

## Active schema

After all migrations, the active user-owned domain tables are `public.profiles` and `public.tasks`. `profiles.id` is the Auth user ID. Tasks has `user_id uuid`, server UUID ID, owner-scoped `client_request_id`, title, optional description and due instant, category, priority, completion timestamp, and timestamps. RLS and narrow grants restrict each user to their own rows. Task completion is server stamped. Indexes serve active, overdue, and completed lists. Today queries Tasks; there is no Today table or duplicate agenda record.

The database retains the shared `app_private` schema and profile/task functions and types. The final schema contains no Bills table, view, function, policy, index, grant, trigger, or Bill-specific enum. The old Bills role remains inert: `NOLOGIN`, no private-schema usage, and no command function. It is kept out of the forward migration's DROP ROLE operations so historical migration replay stays deterministic.

## Migration sequence

1. `20261022110752_create_profiles.sql`: Auth-linked profiles and their access controls.
2. `20261023024613_create_tasks.sql`: Tasks and their access controls.
3. `20261025105232_create_bills.sql`: historical Bills schema.
4. `20261025133030_skip_unobserved_bill_cycles.sql`: historical recurrence change.
5. `20261026024934_restore_missing_bill_cycles.sql`: historical recurrence repair.
6. `20261030033936_remove_bills.sql`: forward retirement of all active Bills database objects.

The first five migration files are historical and remain unchanged. A clean local reset must apply them in order and end without Bills objects. The removal migration deletes existing Bills rows; back up hosted data before applying it if retention is required.

## Planned Loans and Workouts

These domains have no tables in the current schema. At implementation, use owner-matched foreign keys, RLS on every user-owned table, least-privilege grants, and cross-user denial tests. Store PHP amounts as integer centavos and send them as base-10 integer strings. The Loans tracker will record a current balance, outside payments, and explicit adjustments without automatic interest. Workout proof objects will be private and removed when their proof, workout, or account is permanently deleted. Add indexes for observed access patterns and paginate growing histories.
