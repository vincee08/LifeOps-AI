# Product specification

## Purpose and boundaries

LifeOps AI is a single-user personal to-do and life management app. The default home screen answers **“What do I need to do today?”** It organizes tasks, bills, payment reminders for existing debts, recorded income/expenses, work, workouts, and AI suggestions. The tone and navigation should feel like a clean productivity app, not financial or enterprise software.

The debt tracker records obligations that already exist outside LifeOps AI. The app never lends, facilitates borrowing, connects users to lenders, accepts loan applications, approves or rejects loans, scores credit, transfers money, receives payments, or acts as a payment gateway or bank. “Paid” always means the user says they paid outside the app.

Product hierarchy: **Primary** Today and Tasks; **secondary** Bills, Debts, Expenses, Work, and Workout; **assistive** AI. The initial bottom tabs are **Today, Tasks, Money, Workout, AI**. Money contains Bills, Debts, Expenses, and Budgets. Work projects and work-context tasks live inside Tasks. Settings is reached from the profile/menu, not a bottom tab. Keep entry and agenda actions fast and low effort.

## Today and upcoming agenda

Today groups **Needs attention** (overdue), **Today**, **Upcoming** (next seven local days), and **Completed today**. Source items include personal/work tasks, bill occurrences, debt payment dates, planned workouts, and finished focus sessions. Completed today shows completed tasks, bills marked paid, completed workouts, and outside debt payments recorded today. Show time, amount when relevant, source type, and clear action; tapping opens the source record. A debt installment may appear in Money and Today, but it remains one debt occurrence rather than a duplicate bill. The agenda is a derived view/query over source records, not a separate editable Today table.

The user can quickly see what to do today, what bills are coming, what remains owed, recorded spending this month, unfinished work, and workout completion. Money figures are small summary cards; details live in Money. A failed section does not blank the agenda.

**Acceptance:** opening the app shows the correct local-day agenda; overdue, today, upcoming, and completed items are source-linked and do not duplicate a debt installment; marking an item complete updates Today; a partial data failure is visible and recoverable.

## Tasks and reminders

**Core Tasks milestone:** Users can create, edit, complete/reopen, delete, and filter ordinary tasks with title-only quick entry. The form optionally accepts description, one due date/time interpreted in the profile timezone, category (`personal`, `work`, `other`), and priority (`low`, `medium`, `high`). A task is overdue only if incomplete and its deadline is earlier than the current instant. Completed history remains until user deletion. This slice has no all-day dates, skip state, projects, recurring series, or task reminders; those remain later Tasks work. Today will derive from this table in the next milestone.

Tasks have title, optional description/category, personal or work context, priority, optional due date/time, optional reminder, completion state, and optional project. Examples include groceries, calling a client, cleaning, paying electricity, and working out. Due dates use the user's profile IANA timezone. All-day items have no forced time; task reminders require a due date and are opt-in at the due time when set, or at a chosen local time (default 09:00). Work tasks use the same task model, filtered by context/project.

Recurring tasks can repeat daily, weekly, or monthly. Each occurrence has its own completion state; missed occurrences remain overdue until completed or skipped. Future occurrences follow the original calendar anchor, not the date on which a late occurrence was completed. Monthly dates clamp to the last day of a shorter month. The user can edit or stop a series without rewriting completed history.

**Acceptance:** users can create, edit, complete/reopen, skip, filter, and delete ordinary tasks; personal and work tasks appear in Today; reminders respect local date/time and permission state; recurring instances are generated once and preserve historical completion.

## Bills and obligations

A bill tracker stores a title, amount, PHP currency, category, due date, notes, status, optional recurrence, and reminder settings. Examples are rent, utilities, subscriptions, school fees, and insurance. Recurrence may be one-time, weekly, monthly, or yearly. Each due occurrence remains unpaid until the user marks it paid or corrects its details; the user may reverse a mistaken paid status. A recurring bill's next occurrence is generated from its original date anchor, with month-end clamping (including February for yearly dates).

