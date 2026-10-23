# Architecture

## Product shape and boundaries

```text
Expo / React Native / TypeScript / Expo Router
  Today agenda ← tasks + bill occurrences + debt due occurrences + workout plans
  Screens → owner-scoped RLS reads; core Tasks owner-RLS CRUD; later Edge Function commands
                    → private transactional PostgreSQL functions
  Reminder worker → Expo Push Service
  ProofMode → private Supabase Storage + challenge validation
  Optional AI → provider-neutral server gateway + controlled data functions
```

Today is the default route. Initial bottom tabs are **Today, Tasks, Money, Workout, AI**. Money contains Bills, Debts, Expenses, and Budgets; Work projects/tasks live inside Tasks; Settings is in the profile/menu. The agenda is a read model over source records, not a table of copied to-dos. A tracked debt occurrence can appear in Money and Today without creating a duplicate bill.

The device contains a Supabase publishable key and user session only. AI, push, and database secrets stay server-side. The root Expo Router layout restores the encrypted native Supabase session before rendering protected routes. Supabase Auth handles email/password, verification, and recovery; the app handles only exact `lifeopsai://auth/callback` links and consumes the returned session. A recovery link exposes the reset form until the password update succeeds. Profile preferences and core Tasks are scoped direct-client exceptions to later Edge Function domain writes. Both use narrow grants and owner RLS. Use strict TypeScript plus runtime validation of requests, AI output, and external responses. AI has no selected production provider and is optional. No lender, credit-scoring, application, or payment-processing integration belongs in this architecture.

## Mobile responsibilities

- Feature domains: Auth/profile, Today, Tasks with Work/Projects, Money with Bills/Debts/Expenses/Budgets, Workout/ProofMode, optional AI, and Settings. Screens call typed domain services; they do not assemble database writes.
- Query only fields a screen needs, cache owner-scoped server state, invalidate affected agenda/summary queries after confirmation, and clear cache on sign-out/account switch. Store sensitive offline cache and pending commands only in encrypted device storage. Label stale reads.
- Send money as base-10 integer strings of centavos. Avoid JavaScript `number` for authoritative currency values. Display balances from deterministic server responses; payoff projections are clearly labeled estimates.
- Persist an idempotency key and pending command for critical writes. On an ambiguous timeout, query command status or retry the same request/key. Do not show a bill as paid or a debt payment as recorded until confirmed.
- Persist focus-session IDs and server start times to reconstruct a timer after backgrounding/restart. Local intervals only update the display.
- ProofMode opens the camera directly, prepares a compressed image without location metadata, uploads to a private owner/session path, and removes temporary files. No gallery option appears in a ProofMode attempt. A captured result makes no visual gesture-verification claim.

## Today read model

A bounded owner-scoped read function returns source-linked `needs_attention`, `today`, `upcoming_7_days`, and `completed_today` items plus small summary cards. Its source queries use RLS and explicit owner filters; safe SQL views, if used, have `security_invoker` behavior. Sort by local due date/time and stable ID. Task, bill, debt, and workout entities remain the source of truth; there is no separate Today table. Sections can fail independently. Server queries aggregate monthly recorded spending, simple budget use, and weekly activity; histories use keyset pagination.

## Commands and transactions

The device performs owner-scoped reads under RLS. Core Tasks single-row writes use a central typed service, owner RLS, and narrow authenticated column grants. The service validates drafts, reuses one owner-scoped request UUID for create retries, uses `updated_at` to detect stale edits, and conditionally changes completion. The database generates task IDs, stamps first completion, and keeps it stable. Later dependent domains use authenticated, versioned Edge Function commands that validate identity, shape, bounds, ownership, state transitions, and expected version where relevant. Edge Functions use a pooled direct PostgreSQL connection with a restricted server-only role granted execution on named private functions, not broad table DML. Private functions check the Edge-verified user ID against every referenced row; privileged functions have a fixed search path and no public execution grant. Keep external network calls outside transactions.

| Command | Atomic outcome |
| --- | --- |
| Task/series create, complete, skip, edit | Save one source occurrence/series, reconcile future instances and task reminders |
| Bill create, edit, mark paid/reopen | Save occurrence state and cancel/reschedule reminders; create a linked expense only with an explicit, default-off choice through the normal transaction service |
| Debt create, payment, adjustment | Validate integer balance, record outside payment or signed manual adjustment once, recompute due status/jobs; linked expense only with an explicit, default-off choice |
| Expense/income/budget | Write or void one recorded transaction, or save a monthly budget; preserve optional source link and audit trail |
| Workout plan/session | Reschedule or complete a plan once and link its session |
| Proof capture | Consume challenge once, validate expiry/session/upload, bind private image; persist `captured` without asserting gesture match |
| AI proposal confirmation | Consume proposal once and invoke the same domain command as the manual screen |

For critical writes, `(user_id, operation, idempotency_key)` identifies a command receipt with request hash and result. Same key and same payload returns the same result; a changed payload is rejected. Retain receipts for 90 days and mobile retries for at most 30 days. Permanent `origin_command_id` uniqueness on debt payments, adjustments, and recorded transactions blocks duplicates after receipt expiry. Lock the relevant source row for concurrent status/payment changes. Optional bill/debt expense creation uses the normal transaction command in the same database transaction, with a unique owner-matched source link. If a source is corrected, reopened, or deleted, ask whether to keep/unlink or void its linked expense; never silently change spending history.

## Recurrence and reminders

