# Architecture

## Current application

Expo Router presents protected Today, Tasks, Loans, and Workout tabs. Settings/Profile opens from the header; Auth screens are protected separately. The Workout screen is an informational placeholder. Bills, Money, and AI have no active routes.

The Tasks service owns task reads and writes. Today derives bounded, counted sections from Tasks and unpaid Loan installments under owner RLS and the profile timezone; there is no Today table. Core Tasks single-row writes use narrow authenticated column grants and owner RLS. The Loan service reads two security-invoker views that cast integer centavos to exact decimal strings. Loan detail independently fetches the earliest unpaid installment due on or after the profile-local date, paged overdue installments without a historical cutoff, and paged paid history; it renders history with a virtualized list. The summary view's `next_due_date` retains its meaning as the earliest unpaid due date, including overdue dates. Loan creation and edits use narrow authenticated grants; a trigger generates installments atomically. An owner-checked transactional database function serializes payment state changes with edits and archive. The client reuses a request UUID on create retries, detects stale edits with `updated_at`, and confirms changes only after persistence. Workouts will define its own commands later.

## Authentication and data access

Supabase Auth supplies the session. The profile trigger creates a profile for each Auth user. Mobile sessions are encrypted with a SecureStore-held key and AsyncStorage ciphertext. Client-readable rows use owner RLS; filtering in the app is not authorization. Server-only credentials never enter Expo public config.

## Notifications

The Task reminder service schedules local Expo requests for future 60/30/5-minute offsets. Loan reminders use the separate `loan-reminders-v2` Android channel and future 9:00 AM profile-local slots two days before, one day before, and on each unpaid due date. Android Loan channels omit the `sound` option to use the device default. If an existing v2 channel is silent from the earlier invalid custom-sound configuration, reconciliation creates `loan-reminders-v3` with system sound and carries over available channel preferences, then replaces only Loan requests. A disabled v2 channel is retained. Both services reconcile their own requests at authenticated startup/resume and after relevant changes. Settings controls separate per-account device preferences and permission flow. Sign-out cancels owned Task and Loan requests before clearing the session. Android Tasks uses `task-reminders-v2`.

A small retirement component runs at app startup, including signed-out sessions. It reads scheduled device requests, cancels only those matching the former Bills request identifier prefix, kind, or dedicated channel, deletes the verified Android `bill-reminders-v1` channel, then clears retired Bill preference keys. Android also removes the obsolete `task-reminders` channel only after pending requests stop referencing it. Authenticated Task reconciliation checks the actual trigger channel, reschedules valid old-channel requests onto `task-reminders-v2`, and runs before old-channel deletion. While signed out, old-channel Task requests are canceled; sign-in restores valid reminders from Tasks. If v2 is missing on an upgraded device, it is created with the existing system-sound configuration first. Cleanup retries on resume after failure and displays a warning. It never calls `cancelAllScheduledNotificationsAsync` or changes Task preferences, current-channel requests, or unrelated channels. No Bill tap route or scheduler remains.

## Database migration history

The three applied historical Bills migrations intentionally remain untouched. The new `20261030033936_remove_bills.sql` migration drops the Bills views, command and recurrence functions, receipt table, occurrence table, and definition table in dependency order. Table-owned indexes, triggers, policies, constraints, and grants disappear with their tables. The Bills-only role is changed to `NOLOGIN` and loses `app_private` schema usage; it remains as an inert cluster role to keep local replay reliable. Local catalog inspection found no shared object dependencies and one `postgres` membership, with no non-Bills application use in migrations. Profiles, Tasks, Auth infrastructure, and shared schemas remain.

Local replay therefore creates historical Bills objects, applies their historical fixes, removes them, then creates the simplified Loan schema with `20261101043249_create_loans.sql`. No migration is pushed automatically. The hosted Bills function and secret were removed in the previous milestone.

## Planned domains

The Workouts milestone will define planned sessions, progress, and private ProofMode capture. It may add source-linked items to Today when implemented.
