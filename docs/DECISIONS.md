# Decisions

These are the current product and engineering decisions. Historical Bills decisions are retained below only to explain applied migrations; they are superseded by the retirement decision.

| ID | Decision |
| --- | --- |
| D01 | LifeOps AI is a personal productivity app with Tasks, Loans, and Workouts as its only core trackers. Today, authentication/profile, notifications, and Settings support them. Bills is permanently removed. |
| D02 | Current bottom tabs are Today, Tasks, Workout. Settings/Profile is in the header. Loans receives navigation when implemented. No Money or AI tab remains. |
| D03 | Today derives owner-scoped source records and has no separate table. It currently reads Tasks only. Loans and Workouts may join after their milestones ship. |
| D04 | Expo/React Native/TypeScript/Expo Router and Supabase PostgreSQL/Auth remain the stack. Every user-owned table uses RLS; server secrets never enter the mobile bundle. |
| D05 | Loans will record existing outside obligations only. LifeOps AI does not lend, arrange borrowing, accept applications, score credit, or process payments. Store PHP amounts as integer centavos and calculate balances deterministically. No automatic interest or penalties. |
| D06 | Core Tasks uses direct authenticated CRUD under owner RLS and narrow column grants. Server-generated IDs, owner-scoped request UUIDs, and server-stamped first completion provide the current retry and integrity rules. |
| D07 | Task reminders are optional local notifications at future 60/30/5-minute offsets. The setting is per signed-in account on device. Android uses `task-reminders-v2`. |
| D08 | Workouts and ProofMode are planned. A technical “Proof captured” status makes no gesture-verification claim; direct camera capture, private objects, and a short-lived single-use server challenge are required at implementation. |
| D09 | The Bills removal is a new forward migration. Never edit or delete applied historical Bills migrations. Remove local Bills app/Edge Function source, but delete the hosted function and unset its secret only through an explicit operator rollout. |
| D10 | The retired `lifeops_bill_commands` role is changed to `NOLOGIN` and loses private-schema usage. Keep the inert cluster role during migration replay; drop it later only after an operator verifies all dependencies and replay behavior. |
| D11 | On app startup, selectively cancel old Bills device notifications by former request prefix, kind, or dedicated channel, then delete `bill-reminders-v1` on Android. Remove old `task-reminders` only after authenticated Task reconciliation or signed-out cancellation clears old-channel requests. Preserve `task-reminders-v2`, current Task reminders and preferences, and unrelated channels; surface failure and retry on resume. |

## Historical Bills context

The applied `create_bills`, `skip_unobserved_bill_cycles`, and `restore_missing_bill_cycles` migrations previously implemented Bills definitions, occurrences, recurring due dates, read views, private transactional commands, and owner RLS. The Bills Edge Function used a server-only `BILLS_DATABASE_URL` and the restricted `lifeops_bill_commands` role. Those objects are removed by `20261030033936_remove_bills.sql`; the migration files stay as immutable history. Historical behavior is not a current product requirement.
