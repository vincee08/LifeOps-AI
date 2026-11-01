# Security

LifeOps AI protects Tasks, Loans, profile data, auth sessions, and future Workouts and private proof images. The final product does not provide lending, loan applications, credit scores, banking, payments, or AI services.

## Current controls

- Supabase Auth is the identity source. Never trust a client-supplied owner ID or editable user metadata. Every active user-owned table has RLS. Profiles allow owner reads and narrow display-name/timezone updates; Tasks allow owner CRUD with narrow column grants and server-stamped completion. Cross-user and anonymous access must fail.
- Mobile sessions are stored as AES-GCM ciphertext in AsyncStorage with the key held in SecureStore. Tokens and secrets do not belong in logs or public Expo configuration. Every `EXPO_PUBLIC_*` value is public.
- Tasks validate drafts before writes and rely on database constraints and owner RLS. Task create retries reuse an owner-scoped request UUID; edits use `updated_at` to detect stale state.
- Loans and installments both use owner RLS and an owner-matched foreign key. Authenticated clients cannot insert, delete, or directly change installments. `set_loan_installment_paid` verifies `auth.uid()`, locks the owner loan first, and performs an idempotent paid or correction transition in one transaction. Loan edits preserve paid dates and amounts; loans with paid history cannot be deleted. Security-invoker read views preserve RLS and cast centavos to decimal strings.
- Task and Loan reminders contain minimal owner, source, and schedule metadata. A tapped request is checked against the current signed-in owner and reloaded under RLS. Sign-out cancels owned Task and Loan reminders.
- Legacy Bills notification cleanup matches only the retired Bills identifier prefix, kind, or dedicated channel. It cancels those pending requests, deletes only the verified Bills Android channel, and removes only retired Bill preference keys. The old Task channel is deleted after pending requests are reconciled for the signed-in owner or canceled while signed out. Current Task requests, preferences, permissions, and unrelated channels remain intact. Failure is visible and retried on resume.

## Bills retirement

The historical Bills schema and Edge Function were deployed previously. The forward migration removed their active database objects and disabled login for the inert `lifeops_bill_commands` role. The hosted Bills function and secret were removed during the Bills retirement milestone. Historical migrations remain only for replay.

## Future trackers

For Workouts, bind each proof challenge to the correct owner, workout, and session; use short-lived single-use challenges, direct camera capture, private Storage, and owner-authorized access. Technical capture checks do not verify a pictured gesture. Add RLS, owner-matched relationships, deletion cleanup, and cross-user denial tests with each new table or private object.

Release requires review of migrations, grants, privileged functions, secret scanning, and physical-device notification behavior. See [TEST_PLAN.md](TEST_PLAN.md).
