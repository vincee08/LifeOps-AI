# LifeOps AI

LifeOps AI is a personal productivity and life-management app centered on **“What do I need to do today?”** Today and Tasks lead the product. Money, Workout, and optional AI support them. Bills and existing debts are tracking tools for obligations paid outside the app; LifeOps AI does not lend, move money, or process payments.

**Current state:** email/password authentication, protected routes, an editable profile, the five-tab shell, core Tasks CRUD, local task deadline reminders, a Tasks-and-Bills-derived Today screen, and personal Bills in Money with local reminders. Workout and AI remain placeholders; Debts, Expenses, and Budgets are unavailable.

## Prerequisites

- Node.js **22.13+ within the 22.x line**, or a newer Node line supported by the installed Expo SDK, and npm. See `package.json` for the exact engine range.
- For Android, an emulator or a compatible device/development build. iOS simulator builds require macOS and Xcode.
- Docker Desktop with its Linux engine running is required only for the local Supabase stack and local database tests. The CLI can initialize this repository without Docker.

## Install and run

From this repository root:

```powershell
npm ci
npm run start
```

Use the Android development build steps below for a physical phone. `npm run ios` requires macOS; `npm run web` opens a browser preview. Expo can start without Supabase credentials, but authentication stays on a configuration error screen until they are set.

## Android development build (Windows)

This Expo SDK 58 project uses an installable development build on a physical Android phone. From the repository root:

```powershell
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform android --profile development
```

An Expo account is required for EAS cloud builds. Skip `login` if `npx eas-cli@latest whoami` shows the intended account. `init` creates or links the EAS project and adds its public project ID to `app.json`; choose the intended Expo account if prompted. On the first build, allow EAS to generate an Android signing keystore when prompted. The `development` profile produces an APK for a physical device; `preview` also produces an internally distributed APK, while `production` uses the EAS store defaults. EAS CLI runs through `npx`, so no global installation is needed.

When the build finishes, open its EAS build link on the phone, download the APK, and allow Android to install it. Then start Metro from this project on Windows:

```powershell
npx expo start --dev-client
```

Keep the phone and computer on the same local network and open the development build to scan Metro's QR code. If the network blocks that connection, use Expo's tunnel option for the Metro command. JavaScript changes load through Metro; rebuild the APK after native dependency or native app configuration changes. Expo Go is not used for this SDK 58 phone workflow.

## Environment

Copy `.env.example` to an ignored `.env.local` when connecting to Supabase. `EXPO_PUBLIC_APP_ENV` accepts `development`, `staging`, or `production`; development is the default. Fill in `EXPO_PUBLIC_SUPABASE_URL` with the project API URL and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with its `sb_publishable_...` key. The client checks both values when first used and reports missing or invalid configuration without printing their contents. The placeholder shell can run before they are set.

**Every `EXPO_PUBLIC_*` value is visible in the mobile bundle.** Only the publishable key belongs there. Never put a Supabase secret/service-role key, database password, AI key, or other private credential in `.env.local` with an `EXPO_PUBLIC_` prefix, app config, or mobile source. Local `.env*` files are Git-ignored; `.env.example` contains empty placeholders.

The single client is in `src/lib/supabase.ts`. On iOS and Android, the session adapter stores a small AES key in Expo SecureStore and the AES-GCM encrypted session in AsyncStorage, so a large session does not hit SecureStore's value limit. Token refresh follows app foreground/background state. If the secure key is lost during device restore, the unreadable ciphertext is discarded and the user must sign in again. The web preview keeps sessions in memory and does not persist them. Auth requires a configured Supabase project; the app shows a configuration error when the two public values are missing.

## Supabase development setup

Use a **development Supabase project distinct from production**. Create separate development and production projects in the Supabase dashboard. For a hosted development build, put only the development project's URL and publishable key in your ignored `.env.local` or in the EAS **development** environment. Put the production project's URL and publishable key only in the EAS **production** environment. Configure preview with its own project if used; never let development or preview builds point at the production database. `eas.json` explicitly maps each build profile to its EAS environment and sets `EXPO_PUBLIC_APP_ENV`. Check the selected EAS environment before each build or update. No hosted project ID or URL is stored in source.

