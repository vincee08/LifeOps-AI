import {
  cancelTaskReminders,
  reconcileTaskReminders,
  type ReminderResult,
} from '@/features/tasks/task-notifications';
import {
  createTask,
  deleteTask,
  editTask,
  setTaskCompleted,
  type Task,
  type TaskDraft,
} from '@/features/tasks/tasks-service';

export type TaskCommandResult = { task: Task; reminder: ReminderResult };

export async function createTaskWithReminders(
  ownerId: string,
  requestId: string,
  draft: TaskDraft,
): Promise<TaskCommandResult> {
  const task = await createTask(ownerId, requestId, draft);
  return { task, reminder: await reconcileTaskReminders(task) };
}

export async function editTaskWithReminders(
  ownerId: string,
  original: Task,
  draft: TaskDraft,
): Promise<TaskCommandResult> {
  const task = await editTask(ownerId, original, draft);
  return { task, reminder: await reconcileTaskReminders(task) };
}

export async function setTaskCompletedWithReminders(
  ownerId: string,
  taskId: string,
  complete: boolean,
): Promise<TaskCommandResult> {
  const task = await setTaskCompleted(ownerId, taskId, complete);
  return { task, reminder: await reconcileTaskReminders(task) };
}

export async function deleteTaskWithReminders(
  ownerId: string,
  taskId: string,
): Promise<ReminderResult> {
  await deleteTask(ownerId, taskId);
  return cancelTaskReminders(ownerId, taskId);
}