Future recurring tasks will use a series plus individual task occurrences; bills use bill definitions plus bill occurrences; tracked debts use debt definitions plus due occurrences. Generate future task occurrences 30 days and bill/debt occurrences 90 days ahead, plus the immediate next occurrence when beyond the horizon. A unique `(series or definition, ordinal)` prevents duplicate generation. Recurrence uses the original local calendar anchor: daily/weekly/monthly for tasks, once/weekly/monthly/yearly for bills, once/weekly/monthly for debts. Monthly/yearly dates clamp to the last day of a shorter month; completion does not shift the anchor. Preserve completed historical occurrences when editing future rules. The current Tasks slice has no recurrence or reminders.

One reminder worker handles task, bill, and debt targets. Bill and debt defaults are 2/1/0 calendar days at 09:00 in the profile's IANA timezone. Task reminders are opt-in at the due time when set or a chosen local time (default 09:00 for all-day tasks). Timezone/due-date/recurrence changes increment a schedule version, cancel obsolete unsent jobs, and insert the correct jobs idempotently. Skip reminder times already past. For nonexistent DST local times use the first valid time afterward; for ambiguous times use the earlier occurrence. A task completed/skipped, bill paid, satisfied debt due, archived source, or fully repaid debt cancels pending jobs for that item.

Expo Notifications handles permission/token registration; Expo Push Service is the initial delivery channel. The worker claims due jobs in bounded batches, rechecks target state, and records a unique dispatch key. Retry only when the provider definitely did not accept a send; ambiguous sends become `unknown` for reconciliation, not blind resending. External push delivery is not exactly-once, so the in-app agenda remains authoritative. Settings shows permission, token, and delivery failures.

## Debt calculations and bill spending

Debt tracking starts from the user-entered current balance at setup; an optional original amount is reference only. `remaining = setup tracked balance + signed manual adjustments - sum(non-void outside payments)` in integer centavos. Reject any command making remaining negative. Expected dues are reconciled to the adjusted tracked total; earliest dues are satisfied from cumulative recorded payments, and full payoff satisfies all remaining dues. Partial payments remain visible. No payment allocation table, automatic interest/penalty accrual, lender account, credit decision, or money transfer is needed. A payoff estimate derives only from current tracked balance, fixed planned payment amount, and frequency with explicit assumptions; hide it otherwise.

Marking a bill paid or recording a debt payment records outside activity and does not itself change spending totals. Both flows may offer an optional, default-off, explicitly confirmed linked expense through the normal transaction service. Before creation, surface likely existing same-date/amount expenses and let the user link one instead. Unique bill-occurrence/debt-payment links prevent another linked posted expense; the link-existing command is owner-checked and idempotent. Spending totals include only posted expense transactions. Monthly overall and category budgets compute spent from those same transactions; `remaining = limit - spent` may be negative, and integer basis points express percent used for positive limits. Overall and category budgets are separate views over the same spending, never added together. Financial entries remain manual personal records, not accounting software.

## ProofMode and Assistant

ProofMode uses a server-issued cryptographically random gesture challenge bound to owner/session, valid for two minutes and one use. The app uses direct camera capture and no gallery picker. The server validates owner/session binding, challenge expiry/unused state, private object path, type/size, and upload time, then records `captured` or a technical rejection. Client capture time is informational; the server cannot prove camera provenance or the pictured gesture. No paid verifier, automatic gesture recognition, identity matching, or face recognition is in the MVP. On-device recognition may be evaluated later. Full images use short-lived owner-authorized access; lists use private thumbnails/placeholders. Keep image/thumbnail while associated proof exists; delete objects when the proof/workout or account is permanently deleted. A workout can remain after its proof is deleted and its status returns to no proof.

When the optional AI milestone begins, evaluate currently available free or low-cost providers and select one then. The provider-neutral Assistant Edge Function authenticates the user and reads only allowlisted owner-scoped agenda, task, bill, debt, expense, work, workout, and budget functions. Provider keys/models are server-only. Model output is untrusted. Validate typed proposals, recheck record ownership and current state, show editable confirmation, and call a normal domain command only after explicit confirmation. Proposals expire after 15 minutes. Keep conversation history until the user deletes it; avoid private prompt/response content in provider/debug logs. The AI gateway has no domain mutation grant, and unavailable AI cannot block manual features.

## Resilience, privacy, and delivery order

Return typed safe errors with retryability and correlation IDs. Log operation, result, and latency; avoid prompts, proof images, tokens, notes, and detailed finances. Use owner-scoped indexed queries, server summaries, and cursor pagination. User-requested deletion removes selected tasks/history, bills/occurrences, debts/payments/adjustments, transactions, workouts/proof, or AI conversations. A source bill/debt can be deleted while a separately recorded expense remains with its source link cleared unless the user explicitly deletes that expense. Account deletion is an idempotent authenticated workflow: stop reminders, revoke push tokens, remove private proof objects and all owned content, then delete the Auth user; show progress until complete.

After the navigation/design foundation and Auth/profile, build vertical slices in this order: core Tasks; derived Today; task recurrence/reminders; Money bills/reminders; manual debt tracker; recorded expenses and simple budgets; work/projects/focus inside Tasks; planned workouts/ProofMode capture; optional AI and richer reports. Each slice includes accessible states, RLS, cross-user tests, idempotency, and recoverable errors.

References: [Supabase Edge Function Postgres access](https://supabase.com/docs/guides/functions/connect-to-postgres), [Expo Push Service](https://docs.expo.dev/push-notifications/overview/), [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/).