Default bill reminders are at 09:00 local time two calendar days before, one day before, and on the due date; the user may turn them off or change offsets. Marking an occurrence paid cancels its unsent reminders. Marking paid records an outside-the-app payment status only and **never automatically creates an expense**. The confirmation flow may offer “Also record this payment as an expense?” with the default off. Show likely existing expenses for the same amount/date first. If the user explicitly confirms, the normal transaction service creates one linked expense or links a selected existing expense, with idempotency and a unique source link. When reversing or deleting a bill with a linked expense, ask whether to keep/unlink or void the expense; do not silently change its spending history. Spending totals include recorded expenses only.

Debt installments appear in the Bills/Obligations due list with a debt label. The user chooses a bill **or** debt tracker for a given obligation; the app does not create a shadow bill for a tracked debt.

**Acceptance:** users can add/edit/archive bills, mark an occurrence paid, correct or reverse it, inspect history and next due, and configure reminders; recurrence and month-end dates are deterministic; a paid occurrence stops pending reminders; marking paid alone creates no expense; an explicitly confirmed linked expense is created at most once and correction shows its relationship.

## Existing debt tracker

Users manually enter an existing obligation such as GCash Loan, Maya credit, a motorcycle installment, a bank loan, or personal debt. Required fields are title, **current tracked balance at setup**, and a next due date; an optional original amount is reference information and is not used as the current balance. Recurring debts also require an expected payment amount and frequency; one-time debts default their expected due amount to the tracked balance. Creditor label and notes are optional. If a later outside statement differs, users can enter an explicit manual balance adjustment with a note; LifeOps AI never infers lender interest or penalties. Users can edit/archive the tracker and log payments made outside the app. No lender integration or money movement exists.

Show **Remaining tracked balance**, **Paid since added**, tracked payment progress, payment/adjustment history, next due, and overdue occurrences. `remaining = setup tracked balance + signed manual adjustments - non-void recorded payments`; reject a payment or adjustment that makes remaining negative. The optional original amount never alters this formula. Expected due occurrences are capped to the adjusted tracked total. Recorded payments cover earliest dues by cumulative paid amount; a partial payment leaves the occurrence due until its expected amount is covered. A fully repaid debt cancels future reminders. Corrections void and replace records with an audit reason. Recording a debt payment **never automatically creates an expense**; it may offer the same optional “Also record this as an expense?” choice, default off, through the normal transaction service with a unique debt-payment link. A correction/deletion of a linked debt payment asks whether to keep/unlink or void the expense.

Default debt reminders match bills: 09:00 local time at 2/1/0 calendar days. A payment that satisfies an occurrence cancels its unsent reminders; edits to due date, recurrence, or timezone reschedule pending reminders. A simple payoff estimate may show the number of remaining fixed installments and projected date **only** when the current tracked balance, planned payment amount, and frequency are reliable. Label its assumptions (no new interest/fees or further manual adjustment, on-time payments) and hide it when unreliable. The estimate is not a lender statement or authoritative future balance. No interest or penalty accrues automatically.

**Acceptance:** users can track existing debt with optional original amount, adjust a tracked balance manually, record/correct outside payments, view totals/history/progress and due status, and receive deduplicated reminders; payment recording alone creates no expense; optional linked expense needs explicit confirmation and cannot duplicate; simultaneous or retried payments never overpay; payoff estimates appear only with sufficient fixed schedule data and stated assumptions.

## Recorded income, expenses, and budgets

Users manually record income/expenses with amount, category, local date, and optional note; filter and paginate history; and see monthly recorded totals. Categories retain historical references when archived. **Simple budgets are in the MVP** as a supporting Money feature: an optional monthly overall spending limit and optional category limits. Each shows posted expense amount spent, signed amount remaining (negative when over budget), and percentage used. Category spending contributes to the overall figure but budgets are not added together. A positive limit is required to show a meaningful percentage. No envelope budgeting, forecasting, investments, or complex accounting.

V1 defaults to PHP, displays ₱ where appropriate, parses peso decimal input exactly into integer centavos, and stores a currency code for future expansion. API amounts use base-10 integer strings of centavos. It performs no foreign exchange conversion or mixed-currency total. Financial calculations are deterministic; AI never supplies authoritative balances.

**Acceptance:** entries, corrections, filters, history, monthly summaries, overall/category budgets, spent/remaining/percent used, and over-budget states work without duplicate retries; spending includes only recorded expenses, with bill- or debt-linked expenses counted once; all money math uses integer minor units and local-month boundaries.

