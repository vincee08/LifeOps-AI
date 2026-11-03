# Product specification

## Scope and current milestone

LifeOps AI is a personal productivity and life-management app. Its final core trackers are **Tasks, Loans, and Workouts**. Authentication/Profile, Today, Notifications, and Settings support them. Bills has been permanently removed. Tasks and Loans are deployed. Workout Phase 1 is implemented locally pending review and rollout.

The bottom tabs are **Today, Tasks, Loans, Workout**; Settings/Profile is in the header. There is no Money or AI section. Work responsibilities use the Tasks domain.

## Today

Today is derived from owner-scoped source records; it has no separate editable table. It groups overdue tasks, tasks due on the profile-local day, tasks completed on that day, unpaid Loan installments due today or overdue, Workouts planned for today, and Workouts performed today. It shows exact counts and at most 20 items per section; sections fail independently. The profile timezone controls local day boundaries, with a visible Asia/Manila fallback for missing or invalid values. Source items open in their tracker.

## Tasks

The implemented slice supports title-only quick entry, optional description, personal/work/other category, high/medium/low priority, optional timezone-aware deadline, active/overdue/completed lists, completion/reopening, editing, and confirmed deletion. Lists are paginated. Task reminders are on-device and optional: future offsets at 60, 30, and 5 minutes before a deadline. A task saves even when notification permission or scheduling fails; the app shows a warning. Settings provides a Task reminders switch and permission recovery. No AI service is needed.

## Simplified Loans tracker

Loans track existing monthly obligations outside LifeOps AI. A loan has a name, exact monthly PHP amount, first due date, installment count, and optional notes. The database creates exactly that many monthly installments from the original due-date anchor, including month-end and leap-year clamping. Paid months count paid installments; remaining months and next due are derived. Each Loan detail shows a summary, only the earliest unpaid payment due today or later, all past unpaid payments in a paged Overdue Payments section, and a separate paged Paid History. An overdue-only loan is not Paid Off. The owner can mark a selected installment paid, correct an accidental mark, edit an active loan while preserving paid installment dates and amounts, and archive it. Paid means the user reports paying outside LifeOps AI. There is no balance ledger, lending, payment processing, interest, penalty, or payoff projection. Optional local Loan reminders run at 9:00 AM in the profile timezone two days before, one day before, and on each unpaid due date.

## Workout Tracker Phase 1

Workouts support quick completed logs and one-time plans with a name, date, and 1–20 exercises. Plans need no exercise measurements until completion. A planned session retains its original planned date when completed on an actual workout date. A past plan stays planned until edited, completed, or deleted. The personal exercise library supports create, search, edit, reuse, and archive; session entries keep name and measurement-type snapshots. Repetitions use uniform sets/reps, weighted repetitions add kg, and duration stores integer seconds. Completed history and older plans are paginated; progress shows total completed workouts, recent sessions, activity in the previous four full calendar weeks, and recent comparable records by exercise and measurement type. Progress is factual, with no medical or performance claim. No Workout reminders or recurring plans are scheduled.

## Photo Proof Phase 2

Photo Proof remains mandatory roadmap work after Phase 1 rollout and physical Android testing. It will allow one optional direct in-app camera photo per completed session, owner-private Storage access and deletion, permission handling, limits, retry and cleanup, and a short-lived, single-use server challenge bound to owner and session. “Proof captured” will confirm technical capture/upload checks only, not a pictured gesture or that exercise occurred. No face recognition, gallery proof input, or AI image verification is planned.

## Authentication and Settings

Email/password authentication, verification, recovery, protected routes, and owner profile editing are implemented. Settings exposes display name, IANA timezone, fixed PHP currency, separate Task and Loan reminder controls, device notification permission, and sign-out. The retired Bill reminders control is absent.

## Acceptance for this removal

Bills has no route, tab, UI, Today section, setting, service, active database object, local Edge Function source, or new notification scheduling. Previously scheduled Bills requests are selectively canceled on device without changing Task reminders. Historical Bills migrations remain immutable and replay before the forward removal migration.
