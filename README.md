# LifeOps AI

LifeOps AI is a personal productivity app with **Tasks, Loans, and Workouts** as its three core trackers. Tasks, Loans, and authentication/profile are deployed. Workout Tracker Phase 1 is implemented locally, pending review, hosted migration, and physical Android verification. Bills has been permanently retired.

The current app has **Today, Tasks, Loans, and Workout** tabs, with Settings/Profile in the header. Today derives task sections, unpaid Loan dues, and Workout sessions from owner-scoped source records. There is no Today table.

## Setup

Use a Node.js version supported by `package.json`, npm, and an Expo SDK 58 development build for Android. Docker Desktop is needed for local Supabase and database tests.

```powershell
npm ci
npm run start
```

Copy `.env.example` to ignored `.env.local`. Set only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the intended environment. Every `EXPO_PUBLIC_*` value is visible in the app bundle. Never put a secret key, database password, or private URL there. The app shows a configuration error until the public Supabase values are set.

The mobile session adapter stores an encryption key in SecureStore and AES-GCM ciphertext in AsyncStorage. Web preview sessions stay in memory. Use distinct hosted Development and Production Supabase projects. A physical phone needs a LAN-reachable local API URL or the hosted Development project.

For a physical Android development build:

```powershell
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform android --profile development
npx expo start --dev-client
```

Install the resulting APK on the phone, keep it connected to Metro, and rebuild after native dependency or app configuration changes. Test email verification and password recovery links in the installed build. The app scheme is `lifeopsai://auth/callback`; configure it in the intended Supabase project's Auth redirect allowlist. For local Auth email, open Mailpit at the URL reported by `npx supabase status`.

## Local database and checks

```powershell
npx supabase stack start
npx supabase db reset --local --yes
npx supabase test db --local
npm run test:local-auth
npm run format:check
npm run lint
npm run typecheck
npm run test:ci
npx expo-doctor
```

The local reset intentionally replays the three historical Bills migrations, then `20261030033936_remove_bills.sql`, `20261101043249_create_loans.sql`, and `20261102102736_create_workouts.sql`. The final schema has profiles, Tasks, Loans, Loan installments, and Workouts, with no active Bills objects. Historical migration files remain unchanged. Never run a linked reset for this verification.

Tasks supports title-only entry, optional details and timezone-aware deadlines, completion/reopen, filters, and confirmed deletion. Task reminders default to On per signed-in account on this device. Expo schedules future local notifications 60, 30, and 5 minutes before a task deadline. Editing or completing a task reconciles pending requests; sign-out cancels owned Task reminders. Settings has the Task reminders switch and notification permission guidance. Android uses the `task-reminders-v2` channel and its system sound. The OS may delay delivery.

Loans stores a name, exact monthly PHP amount, first due date, installment count, and optional notes. Installments are generated once from the original date anchor; paid and remaining months and next due are derived. Users can mark paid, correct an accidental mark, edit while retaining paid history, and archive. A separate Loan reminders setting schedules local 9:00 AM notifications two and one calendar days before and on each unpaid due date. Android uses `loan-reminders-v2` with the system sound. Pending reminders are reconciled on startup, resume, account change, Loan changes, and Settings changes.

On app startup, including signed-out sessions, the app cancels legacy scheduled Bills notifications identified by their old request ID, kind, or dedicated channel, deletes the old Android Bill channel, then removes retired device Bill reminder preferences. Android removes the old Task channel after signed-in reconciliation or signed-out cancellation clears its pending requests. The current Task channel, Task preferences, and unrelated channels remain intact. Cleanup failures show a warning and retry on resume. No Bills navigation, UI, service, or Edge Function source remains locally.

## Workout Tracker Phase 1

Phase 1 supports quick completed logs, one-time planned sessions without upfront measurements, a personal exercise library, repetitions, weighted repetitions in kg, durations in seconds, completion, corrections, deletion, paginated history and older plans, four-full-week activity, exercise records, and Today sections. Plans do not send notifications. Photo Proof is a required separate Phase 2 after core rollout and physical testing. Phase 2 will add direct in-app camera capture, short-lived single-use owner/session challenges, private Storage, owner viewing/deletion, upload retry and cleanup, and a new native development build. “Proof captured” will mean technical capture/upload checks only.

The linked Development migration list was read on 2026-11-02 and confirmed `20261101043249_create_loans.sql` is applied. Do not push it again. This repository does not push the new Workout migration or deploy an app automatically. After review, an operator should:

1. Verify the intended hosted project and check `npx supabase migration list --linked`. Confirm `20261101043249` is applied and only `20261102102736` is pending.
2. Preview with `npx supabase db push --linked --dry-run --skip-vault`, then apply only the reviewed Workout migration with `npx supabase db push --linked --skip-vault`.
3. Recheck the migration list, inspect owner RLS and grants on all three Workout tables, and confirm no active Bills objects.
4. Run the physical Android procedure in [TEST_PLAN.md](docs/TEST_PLAN.md) against Development before considering Production.

Phase 1 needs no Edge Function, new secret, native dependency, or new EAS development build.

## Repository map

- `app/`: Expo Router routes and navigation.
- `src/features/`: screens and domain services.
- `src/features/notifications/`: one-time legacy Bills request cleanup.
- `__tests__/`: Jest regression tests.
- `supabase/migrations/`: immutable applied history plus new forward migrations.
- `supabase/tests/database/`: pgTAP authorization and schema tests.
- `docs/`: current product and engineering specifications.

Read [AGENTS.md](AGENTS.md) before changing code.
