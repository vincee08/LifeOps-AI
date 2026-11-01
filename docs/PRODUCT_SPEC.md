# Product specification

## Scope and current milestone

LifeOps AI is a personal productivity and life-management app. Its final core trackers are **Tasks, Loans, and Workouts**. Authentication/Profile, Today, Notifications, and Settings support them. Bills has been permanently removed. Tasks is implemented; the simplified Loans tracker is implemented locally pending hosted deployment and Android verification. Workout remains an informational placeholder.

The bottom tabs are **Today, Tasks, Loans, Workout**; Settings/Profile is in the header. There is no Money or AI section. Work responsibilities use the Tasks domain.

## Today

Today is derived from owner-scoped source records; it has no separate editable table. It groups overdue tasks, tasks due on the profile-local day, tasks completed on that day, and unpaid Loan installments due today or overdue. It shows exact counts and at most 20 items per section; sections fail independently. The profile timezone controls local day boundaries, with a visible Asia/Manila fallback for missing or invalid values. A task opens in Tasks and a Loan installment opens its Loan. Workouts may extend Today later.

## Tasks

The implemented slice supports title-only quick entry, optional description, personal/work/other category, high/medium/low priority, optional timezone-aware deadline, active/overdue/completed lists, completion/reopening, editing, and confirmed deletion. Lists are paginated. Task reminders are on-device and optional: future offsets at 60, 30, and 5 minutes before a deadline. A task saves even when notification permission or scheduling fails; the app shows a warning. Settings provides a Task reminders switch and permission recovery. No AI service is needed.

## Simplified Loans tracker

Loans track existing monthly obligations outside LifeOps AI. A loan has a name, exact monthly PHP amount, first due date, installment count, and optional notes. The database creates exactly that many monthly installments from the original due-date anchor, including month-end and leap-year clamping. Paid months count paid installments; remaining months and next due are derived. Each Loan detail shows a summary, only the earliest unpaid payment due today or later, all past unpaid payments in a paged Overdue Payments section, and a separate paged Paid History. An overdue-only loan is not Paid Off. The owner can mark a selected installment paid, correct an accidental mark, edit an active loan while preserving paid installment dates and amounts, and archive it. Paid means the user reports paying outside LifeOps AI. There is no balance ledger, lending, payment processing, interest, penalty, or payoff projection. Optional local Loan reminders run at 9:00 AM in the profile timezone two days before, one day before, and on each unpaid due date.

## Planned Workouts tracker

Workouts will support planned sessions, exercise records, and progress. ProofMode is planned as an accountability aid: a short-lived, single-use server challenge and direct camera capture with private image storage. “Proof captured” means technical capture and upload checks passed, not visual verification of a gesture. No face recognition or gallery proof input is planned.

## Authentication and Settings

Email/password authentication, verification, recovery, protected routes, and owner profile editing are implemented. Settings exposes display name, IANA timezone, fixed PHP currency, separate Task and Loan reminder controls, device notification permission, and sign-out. The retired Bill reminders control is absent.

## Acceptance for this removal

Bills has no route, tab, UI, Today section, setting, service, active database object, local Edge Function source, or new notification scheduling. Previously scheduled Bills requests are selectively canceled on device without changing Task reminders. Historical Bills migrations remain immutable and replay before the forward removal migration.
