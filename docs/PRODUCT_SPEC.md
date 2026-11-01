# Product specification

## Scope and current milestone

LifeOps AI is a personal productivity and life-management app. Its final core trackers are **Tasks, Loans, and Workouts**. Authentication/Profile, Today, Notifications, and Settings support them. Bills has been permanently removed. The Loans and Workouts trackers are planned milestones; this change does not implement them. The current Workout tab is an informational placeholder.

Today and Tasks lead the current experience. The bottom tabs are **Today, Tasks, Workout**; Settings/Profile is in the header. Add Loans navigation when the tracker is implemented. There is no Money or AI section. Work responsibilities use the Tasks domain.

## Today

Today is derived from owner-scoped source records; it has no separate editable table. The current screen uses Tasks only and groups overdue tasks, tasks due on the profile-local day, and tasks completed on that day. It shows exact counts and at most 20 tasks per section; sections fail independently. The profile timezone controls local day boundaries, with a visible Asia/Manila fallback for missing or invalid values. A task opens in Tasks. Future Loans and Workouts may extend Today through their own records when implemented.

## Tasks

The implemented slice supports title-only quick entry, optional description, personal/work/other category, high/medium/low priority, optional timezone-aware deadline, active/overdue/completed lists, completion/reopening, editing, and confirmed deletion. Lists are paginated. Task reminders are on-device and optional: future offsets at 60, 30, and 5 minutes before a deadline. A task saves even when notification permission or scheduling fails; the app shows a warning. Settings provides a Task reminders switch and permission recovery. No AI service is needed.

## Planned Loans tracker

Loans will track existing obligations outside LifeOps AI. The user will enter a current tracked balance, optional reference amount, due schedule, outside payments, and explicit adjustments. No lending, application, credit scoring, bank connection, payment processing, automatic interest, or penalty accrual is in scope. Balances use integer PHP centavos and deterministic calculations. Any payoff projection must be labeled an estimate and state its assumptions. Define the exact UI, schema, reminder rules, and tests at the Loans milestone.

## Planned Workouts tracker

Workouts will support planned sessions, exercise records, and progress. ProofMode is planned as an accountability aid: a short-lived, single-use server challenge and direct camera capture with private image storage. “Proof captured” means technical capture and upload checks passed, not visual verification of a gesture. No face recognition or gallery proof input is planned.

## Authentication and Settings

Email/password authentication, verification, recovery, protected routes, and owner profile editing are implemented. Settings exposes display name, IANA timezone, fixed PHP currency, Task reminders, device notification permission, and sign-out. The retired Bill reminders control is absent.

## Acceptance for this removal

Bills has no route, tab, UI, Today section, setting, service, active database object, local Edge Function source, or new notification scheduling. Previously scheduled Bills requests are selectively canceled on device without changing Task reminders. Historical Bills migrations remain immutable and replay before the forward removal migration.
