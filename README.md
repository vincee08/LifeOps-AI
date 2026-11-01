# LifeOps AI

LifeOps AI is a personal productivity app built around Today and Tasks. Its final core trackers are **Tasks, Loans, and Workouts**. Tasks and authentication/profile are implemented. Loans and Workouts are planned; the Workout tab currently explains its upcoming milestone. Bills has been permanently retired.

The current app has **Today, Tasks, and Workout** tabs, with Settings/Profile in the header. Today derives its three task sections from owner-scoped Tasks records. There is no Today table. Loan navigation and data will be added with the Loans milestone.

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
npx supabase start
npx supabase db reset --local --yes
npx supabase test db --local
npm run test:local-auth
npm run format:check
npm run lint
npm run typecheck
npm run test:ci
npx expo-doctor
```

The local reset intentionally replays the three historical Bills migrations, then `20261030033936_remove_bills.sql`. The final schema has Tasks and profiles, with no active Bills objects. Historical migration files must remain unchanged. Never run a linked reset for this verification.

Tasks supports title-only entry, optional details and timezone-aware deadlines, completion/reopen, filters, and confirmed deletion. Task reminders default to On per signed-in account on this device. Expo schedules future local notifications 60, 30, and 5 minutes before a task deadline. Editing or completing a task reconciles pending requests; sign-out cancels owned Task reminders. Settings has the Task reminders switch and notification permission guidance. Android uses the `task-reminders-v2` channel and its system sound. The OS may delay delivery.

On app startup, including signed-out sessions, the app cancels legacy scheduled Bills notifications identified by their old request ID, kind, or dedicated channel, deletes the old Android Bill channel, then removes retired device Bill reminder preferences. Android removes the old Task channel after signed-in reconciliation or signed-out cancellation clears its pending requests. The current Task channel, Task preferences, and unrelated channels remain intact. Cleanup failures show a warning and retry on resume. No Bills navigation, UI, service, or Edge Function source remains locally.

## Hosted Bills retirement

This repository does not push migrations, deploy an app, delete hosted functions, or unset secrets automatically. After reviewing and backing up any historical Bills data that must be retained, an operator should:

1. Verify the linked project and apply the reviewed removal migration with `npx supabase db push`.
2. Delete the old hosted Edge Function with `npx supabase functions delete bills`.
3. Unset the obsolete server-only secret with `npx supabase secrets unset BILLS_DATABASE_URL`.
4. Inspect `lifeops_bill_commands` for external grants or ownership. Local replay showed zero shared object dependencies and one PostgreSQL `postgres` membership; no non-Bills application object uses it in these migrations. The migration changes it to `NOLOGIN` and revokes its private-schema access. Keep this inert cluster role for reproducible replay; consider manual removal only after a hosted dependency audit.

The retired function's hosted URL may still exist until step 2. The removal migration makes its command unavailable and disables new role logins. Removing data is irreversible, so export anything required before applying it.

## Repository map

- `app/`: Expo Router routes and navigation.
- `src/features/`: screens and domain services.
- `src/features/notifications/`: one-time legacy Bills request cleanup.
- `__tests__/`: Jest regression tests.
- `supabase/migrations/`: immutable applied history plus new forward migrations.
- `supabase/tests/database/`: pgTAP authorization and schema tests.
- `docs/`: current product and engineering specifications.

Read [AGENTS.md](AGENTS.md) before changing code.