For a local development database, start Docker Desktop's Linux engine, then run:

```powershell
docker info
npx supabase start
npx supabase status
```

Copy the **Project URL** and **Publishable** key from `npx supabase status` into ignored `.env.local`; do not paste terminal status output into logs or issue reports because it also contains secrets. Never copy the Secret key or database URL into an `EXPO_PUBLIC_` variable. A physical phone cannot reach `127.0.0.1` on the computer: use the computer's LAN IP for the local API URL on a trusted network, or use the separate hosted development project. Restart Metro after changing Expo public environment variables. The local CLI config requires explicit grants for Data API tables (`auto_expose_new_tables = false`).

## Authentication development workflow

The app uses Supabase email/password Auth. Sign up sends a verification email; the profile row is created by an `auth.users` trigger even before verification. Sign in requires a verified email, and the form can resend a confirmation email when needed. Forgot password sends a reset email with a link back to the app. The root Expo Router layout waits for session restoration, then exposes either the auth screens or the five-tab shell and Settings. Settings reads and updates only the signed-in user's profile (display name and IANA timezone); currency is fixed to PHP. Sign out clears the Supabase session.

Local Supabase captures confirmation and reset emails in Mailpit. Run `npx supabase status` locally to find the Mailpit URL, open an email there, and follow its link in an installed development build. The local `supabase/config.toml` enables email confirmation and allowlists `lifeopsai://auth/callback`. After changing auth config, restart **only this repository's** local stack with `npx supabase stop` then `npx supabase start`; leave other projects' containers alone.

```powershell
npx supabase db reset --local --yes
npx supabase test db --local
npm run test:local-auth
npm run test:ci
```

`db reset --local` replays the profile, Tasks, and Bills migrations on this disposable local database. The pgTAP tests create independent Auth users and run real RLS checks as authenticated A, authenticated B, and `anon`. The Auth smoke test creates a random local account, checks unverified sign-in denial, follows Mailpit confirmation and recovery links, checks the callback shape, reads/updates the profile, changes the password, and signs in again. It prints no credentials or session data. Do not run `db reset --linked` against a hosted project.

For the hosted **Development** project, enable email/password and **Confirm Email** in Auth Providers. In Auth > URL Configuration, add the exact Additional Redirect URL `lifeopsai://auth/callback`; keep the normal site URL appropriate to that project. The Development and Production projects each need their own redirect allowlist and public client environment values. This milestone uses the existing single `lifeopsai` scheme, so development and production APKs should not be installed side by side; use distinct schemes and package IDs in a later release if simultaneous installation is required. The default Supabase confirmation and recovery email templates must preserve the requested `redirect_to` value. Do not put a project ref or secret key in the app.

The hosted Development project is not linked in this repository. To apply the reviewed migration there, obtain the real Development project ref from your dashboard, run `npx supabase login`, `npx supabase link --project-ref <development-project-ref>`, verify the linked target, then `npx supabase db push`. Do not link or push to Production during this milestone.

On a physical Android phone, install the development APK, configure the development API URL and publishable key, and restart Metro. Test sign up, open the captured/local or hosted verification email on the phone, and confirm the link opens the app. Test sign in, force-close/reopen to check restoration, sign out, open a protected route while signed out, request a reset email, open it on the phone, set a new password, and sign in again. Check Settings profile changes and invalid timezone feedback. For local Auth, use a LAN-reachable API URL and ensure the phone can reach the computer; Mailpit links can be forwarded to the phone, but the Auth API must also be reachable from it.

## Local task reminders

Task reminders default to On per signed-in account on this device. For a task with a deadline, Expo schedules local notifications 1 hour, 30 minutes, and 5 minutes before the stored due instant. Only future offsets are scheduled. Undated, completed, and overdue tasks have no pending reminders. Editing a title or deadline reconciles notification content and timing; completing, deleting, or signing out cancels pending requests; reopening schedules only future offsets. If cancellation fails, sign-out asks the user to retry. The app also reconciles a bounded set of upcoming and already scheduled tasks at authenticated startup/resume. Today continues to read Tasks directly.

