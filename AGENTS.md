# LifeOps AI engineering rules

These rules apply to every future change. Before changing a subsystem, read this file, inspect its existing code, and read the relevant parts of [PRODUCT_SPEC](docs/PRODUCT_SPEC.md), [ARCHITECTURE](docs/ARCHITECTURE.md), [SECURITY](docs/SECURITY.md), [DATABASE_DESIGN](docs/DATABASE_DESIGN.md), [TEST_PLAN](docs/TEST_PLAN.md), and [DECISIONS](docs/DECISIONS.md). Prefer minimal, focused changes; do not rewrite unrelated working code, invent requirements silently, or add complexity beyond the MVP. Follow documented decisions. If one must change, explain why and update the affected documentation and tests.

## Product boundaries

- LifeOps AI is a personal productivity and life-management app. **Today and Tasks lead**; Bills, Debts, Expenses, Budgets, Work, and Workout support them. AI assists but must never be required for core flows.
- Bottom tabs: **Today, Tasks, Money, Workout, AI**. Money contains Bills, Debts, Expenses, and Budgets. Work tasks and Projects live inside Tasks; Settings belongs in the profile/menu. Keep entry quick and navigation simple.
- LifeOps AI never lends, arranges borrowing, accepts loan applications or payments, scores credit, moves money, or offers banking, payment processing, investments, or enterprise accounting. Debt tracking covers only existing outside obligations. “Paid” means the user reports an outside payment.
- Derive Today from owner-scoped source records. Do not duplicate them in a separate Today table or create shadow bills for debt dues without a documented technical need.

## Security and data access

- Never commit secrets, passwords, tokens, credentials, or private keys. Treat every `EXPO_PUBLIC_*` value as public. Supabase secret/service credentials and private AI keys stay server-side, outside the mobile bundle, source, logs, and snapshots.
- Enable RLS on **every user-owned table**, including private-schema tables; grant clients only intended owner-scoped reads. Domain writes go through authenticated Edge Function commands and restricted private transactional functions. Use authorization policies for every private Storage object. Client filtering is never authorization. No user may read or mutate another user's data.
- Validate untrusted input at each trust boundary and enforce database constraints. Verify authentication and owner/parent ownership in backend commands; never trust a client-supplied owner ID or editable user metadata. Do not weaken authentication, RLS, authorization, or validation to make a feature work. Use least privilege for roles, functions, workers, and data access.
- Never log passwords, auth tokens, API keys, sensitive financial details, AI private content, or private proof URLs. Keep proof objects private and use short-lived owner-authorized access where needed.
- Retain user histories and AI conversations until the user deletes them; delete private proof objects when their proof, workout, or account is permanently deleted. Do not keep unnecessary private provider/debug logs.

## Money, bills, and debts

- MVP currency is PHP. Parse peso input exactly; store and calculate integer centavos, and transport amounts as base-10 integer strings. Never use floating-point arithmetic for authoritative money, convert currencies, or combine currencies into one total. Deterministic domain code owns balances, spending, and budgets; AI does not.
- Track debt from the user's entered current balance, outside payments, and explicit manual adjustments. Do not automatically accrue interest or penalties. Show payoff estimates only from current tracked balance, fixed planned amount, and frequency, with assumptions and an **estimate** label.
- Marking a bill paid or recording a debt payment **never** creates an expense automatically. An optional expense is default-off and requires explicit confirmation through the normal transaction service. Show likely existing expenses and permit linking one; enforce one owner-matched posted expense per source, unique/idempotent creation, and no silent spending changes on correction or deletion.
- Use database transactions for dependent financial writes. Make critical writes safe under retries and concurrency; never report success before persistence succeeds.
- Bills and debt dues are trackers and reminders, not payment services. Default reminders run at 09:00 in the user's IANA timezone, **2, 1, and 0 local calendar days** before due. Document recurrence/calendar rules, make scheduling idempotent, and reconcile obsolete pending reminders after due-date, timezone, status, payoff, or archive changes. Show permission, token, provider, or OS scheduling failures; never claim a reminder was scheduled when it was not.

## Tasks, workouts, and AI

- Tasks are a core domain for personal and work responsibilities; reuse them for Projects/Work. Focus timers use persisted timestamps and recover after routine backgrounding or restart where practical.
- ProofMode uses a server-generated random, short-lived, single-use challenge bound to the correct owner, workout, and session. Accepted attempts use direct camera capture, never a gallery image; compress uploads and keep proof images private. Do not perform face recognition or automatically send images to AI providers. The MVP status **“Proof captured”** confirms technical challenge/upload checks only: it does not verify the pictured gesture or make cheating impossible. Describe the feature as accountability-oriented or tamper-resistant.
- Keep AI provider-neutral and optional; choose a provider only at the AI milestone after evaluating current low-cost options. AI reads only the minimum necessary owner-scoped data through controlled backend services; prefer summaries to full financial histories. AI cannot mutate records directly. Validate structured action proposals, fail closed on unknown/malformed/unauthorized output, require explicit user confirmation, and execute confirmed changes through the same tested domain services as manual UI.

## Implementation quality

- Use migrations for schema changes. Add owner-matched foreign keys, constraints, and indexes for real access patterns; verify current supported Supabase/Expo APIs before implementation. Avoid duplicated business logic across screens, Today, notifications, and AI.
- Use strict TypeScript. Avoid `any` unless the reason is documented. Do not suppress TypeScript, lint, or test failures; add unnecessary dependencies; use deprecated APIs; put domain logic in UI components; or leave placeholder logic in features marked complete.
- Handle network failure, ambiguous results, retries, and app backgrounding where relevant. Prevent duplicate submissions, show recoverable errors, and keep the app useful when AI is unavailable.
- Paginate growing histories; select needed fields; avoid N+1 queries, duplicate requests, and unnecessary React rerenders. Compress proof images and use thumbnails/placeholders in lists. Optimize from measurements, not speculative micro-optimizations.
- Keep controls visibly interactive and accessible: useful loading, empty, error, disabled, and submitting states; mobile touch targets; keyboard-safe forms; important accessibility labels; readable light and dark themes.

## Verification and completion

- Add or update tests when business logic changes. Cover financial boundaries, retry/concurrency behavior, and cross-user denial for authorization changes; add practical regression tests for bugs. Never skip/disable failing tests or claim a check passed unless it ran. Report environmental blockers accurately.
- Before completion, run all **relevant and available** formatting, lint, typecheck, unit, component/integration, database, RLS/security, and E2E checks. Review the final Git diff and new files, check for leaked secrets and unexplained warnings/errors, and update documentation when behavior or architecture changed. If a check is unavailable or irrelevant, say so rather than implying it passed.
- Every final Codex report states: files changed, implementation summary, checks actually run and each result, known limitations, and any human action required.
