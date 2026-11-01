# Test plan

## Current app regression

Run formatting, lint, strict TypeScript, the full Jest suite, a clean local Supabase reset, pgTAP database tests, Expo Doctor, `git diff --check`, and a secret scan. Review all changed files and confirm ByteQuest is untouched. Report unavailable checks accurately.

Jest must verify:

- Today, Tasks, Loans, and Workout navigation plus Settings/Profile access; no Bills, Money, or AI tab or Bills UI.
- Today uses Tasks and unpaid Loan installments, with correct local-day boundaries, counts, actions, partial failures, and no Bills query or source link.
- Settings has separate Task and Loan reminders and no Bill reminders control. Profile load, edit, invalid timezone feedback, and sign-out remain intact.
- Tasks create/edit/complete/reopen/delete, retries, stale edits, pagination, timezone deadlines, errors, and reminders remain intact.
- Legacy Bills cleanup cancels only requests identified by the old Bills request prefix, kind, or channel, deletes `bill-reminders-v1`, preserves Task and unrelated requests, removes retired preferences only after cancellation and channel deletion, and retries after failure. Android Task cleanup reconciles old trigger-channel requests before deleting `task-reminders`, preserves `task-reminders-v2` and valid current reminders, and leaves permission and Task preferences unchanged. Repeated startup must not recreate or duplicate channels or reminders.
- Auth restoration, protected routes, verification/recovery flows, and owner profile behavior remain intact.
- Loans creation, exact centavos, month-end and leap-year recurrence, derived counts and next due, selected-installment paid and correction, paid off, edit and archive. Loan detail shows one current/future Next Payment, every past unpaid installment through paged Overdue Payments, and separate paged Paid History. Test overdue-only loans, profile-local boundaries, and the Loan reminder lifecycle without duplicate or Task reminder changes. Test a silent v2 Android channel migration and healthy v2 preservation.

## Database and security

A clean local `npx supabase db reset --local --yes` must replay all three historical Bills migrations before `20261030033936_remove_bills.sql`, then apply `20261101043249_create_loans.sql`. The final schema must have no active Bills tables, receipt table, views, private functions, indexes, policies, or grants. Profiles, Tasks, and Loans remain, with owner RLS and grant tests passing. Run `npx supabase test db --local`; pgTAP covers Loan generation, correction, editing, archive, cross-user denial, and no Bills objects. Historical migration files must have no diff.

Do not run a linked database reset or hosted push during repository verification. Verify the linked project and target schema before hosted rollout.

## Physical Android verification

Install the existing Expo SDK 58 development build, connect it to the intended Development Supabase project after the reviewed Loan migration, and sign in. Confirm Today, Tasks, Loans, Workout tabs and no Bills, Money, or AI route. Create a 12-month Loan due November 15, 2026 and a January 31 month-end Loan; verify installment counts, February clamp, March return, amount display, paid/remaining counts, next due, correction, edit preservation, archive, and Today due/overdue items. Create a 36-month Loan and confirm only one Next Payment card, no future schedule cards, and separate overdue and paid sections. Turn Loan reminders on and verify `loan-reminders-v2` on a fresh install or `loan-reminders-v3` on a device whose old v2 channel is silent, with system sound and future 9:00 AM reminders at 2/1/0 calendar-day offsets. Check payment, correction, edit, archive, restart, resume, timezone change, account switch, permission denial, and sign-out reconciliation. Ensure valid Task requests and `task-reminders-v2` remain, and retired Bills and Task channels are not recreated. Check Task CRUD, sign-in, profile edit, recovery link, and protected-route behavior. Android may delay local notification delivery.

## Planned milestones

Workouts needs plan/session state tests, private proof access, challenge expiry/reuse, camera-only capture, and deletion cleanup when implemented.