## Work and focus

Projects group work-context tasks. Users set priorities/deadlines, run a focus timer, inspect work sessions, and see weekly completed-task and focus-minute summaries. The timer reconstructs elapsed time from persisted server timestamps after backgrounding or restart; interruption and sync errors are visible.

**Acceptance:** project filtering and task completion agree with Today; focus sessions complete once under retry, survive a routine background/restart, and produce correct local-week summaries.

## Workout and ProofMode

Users define templates/exercises, schedule or reschedule planned workouts, record sessions with sets/reps/optional weight, and view workout history, weekly completed counts, an eight-week trend, and a weekly streak. A planned workout has a date and optional template, appears in Today/Upcoming, and links to its completed session or a skipped state.

ProofMode is accountability-oriented, tamper-resistant **proof capture**, not a guarantee against cheating. The server issues a random, two-minute, single-use gesture challenge (thumbs up, two fingers, or three fingers). The ProofMode flow uses direct camera capture, never gallery selection. A compressed, metadata-stripped image is private and bound to the session and challenge. Store server upload time and the device capture time as informational metadata. The MVP checks challenge expiry, one-time use, and session binding; it does **not** automatically recognize whether the gesture in the image matches. Label accepted submissions **“Proof captured”**, not “gesture verified.” No paid verification provider or face recognition is used. On-device recognition may be evaluated later. Users can complete workouts without proof.

**Acceptance:** planned workouts and completed sessions update Today correctly; expired/reused/cross-session challenges are rejected; the stock app offers no gallery route in ProofMode; a captured status confirms technical checks only and makes no gesture-matching claim; private images remain owner-scoped and are deleted when the proof/workout or account is permanently deleted.

## Assistant and reports

The optional assistant primarily helps organize life: “What do I need to do today?”, “Plan my day,” “What payments are coming?”, “What tasks are overdue?”, “How much did I spend?”, “Add buy groceries,” or “Move my workout to tomorrow.” It reads only approved owner-scoped backend summaries and source records. Financial facts come from deterministic services, never model arithmetic. No final AI provider is selected in this specification; evaluate current free or low-cost providers when that milestone begins.

For every state-changing request, AI returns a typed proposal. The app shows an editable confirmation screen; proposals expire after 15 minutes. Explicit confirmation calls the same validated domain service used by manual UI. AI cannot directly change tasks, bills, debts, payments, transactions, projects, or workouts. A declined, expired, or ambiguous proposal changes nothing.

Reports are secondary views over recorded spending, debt progress, task completion, focus time, and workout consistency. They show date range, timezone, and source records; they do not require loading full histories on the phone.

**Acceptance:** read-only answers use only the signed-in user's data; no prompt alone mutates state; add-task, move-workout, mark-bill-paid, and record-outside-debt-payment proposals require confirmation and remain idempotent; conversations remain in history until the user deletes them; unavailable AI does not block Today or other manual flows; report numbers reconcile with their source screens.

## Shared experience and reliability

Supabase Auth gates personal data. V1 uses verified email/password and password reset. Profile timezone defaults from the device and is editable; UTC stores timestamps, while agenda and due dates use local calendar dates. Settings shows notification/camera permission failures and recovery steps. Users can request account deletion.

Retention is user-controlled: completed tasks, bill/debt/payment histories, expense transactions, workout histories, and AI conversations remain until the user deletes the relevant records or account. Users may delete a proof while keeping the workout; deleting a proof/workout or account permanently removes its private image objects. Deleting a bill/debt does not silently delete a separately recorded expense; a linked expense is retained with its source link cleared unless the user explicitly chooses to delete/void it. Do not retain private prompt or image content in provider/debug logs.

Every core screen has loading, empty, disabled/submitting, offline, and recoverable error states. Forms are keyboard safe, controls are labeled and appropriately sized (target at least 44 × 44 points), and light/dark themes have readable contrast. Cached data is labeled stale. Critical writes carry stable idempotency keys; after an ambiguous timeout, the app checks status or retries with the same key.

**Acceptance:** another user's data is inaccessible; permission denial is visible; repeated writes and scheduler runs do not create duplicates; account deletion removes owned records and proof objects; accessibility and resilience checks in the test plan pass on iOS and Android.