Settings provides Task reminders On/Off, an explicit notification permission action, and device-settings guidance after denial. Tasks still save when device permission or scheduling fails; a warning is shown. Notification text includes the task title and relative due timing, never its description. Android uses the dedicated **Task Reminders** channel (`task-reminders-v2`) with default importance and the device's normal notification sound; users can change that channel's sound in Android settings. No custom sound file is bundled. Android can delay local delivery; reminders are not guaranteed to arrive at the exact second. No exact-alarm permission, remote push service, or cloud job is used.

`expo-notifications` is a native dependency with a config plugin, so **install a new EAS development build** before testing these reminders if the APK predates that native module; an earlier APK cannot gain the native module through Metro alone. The Task Reminders system-sound fix changes only JavaScript and uses a new runtime channel ID, so an APK that already schedules reminders can pick it up by reloading the development build from Metro. Test permission Allow/Deny, the channel and its user-adjustable sound, foreground/background delivery, edit/completion/deletion, app restart, and notification taps on a physical Android phone. This change has no database migration and requires no hosted Supabase push.

## Personal Bills

The Bills migrations are `supabase/migrations/20261025105232_create_bills.sql`, the already-applied `supabase/migrations/20261025133030_skip_unobserved_bill_cycles.sql`, and `supabase/migrations/20261026024934_restore_missing_bill_cycles.sql`. The latest migration restores every missed historical cycle without rewriting the applied migration. Review and push any pending Bills migrations to **LifeOps AI Development only**, then deploy `supabase/functions/bills` if its current code is not already deployed. The function verifies the user's access token and passes that verified user ID to the database command. The server-only `lifeops_bill_commands` role can execute only that private command function and has no broad table writes. For hosted Development, set its password outside source and provide a server-only `BILLS_DATABASE_URL` using the Development shared transaction pooler (port 6543). Use `lifeops_bill_commands.<Development project ref>` as the pooler username; the function checks the restricted role and project ref, requires TLS, and disables prepared statements. Copy the pooler host from the Development dashboard's Connect dialog. Never put this URL or password in `EXPO_PUBLIC_*`, the app, Git, or logs. These hosted steps are manual; no migration or function is pushed automatically.

For the **LifeOps local stack only**, set a random password on the restricted role and place it in the ignored Functions environment file. The local Functions runtime combines `BILLS_DB_PASSWORD` with its own internal `SUPABASE_DB_URL` host/port and substitutes the restricted username. Do this after a local database reset, then run `npx supabase functions serve bills --env-file supabase/functions/.env` in another terminal while testing Bills:

