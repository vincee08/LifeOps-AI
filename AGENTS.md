# LifeOps AI engineering rules

These rules apply to every future change. Before changing a subsystem, read this file, inspect its existing code, and read the relevant parts of [PRODUCT_SPEC](docs/PRODUCT_SPEC.md), [ARCHITECTURE](docs/ARCHITECTURE.md), [SECURITY](docs/SECURITY.md), [DATABASE_DESIGN](docs/DATABASE_DESIGN.md), [TEST_PLAN](docs/TEST_PLAN.md), and [DECISIONS](docs/DECISIONS.md). Prefer minimal, focused changes; do not rewrite unrelated working code, invent requirements silently, or add complexity beyond the MVP. Follow documented decisions. If one must change, explain why and update the affected documentation and tests.

## Product boundaries

- LifeOps AI is a personal productivity and life-management app. Its core trackers are **Tasks, Loans, and Workouts**. Today and Tasks lead the current app. Loans and Workouts are planned milestones; Tasks is implemented.
- Current bottom tabs are **Today, Tasks, Workout**. Loans gets navigation when its tracker ships. Settings/Profile is reached from the header. Keep entry quick and navigation simple. Bills, Money, and AI are outside the final product scope.
- LifeOps AI never lends, arranges borrowing, accepts loan applications or payments, scores credit, moves money, or offers banking or payment processing. The planned Loans tracker records only existing outside obligations. “Paid” means the user reports an outside payment.
- Derive Today from owner-scoped source records. Today currently reads Tasks only. Do not duplicate records in a separate Today table.

## Security and data access

- Never commit secrets, passwords, tokens, credentials, or private keys. Treat every `EXPO_PUBLIC_*` value as public. Supabase secret/service credentials and private AI keys stay server-side, outside the mobile bundle, source, logs, and snapshots.
- Enable RLS on **every user-owned table**, including private-schema tables; grant clients only intended owner-scoped reads. Domain writes go through authenticated Edge Function commands and restricted private transactional functions. Use authorization policies for every private Storage object. Client filtering is never authorization. No user may read or mutate another user's data.
- Validate untrusted input at each trust boundary and enforce database constraints. Verify authentication and owner/parent ownership in backend commands; never trust a client-supplied owner ID or editable user metadata. Do not weaken authentication, RLS, authorization, or validation to make a feature work. Use least privilege for roles, functions, workers, and data access.
- Never log passwords, auth tokens, API keys, sensitive financial details, AI private content, or private proof URLs. Keep proof objects private and use short-lived owner-authorized access where needed.
- Retain user histories and AI conversations until the user deletes them; delete private proof objects when their proof, workout, or account is permanently deleted. Do not keep unnecessary private provider/debug logs.

## Future Loans tracker

- MVP currency is PHP. Parse peso input exactly; store and calculate integer centavos, and transport amounts as base-10 integer strings. Never use floating-point arithmetic for authoritative money, convert currencies, or combine currencies into one total. Deterministic domain code owns balances, spending, and budgets; AI does not.
- Track an existing loan from the user's entered current balance, outside payments, and explicit manual adjustments. Do not automatically accrue interest or penalties. Show payoff estimates only from current tracked balance, fixed planned amount, and frequency, with assumptions and an **estimate** label.
- Use database transactions for dependent financial writes. Make critical writes safe under retries and concurrency; never report success before persistence succeeds.
- Loan due dates are trackers and reminders, not payment services. Design their reminder rules during the Loans milestone. Show permission, token, provider, or OS scheduling failures; never claim a reminder was scheduled when it was not.

## Tasks and workouts

- Tasks are a core domain for personal and work responsibilities; reuse them for Projects/Work. Focus timers use persisted timestamps and recover after routine backgrounding or restart where practical.
- ProofMode uses a server-generated random, short-lived, single-use challenge bound to the correct owner, workout, and session. Accepted attempts use direct camera capture, never a gallery image; compress uploads and keep proof images private. Do not perform face recognition or automatically send images to AI providers. The MVP status **“Proof captured”** confirms technical challenge/upload checks only: it does not verify the pictured gesture or make cheating impossible. Describe the feature as accountability-oriented or tamper-resistant.

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
