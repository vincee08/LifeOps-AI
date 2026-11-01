# Test plan

## Current app regression

Run formatting, lint, strict TypeScript, the full Jest suite, a clean local Supabase reset, pgTAP database tests, Expo Doctor, `git diff --check`, and a secret scan. Review all changed files and confirm ByteQuest is untouched. Report unavailable checks accurately.

Jest must verify:

- Today, Tasks, and Workout navigation plus Settings/Profile access; no Bills, Money, or AI tab or Bills UI.
- Today uses Tasks only, with correct local-day boundaries, counts, actions, partial failures, and no Bills query or source link.
- Settings has Task reminders and no Bill reminders control. Profile load, edit, invalid timezone feedback, and sign-out remain intact.
- Tasks create/edit/complete/reopen/delete, retries, stale edits, pagination, timezone deadlines, errors, and reminders remain intact.
- Legacy Bills cleanup cancels only requests identified by the old Bills request prefix, kind, or channel, deletes `bill-reminders-v1`, preserves Task and unrelated requests, removes retired preferences only after cancellation and channel deletion, and retries after failure. Android Task cleanup reconciles old trigger-channel requests before deleting `task-reminders`, preserves `task-reminders-v2` and valid current reminders, and leaves permission and Task preferences unchanged. Repeated startup must not recreate or duplicate channels or reminders.
- Auth restoration, protected routes, verification/recovery flows, and owner profile behavior remain intact.

## Database and security

A clean local `npx supabase db reset --local --yes` must replay all three historical Bills migrations before `20261030033936_remove_bills.sql`. The final schema must have no active Bills tables, receipt table, views, private functions, indexes, policies, or grants. The retired role must be `NOLOGIN` without private-schema usage. Profiles and Tasks remain, with their owner RLS and grant tests passing. Run `npx supabase test db --local`; its pgTAP suite covers A/B/anonymous isolation and task constraints. Historical migration files must have no diff.

Do not run a linked database reset or hosted push during repository verification. Before a hosted rollout, back up any Bills data requiring retention and verify the linked project and target schema.

## Physical Android verification

Install an Expo SDK 58 development build with `expo-notifications` over the existing Android app, connect it to the intended Development Supabase project, and sign in. Before upgrading, record Android Settings notification channels and pending Task reminders. After startup, confirm Bill requests and the `bill-reminders-v1` channel disappear, the old `task-reminders` channel disappears after Task reconciliation, and exactly one Task Reminders channel (`task-reminders-v2`) remains with the system-default sound. Check that valid Task reminders still fire once at their intended times. Restart twice and check for channel or reminder duplicates. Repeat while signed out and after switching accounts; permissions and each account's Task reminder preference must stay unchanged. If cleanup fails, confirm the warning appears and retry on resume. Check Today has Tasks only; the tabs are Today, Tasks, Workout; Settings shows Task reminders only. Test Task permission Allow/Deny, background and foreground delivery, task edit/completion/deletion, notification tap to the task, and sign-out cancellation. Check sign-in, profile edit, recovery link, and protected-route behavior. Android may delay local notification delivery.

## Planned milestones

Loans and Workouts get separate domain tests when implemented. Loans needs integer-centavo boundaries, payment/adjustment idempotency and concurrency, owner isolation, and estimate assumptions. Workouts needs plan/session state tests, private proof access, challenge expiry/reuse, camera-only capture, and deletion cleanup. Neither milestone is implemented here.