```powershell
$lifeopsDb = docker ps --format '{{.Names}}' | Where-Object { $_ -like 'supabase-LifeOps-AI-database-*' } | Select-Object -First 1
if (-not $lifeopsDb) { throw 'LifeOps local database is not running.' }
$billDbPassword = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
"alter role lifeops_bill_commands password '$billDbPassword';" | docker exec -i $lifeopsDb psql -U postgres -d postgres -v ON_ERROR_STOP=1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not configure the local Bills role.' }
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'supabase/functions/.env'), "BILLS_DB_PASSWORD=$billDbPassword`n", [System.Text.UTF8Encoding]::new($false))
Remove-Variable billDbPassword
npx supabase functions serve bills --env-file supabase/functions/.env
```

Bills are obligations paid outside LifeOps AI, not payment transactions or debt balances. An occurrence starts unpaid and can be marked paid or reopened; marking paid does not create an Expense. Recurring cycles remain separate history records. Weekly dates add seven calendar days. Monthly and yearly dates use the original anchor day and clamp to the last day of shorter months: January 31 → February 28/29 → March 31, and February 29 yearly → February 28 in non-leap years. A user can correct one unpaid occurrence due date without moving later cycles. Changing the series anchor or recurrence after any paid cycle requires archiving that series and creating a new bill, preserving paid history. The requested first due date is always saved. On create and authenticated reconciliation, active definitions backfill every missing historical cycle from the original anchor through the profile-local current date as unpaid, then generate future cycles through that date plus 90 calendar days, inclusive. A first due date beyond the horizon remains the only occurrence until the horizon reaches later cycles. Existing paid and unpaid occurrences remain unchanged; a backfilled unpaid cycle becomes overdue through the normal date rule. Unique bill/ordinal keys and command receipts prevent duplicates. After creating a recurring bill with an overdue first due date, Money opens Upcoming to show its future cycles; the initial unpaid cycle remains in Overdue.

Bill occurrence due dates are PostgreSQL `date` values. Settings has an independent Bill reminders On/Off switch, default On for this account on this device. With device permission, unpaid active occurrences get local notifications at **9:00 AM in the profile IANA timezone** two local calendar days before, one day before, and on the due date. Past slots are skipped. Edits, paid/reopen, archive/delete, timezone changes, sign-out, and app startup/resume reconcile pending requests. Device reconciliation checks up to 100 upcoming unpaid occurrences within 90 local days and shows a warning if that bound is exceeded. Android uses the dedicated **Bill Reminders** channel (`bill-reminders-v1`) and its system sound; delivery can be delayed by Android. Bill creation still succeeds when permission or scheduling fails, and the app shows a warning. An APK already containing `expo-notifications` needs a JavaScript reload for Bills; an older APK without that native module needs a new EAS development build. Verify channel settings, sound, permission denial, app restart, status changes, and notification taps on a physical Android phone.

## Future migrations

The core Tasks migration is `supabase/migrations/20261023024613_create_tasks.sql`. After a local reset, run `npx supabase test db --local` to verify owner RLS, grants, constraints, and retry uniqueness. The Tasks tab supports title-only entry, optional details and timezone-aware deadline, filters, completion/reopen, and confirmed deletion. Today reads Tasks and Bills under owner RLS. Task recurrence and projects remain later milestones; Debts is next after Bills.

Create each schema change with `npx supabase migration new <descriptive_name>`. Put SQL in the generated `supabase/migrations/` file; do not handcraft migration names. Each user-owned table must include its ownership constraints, RLS, least-privilege grants and policies, and cross-user tests in the same change. Client-readable tables need an explicit `GRANT SELECT` as well as RLS. Review the SQL before applying it.

With Docker running, use `npx supabase db reset` to apply all migrations to a disposable **local** database, then run `npx supabase test db` when database tests exist. For a hosted development project, authenticate the CLI, run `npx supabase link --project-ref <development-project-ref>`, verify the linked target, and run `npx supabase db push`. Apply reviewed migrations to the separate production project only as a deliberate release step, after development tests pass; link explicitly to `<production-project-ref>` and verify the target before `npx supabase db push`. Never use the production project for development or local tests.

## Scripts

| Command                                           | Purpose                                     |
| ------------------------------------------------- | ------------------------------------------- |
| `npm run start`                                   | Start Expo/Metro                            |
| `npm run android` / `npm run ios` / `npm run web` | Open a supported target                     |
| `npm run lint`                                    | Run Expo ESLint                             |
| `npm run typecheck`                               | Run strict TypeScript checks                |
| `npm test` / `npm run test:ci`                    | Run Jest locally / once for CI              |
| `npm run format` / `npm run format:check`         | Format or check app, test, and config files |
| `npm run config:check`                            | Print resolved public Expo configuration    |
| `npx supabase --help`                             | Show pinned local Supabase CLI commands     |

## Repository map

| Path                     | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `app/`                   | Expo Router routes and navigation layouts                               |
| `src/features/`          | Screen modules; business logic belongs here or in domain services later |
| `src/components/`        | Reusable layout, navigation, and state/UI primitives                    |
| `src/hooks/`, `src/lib/` | Theme hook, design tokens, environment parsing                          |
| `__tests__/`             | Foundation navigation and UI-state tests                                |
| `docs/`                  | Product, architecture, security, database, test, and decision specs     |
| `supabase/`              | Local CLI config, profile migration, and pgTAP authorization tests       |

Read [AGENTS.md](AGENTS.md) before changing code. Detailed behavior and acceptance criteria are in [PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md), with technical boundaries in [ARCHITECTURE.md](docs/ARCHITECTURE.md) and [SECURITY.md](docs/SECURITY.md).

The recommended next milestone is Bills. Today currently derives tasks only; later Bills, debt dues, and planned workouts will extend it from their own source records.
