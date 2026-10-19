# LifeOps AI

LifeOps AI is a personal productivity and life-management app centered on **“What do I need to do today?”** Today and Tasks lead the product. Money, Workout, and optional AI support them. Bills and existing debts are tracking tools for obligations paid outside the app; LifeOps AI does not lend, move money, or process payments.

**Current state:** an Expo Router mobile foundation with five placeholder tabs, a Settings route, light/dark tokens, accessible UI primitives, and tests. No authentication, database, business records, notifications, ProofMode, or AI integration exists yet.

## Prerequisites

- Node.js **22.13+ within the 22.x line**, or a newer Node line supported by the installed Expo SDK, and npm. See `package.json` for the exact engine range.
- For Android, an emulator or a compatible device/development build. iOS simulator builds require macOS and Xcode.

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

Copy `.env.example` to an ignored `.env` only when local configuration is needed. `EXPO_PUBLIC_APP_ENV` accepts `development`, `staging`, or `production`; development is the default. Supply environment-specific public values through local files or managed build environments. **Every `EXPO_PUBLIC_*` value is visible in the bundle.** Never put service-role keys, AI keys, passwords, or other secrets there. The Supabase entries in the example are placeholders for a later milestone and are not used by this shell.

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

## Repository map

| Path                     | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `app/`                   | Expo Router routes and navigation layouts                               |
| `src/features/`          | Screen modules; business logic belongs here or in domain services later |
| `src/components/`        | Reusable layout, navigation, and state/UI primitives                    |
| `src/hooks/`, `src/lib/` | Theme hook, design tokens, environment parsing                          |
| `__tests__/`             | Foundation navigation and UI-state tests                                |
| `docs/`                  | Product, architecture, security, database, test, and decision specs     |

Read [AGENTS.md](AGENTS.md) before changing code. Detailed behavior and acceptance criteria are in [PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md), with technical boundaries in [ARCHITECTURE.md](docs/ARCHITECTURE.md) and [SECURITY.md](docs/SECURITY.md).

The next vertical slice should add Auth/profile plus a real Tasks and derived Today flow, with migrations, RLS, cross-user tests, and retry-safe writes. The current placeholder shell intentionally has no business data.
