# LifeOps AI

LifeOps AI is a planned personal productivity and life management app. Its home screen answers **“What do I need to do today?”** with personal and work tasks, bills, existing debt payment dates, and planned workouts. AI can help organize the day but is optional; the user confirms every proposed change.

LifeOps AI is **not** a lender, bank, payment gateway, or loan servicer. It does not provide or arrange loans, accept applications, score credit, transfer money, or receive payments. Debt and bill entries are personal records of obligations and payments made outside the app.

**Repository status:** specifications only. No Expo app, dependencies, Supabase project, migrations, or application features have been created.

## Read first

| Document | Purpose |
| --- | --- |
| [Product spec](docs/PRODUCT_SPEC.md) | Today experience, module behavior, and acceptance criteria |
| [Architecture](docs/ARCHITECTURE.md) | Mobile, backend, agenda, reminder, and AI boundaries |
| [Security](docs/SECURITY.md) | Isolation, privacy, and mandatory controls |
| [Database design](docs/DATABASE_DESIGN.md) | Proposed task, bill, debt, and workout records |
| [Test plan](docs/TEST_PLAN.md) | Verification and release gates |
| [Decisions](docs/DECISIONS.md) | Final MVP decisions and deferred choices |

## Non-negotiable rules

- Today and Tasks lead the product. Money contains Bills, Debts, Expenses, and simple Budgets; Work projects live inside Tasks.
- Marking a bill paid or recording an outside debt payment never automatically creates an expense. An optional linked expense needs explicit confirmation.
- Default to PHP, store money as integer centavos, and calculate tracked totals deterministically.
- Enable and test RLS on every user-owned table; keep workout proof images private until their proof/workout or account is deleted.
- Keep AI/provider secrets and privileged database keys off the device and out of Git.
- AI reads only through controlled backend functions. Every proposed state change needs explicit confirmation and the normal domain service.
- Make critical writes and scheduled reminders idempotent.

## Intended stack and next step

Mobile: React Native, Expo, TypeScript, Expo Router. Backend: Supabase PostgreSQL, Auth, Storage, and Edge Functions. AI: a provider-neutral server-side gateway.

The recommended next milestone is an Expo shell with Auth/profile, a task list, and a derived Today agenda backed by local Supabase migrations, RLS, and cross-user tests. Add Money's bills/reminders, debts, expenses, and simple budgets in later slices. This milestone is a plan; no app scaffold or dependencies have been added.
