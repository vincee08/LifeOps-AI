# LifeOps AI

LifeOps AI is a personal productivity app with **Tasks, Loans, and Workouts** as its three core trackers. Tasks and authentication/profile are implemented. The simplified Loans tracker is implemented locally, pending hosted deployment and physical Android verification. Workout is the next milestone. Bills has been permanently retired.

The current app has **Today, Tasks, Loans, and Workout** tabs, with Settings/Profile in the header. Today derives task sections and unpaid Loan dues from owner-scoped source records. There is no Today table.

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

The local reset intentionally replays the three historical Bills migrations, then `20261030033936_remove_bills.sql`, then `20261101043249_create_loans.sql`. The final schema has profiles, Tasks, Loans, and Loan installments, with no active Bills objects. Historical migration files remain unchanged. Never run a linked reset for this verification.

Tasks supports title-only entry, optional details and timezone-aware deadlines, completion/reopen, filters, and confirmed deletion. Task reminders default to On per signed-in account on this device. Expo schedules future local notifications 60, 30, and 5 minutes before a task deadline. Editing or completing a task reconciles pending requests; sign-out cancels owned Task reminders. Settings has the Task reminders switch and notification permission guidance. Android uses the `task-reminders-v2` channel and its system sound. The OS may delay delivery.

Loans stores a name, exact monthly PHP amount, first due date, installment count, and optional notes. Installments are generated once from the original date anchor; paid and remaining months and next due are derived. Users can mark paid, correct an accidental mark, edit while retaining paid history, and archive. A separate Loan reminders setting schedules local 9:00 AM notifications two and one calendar days before and on each unpaid due date. Android uses `loan-reminders-v2` with the system sound. Pending reminders are reconciled on startup, resume, account change, Loan changes, and Settings changes.

On app startup, including signed-out sessions, the app cancels legacy scheduled Bills notifications identified by their old request ID, kind, or dedicated channel, deletes the old Android Bill channel, then removes retired device Bill reminder preferences. Android removes the old Task channel after signed-in reconciliation or signed-out cancellation clears its pending requests. The current Task channel, Task preferences, and unrelated channels remain intact. Cleanup failures show a warning and retry on resume. No Bills navigation, UI, service, or Edge Function source remains locally.

## Hosted Loans rollout

The Bills retirement migration, hosted function removal, and secret removal are complete. This repository does not push the Loan migration or deploy an app automatically. After review, an operator should:

1. Verify the intended hosted project and check `npx supabase migration list --linked`. Confirm `20261030033936` is applied and only `20261101043249` is pending.
2. Preview with `npx supabase db push --linked --dry-run --skip-vault`, then apply the reviewed Loan migration with `npx supabase db push --linked --skip-vault`.
3. Check `npx supabase migration list --linked`, inspect owner RLS and grants on both Loan tables, and confirm no active Bills objects.
4. Run the physical Android procedure in [TEST_PLAN.md](docs/TEST_PLAN.md) against the intended Development project before a Production rollout.

No Loan Edge Function, new secret, or native dependency is required.

## Repository map

- `app/`: Expo Router routes and navigation.
- `src/features/`: screens and domain services.
- `src/features/notifications/`: one-time legacy Bills request cleanup.
- `__tests__/`: Jest regression tests.
- `supabase/migrations/`: immutable applied history plus new forward migrations.
- `supabase/tests/database/`: pgTAP authorization and schema tests.
- `docs/`: current product and engineering specifications.

Read [AGENTS.md](AGENTS.md) before changing code.
