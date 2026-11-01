# Security

LifeOps AI protects Tasks, profile data, future Loans and Workouts, auth sessions, and future private proof images. The final product does not provide lending, loan applications, credit scores, banking, payments, or AI services.

## Current controls

- Supabase Auth is the identity source. Never trust a client-supplied owner ID or editable user metadata. Every active user-owned table has RLS. Profiles allow owner reads and narrow display-name/timezone updates; Tasks allow owner CRUD with narrow column grants and server-stamped completion. Cross-user and anonymous access must fail.
- Mobile sessions are stored as AES-GCM ciphertext in AsyncStorage with the key held in SecureStore. Tokens and secrets do not belong in logs or public Expo configuration. Every `EXPO_PUBLIC_*` value is public.
- Tasks validate drafts before writes and rely on database constraints and owner RLS. Task create retries reuse an owner-scoped request UUID; edits use `updated_at` to detect stale state.
- Task reminders contain minimal owner, task, and schedule metadata. A tapped request is checked against the current signed-in owner and reloaded under RLS. Sign-out cancels owned Task reminders.
- Legacy Bills notification cleanup matches only the retired Bills identifier prefix, kind, or dedicated channel. It cancels those pending requests, deletes only the verified Bills Android channel, and removes only retired Bill preference keys. The old Task channel is deleted after pending requests are reconciled for the signed-in owner or canceled while signed out. Current Task requests, preferences, permissions, and unrelated channels remain intact. Failure is visible and retried on resume.

## Bills retirement

The historical Bills schema and Edge Function were deployed previously. The forward migration removes their tables, views, private command functions, policies, indexes, and grants; it disables login for `lifeops_bill_commands` and removes that role's `app_private` usage. The role itself remains inert for reliable local migration replay. The hosted function and `BILLS_DATABASE_URL` secret require separate operator cleanup. Never expose the secret value. Back up any hosted Bills data that must be retained before applying the destructive removal migration.

## Future trackers

For Loans, store PHP amounts as integer centavos, check ownership at every boundary, use transactions and idempotency for dependent writes, and never interpret an outside payment record as money movement by the app. For Workouts, bind each proof challenge to the correct owner, workout, and session; use short-lived single-use challenges, direct camera capture, private Storage, and owner-authorized access. Technical capture checks do not verify a pictured gesture. Add RLS, owner-matched relationships, deletion cleanup, and cross-user denial tests with each new table or private object.

Release requires review of migrations, grants, privileged functions, secret scanning, and physical-device notification behavior. See [TEST_PLAN.md](TEST_PLAN.md).
