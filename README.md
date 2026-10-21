# LifeOps AI

LifeOps AI is a personal productivity and life-management app centered on **“What do I need to do today?”** Today and Tasks lead the product. Money, Workout, and optional AI support them. Bills and existing debts are tracking tools for obligations paid outside the app; LifeOps AI does not lend, move money, or process payments.

**Current state:** an Expo Router mobile foundation with five placeholder tabs, a Settings route, light/dark tokens, accessible UI primitives, tests, and a centralized Supabase client. No authentication flow, application tables, business records, notifications, ProofMode, or AI integration exists yet.

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

Use the Android development build steps below for a physical phone. `npm run ios` requires macOS; `npm run web` opens a browser preview. The app shell runs without Supabase credentials.

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

The single client is in `src/lib/supabase.ts`. Import `getSupabaseClient()` from there when a backend feature is added. On iOS and Android, the session adapter stores a small AES key in Expo SecureStore and the AES-GCM encrypted session in AsyncStorage, so a large session does not hit SecureStore's value limit. Token refresh follows app foreground/background state. If the secure key is lost during device restore, the unreadable ciphertext is discarded and the user must sign in again. The web preview keeps sessions in memory and does not persist them. No auth UI or backend request is made by the current shell.

## Supabase development setup

Use a **development Supabase project distinct from production**. Create separate development and production projects in the Supabase dashboard. For a hosted development build, put only the development project's URL and publishable key in your ignored `.env.local` or in the EAS **development** environment. Put the production project's URL and publishable key only in the EAS **production** environment. Configure preview with its own project if used; never let development or preview builds point at the production database. `eas.json` explicitly maps each build profile to its EAS environment and sets `EXPO_PUBLIC_APP_ENV`. Check the selected EAS environment before each build or update. No hosted project ID or URL is stored in source.

For a local development database, start Docker Desktop's Linux engine, then run:

```powershell
docker info
npx supabase start
npx supabase status
```

Copy the **Project URL** and **Publishable** key from `npx supabase status` into ignored `.env.local`. Never copy the Secret key or database URL into an `EXPO_PUBLIC_` variable. A physical phone cannot reach `127.0.0.1` on the computer: use the computer's LAN IP for the local API URL on a trusted network, or use the separate hosted development project. Restart Metro after changing Expo public environment variables. The local CLI config requires explicit grants for future Data API tables (`auto_expose_new_tables = false`). There are no application migrations or seed data yet.

## Future migrations

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
| `supabase/`              | Local CLI config and future migrations; no application schema yet       |

Read [AGENTS.md](AGENTS.md) before changing code. Detailed behavior and acceptance criteria are in [PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md), with technical boundaries in [ARCHITECTURE.md](docs/ARCHITECTURE.md) and [SECURITY.md](docs/SECURITY.md).

The recommended next milestone is Auth/profile, with its own migration, RLS, and cross-user tests. Tasks and derived Today follow as separate feature slices. The current placeholder shell intentionally has no business data.
