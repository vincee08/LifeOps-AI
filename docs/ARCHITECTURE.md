# Architecture

## Current application

Expo Router presents protected Today, Tasks, and Workout tabs. Settings/Profile opens from the header; Auth screens are protected separately. The Workout screen is an informational placeholder. Loans is planned and has no route or data service yet. Bills, Money, and AI have no active routes.

The Tasks service owns task reads and writes. Today derives three bounded, counted sections from Tasks under owner RLS and the profile timezone; there is no Today table. Tasks is the source of truth. Core Tasks single-row writes use narrow authenticated column grants and owner RLS (decision D13). The client reuses an owner-scoped request UUID on create retries, detects stale edits with `updated_at`, and confirms completion only after persistence. Future dependent Loans and Workouts commands will use authenticated backend services, transactional database functions, and explicit owner checks as needed.

## Authentication and data access

Supabase Auth supplies the session. The profile trigger creates a profile for each Auth user. Mobile sessions are encrypted with a SecureStore-held key and AsyncStorage ciphertext. Client-readable rows use owner RLS; filtering in the app is not authorization. Server-only credentials never enter Expo public config.

## Notifications

The Task reminder service schedules local Expo requests for future 60/30/5-minute offsets. It reconciles a bounded set at authenticated startup/resume and after task changes. Settings controls the per-account device preference and permission flow. Sign-out cancels owned Task requests before clearing the session. Android uses `task-reminders-v2`.

A small retirement component runs at app startup, including signed-out sessions. It reads scheduled device requests, cancels only those matching the former Bills request identifier prefix, kind, or dedicated channel, deletes the verified Android `bill-reminders-v1` channel, then clears retired Bill preference keys. Android also removes the obsolete `task-reminders` channel only after pending requests stop referencing it. Authenticated Task reconciliation checks the actual trigger channel, reschedules valid old-channel requests onto `task-reminders-v2`, and runs before old-channel deletion. While signed out, old-channel Task requests are canceled; sign-in restores valid reminders from Tasks. If v2 is missing on an upgraded device, it is created with the existing system-sound configuration first. Cleanup retries on resume after failure and displays a warning. It never calls `cancelAllScheduledNotificationsAsync` or changes Task preferences, current-channel requests, or unrelated channels. No Bill tap route or scheduler remains.

## Database migration history

The three applied historical Bills migrations intentionally remain untouched. The new `20261030033936_remove_bills.sql` migration drops the Bills views, command and recurrence functions, receipt table, occurrence table, and definition table in dependency order. Table-owned indexes, triggers, policies, constraints, and grants disappear with their tables. The Bills-only role is changed to `NOLOGIN` and loses `app_private` schema usage; it remains as an inert cluster role to keep local replay reliable. Local catalog inspection found no shared object dependencies and one `postgres` membership, with no non-Bills application use in migrations. Profiles, Tasks, Auth infrastructure, and shared schemas remain.

Local replay therefore creates historical Bills objects, applies their historical fixes, then removes them. No migration is pushed automatically. The hosted Bills function and secret require explicit operator cleanup after the reviewed migration is applied.

## Planned domains

The Loans milestone will define deterministic integer-centavo balance rules, outside-payment records, due reminders, and owner-checked commands. The Workouts milestone will define planned sessions, progress, and private ProofMode capture. Both may add source-linked items to Today through their own records. Their implementation is outside this change.
