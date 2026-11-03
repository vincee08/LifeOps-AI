# Test plan

## Current app regression

Run formatting, lint, strict TypeScript, the full Jest suite, a clean local Supabase reset, pgTAP database tests, Expo Doctor, `git diff --check`, and a secret scan. Review all changed files and confirm ByteQuest is untouched. Report unavailable checks accurately.

Jest must verify:

- Today, Tasks, Loans, and Workout navigation plus Settings/Profile access; no Bills, Money, or AI tab or Bills UI.
- Workout quick log, one-time plan, exercise selection/creation/edit/archive, all three measurement types, completion on a different date, corrections, deletion, paginated history, four-full-week activity, and same-type exercise progress. Verify duplicate submissions, stale edits, invalid fields, and saved history snapshots after library edits.
- Today uses Tasks, unpaid Loan installments, and planned/completed Workout sessions, with correct local-day boundaries, counts, actions, independent partial failures, and no Bills query or source link.
- Settings has separate Task and Loan reminders and no Bill reminders control. Profile load, edit, invalid timezone feedback, and sign-out remain intact.
- Tasks create/edit/complete/reopen/delete, retries, stale edits, pagination, timezone deadlines, errors, and reminders remain intact.
- Legacy Bills cleanup cancels only requests identified by the old Bills request prefix, kind, or channel, deletes `bill-reminders-v1`, preserves Task and unrelated requests, removes retired preferences only after cancellation and channel deletion, and retries after failure. Android Task cleanup reconciles old trigger-channel requests before deleting `task-reminders`, preserves `task-reminders-v2` and valid current reminders, and leaves permission and Task preferences unchanged. Repeated startup must not recreate or duplicate channels or reminders.
- Auth restoration, protected routes, verification/recovery flows, and owner profile behavior remain intact.
- Loans creation, exact centavos, month-end and leap-year recurrence, derived counts and next due, selected-installment paid and correction, paid off, edit and archive. Loan detail shows one current/future Next Payment, every past unpaid installment through paged Overdue Payments, and separate paged Paid History. Test overdue-only loans, profile-local boundaries, and the Loan reminder lifecycle without duplicate or Task reminder changes. Test a silent v2 Android channel migration and healthy v2 preservation.

## Database and security

A clean local `npx supabase db reset --local --yes` must replay all three historical Bills migrations before `20261030033936_remove_bills.sql`, then apply `20261101043249_create_loans.sql` and `20261102102736_create_workouts.sql`. The final schema must have no active Bills objects. Profiles, Tasks, Loans, and Workouts remain, with owner RLS and grant tests passing. Run `npx supabase test db --local`; pgTAP covers Workout transactions, measurements, cross-user denial, retries, stale edits, history snapshots, and existing Loan/Task/Bills-retirement behavior. Historical migration files must have no diff.

Do not run a linked database reset or hosted push during repository verification. Verify the linked project and target schema before hosted rollout.

## Physical Android verification

Install the existing Expo SDK 58 development build, connect it to the intended Development Supabase project after the reviewed Loan migration, and sign in. Confirm Today, Tasks, Loans, Workout tabs and no Bills, Money, or AI route. Create a 12-month Loan due November 15, 2026 and a January 31 month-end Loan; verify installment counts, February clamp, March return, amount display, paid/remaining counts, next due, correction, edit preservation, archive, and Today due/overdue items. Create a 36-month Loan and confirm only one Next Payment card, no future schedule cards, and separate overdue and paid sections. Turn Loan reminders on and verify `loan-reminders-v2` on a fresh install or `loan-reminders-v3` on a device whose old v2 channel is silent, with system sound and future 9:00 AM reminders at 2/1/0 calendar-day offsets. Check payment, correction, edit, archive, restart, resume, timezone change, account switch, permission denial, and sign-out reconciliation. Ensure valid Task requests and `task-reminders-v2` remain, and retired Bills and Task channels are not recreated. Check Task CRUD, sign-in, profile edit, recovery link, and protected-route behavior. Android may delay local notification delivery.

## Planned milestones

Photo Proof Phase 2 needs private proof access, challenge expiry/reuse, camera-only capture, file limits, upload retry, and deletion/account cleanup tests after Phase 1 rollout and physical verification.

## Workout Phase 1 physical Android verification

Use the reviewed Development project after **only** the Workout migration is applied. Install the existing Expo SDK 58 development build; no native rebuild is needed for Phase 1. Sign in as account A. Log a completed workout with repetitions, weighted repetitions in kg, and duration in minutes/seconds; verify saved values and history. Create a plan for tomorrow, then complete it with today's actual date; verify both dates persist. Create a plan for yesterday and verify it remains a past plan until rescheduled, completed, or deleted. Edit a completed record, delete another with confirmation, and check history/progress recalculate. Edit and archive an exercise and verify older completed entries retain their name/type. Create more than 20 completed sessions and verify history paging, stable ordering, and no duplicate entries after rapid taps or a network retry. Check Today planned/completed sections at profile-local midnight and after timezone change. Check offline/failed saves, background/resume, sign-out/account B isolation, narrow Android keyboard layouts, TalkBack labels, and light/dark themes. Verify Task and Loan flows and reminders still work and no Workout channel or Bills UI appears. Do not test Photo Proof in this phase.
