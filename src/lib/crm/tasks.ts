import type { TaskInsert, TaskRow, TaskUpdate } from "@/lib/database.types";
import { assertOk, type Db } from "@/lib/crm/db";
import { refreshAccessToken } from "@/lib/gmail";
import {
  deleteTask as deleteGoogleTask,
  dueDateToRfc3339,
  ensureViaTasklist,
  insertTask as insertGoogleTask,
  patchTask as patchGoogleTask,
} from "@/lib/google";

// Tasks carry optional display context for their contact and/or deal.
export type TaskWithRefs = TaskRow & {
  contact: { id: string; full_name: string } | null;
  deal: { id: string; name: string } | null;
};

const TASK_SELECT = "*, contact:contacts(id, full_name), deal:deals(id, name)";

export type TaskFilter = {
  openOnly?: boolean;
  contactId?: string;
  contactIds?: string[]; // e.g. everyone at a company
  dealId?: string;
  dueBefore?: string; // ISO date; incomplete-or-not, due on/before this date
};

export async function listTasks(db: Db, filter: TaskFilter = {}): Promise<TaskWithRefs[]> {
  let query = db
    .from("tasks")
    .select(TASK_SELECT)
    // Soonest due first; undated tasks last; stable tiebreak by creation time.
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (filter.openOnly) query = query.eq("completed", false);
  if (filter.contactId) query = query.eq("contact_id", filter.contactId);
  if (filter.contactIds) {
    if (filter.contactIds.length === 0) return [];
    query = query.in("contact_id", filter.contactIds);
  }
  if (filter.dealId) query = query.eq("deal_id", filter.dealId);
  if (filter.dueBefore) query = query.lte("due_date", filter.dueBefore);
  const { data, error } = await query.returns<TaskWithRefs[]>();
  return assertOk(data, error, "Listing tasks");
}

// Incomplete tasks, ordered by due date (nulls last) then creation.
export async function listOpenTasks(db: Db): Promise<TaskWithRefs[]> {
  return listTasks(db, { openOnly: true });
}

// Passed by callers whose change came FROM Google (the nightly reconcile) so
// the write isn't echoed straight back — that would be an infinite ping-pong.
export type TaskSyncOpts = { skipGoogleSync?: boolean };

export async function createTask(db: Db, input: TaskInsert): Promise<TaskRow> {
  const { data, error } = await db.from("tasks").insert(input).select().single();
  const task = assertOk(data, error, "Creating task");
  // Awaited (serverless can't fire-and-forget) but best-effort: pushTaskToGoogle
  // never throws, so a Google outage can never fail the CRM write.
  await pushTaskToGoogle(db, task);
  return task;
}

export async function updateTask(db: Db, id: string, input: TaskUpdate, opts: TaskSyncOpts = {}): Promise<TaskRow> {
  const { data, error } = await db.from("tasks").update(input).eq("id", id).select().single();
  const task = assertOk(data, error, "Updating task");
  if (!opts.skipGoogleSync) await pushTaskToGoogle(db, task);
  return task;
}

// completed_at is stamped/cleared by the DB trigger (sync_task_completed_at).
export async function completeTask(db: Db, id: string, completed = true, opts: TaskSyncOpts = {}): Promise<TaskRow> {
  return updateTask(db, id, { completed }, opts);
}

export async function deleteTask(db: Db, id: string): Promise<void> {
  // Read google_task_id before the row disappears — needed for the Google-side
  // delete. A failed read only skips the (best-effort) Google cleanup.
  const { data: existing } = await db.from("tasks").select("google_task_id").eq("id", id).maybeSingle();
  const { error } = await db.from("tasks").delete().eq("id", id);
  if (error) throw new Error(`Deleting task: ${error.message}`);
  if (existing?.google_task_id) await removeTaskFromGoogle(db, existing);
}

// ---------------------------------------------------------------------------
// Google Tasks push (best-effort, gated by ENABLE_GOOGLE_TASKS_SYNC)
// ---------------------------------------------------------------------------
//
// Loop prevention: CRM writes push to Google here; the nightly cron pulls
// Google-side completions back with {skipGoogleSync: true}, so a pulled change
// is never pushed straight back out. Every Google call is wrapped — Google
// being down must never break a CRM write.

/** Access token from the stored (single-user) refresh token, or null when Google isn't connected. */
async function googleAccessToken(db: Db): Promise<string | null> {
  const { data, error } = await db.from("google_oauth_tokens").select("refresh_token").limit(1);
  if (error) throw new Error(`Loading Google token: ${error.message}`);
  const token = data?.[0];
  if (!token) return null;
  return refreshAccessToken(token.refresh_token);
}

/**
 * Mirror a CRM task to the "Vía OS" Google Tasks list: insert on first sight
 * (saving google_task_id back via a direct update — NOT updateTask, which
 * would recurse), patch title/due/status afterwards. Never throws.
 */
export async function pushTaskToGoogle(db: Db, task: TaskRow): Promise<void> {
  if (process.env.ENABLE_GOOGLE_TASKS_SYNC !== "true") return;
  try {
    const accessToken = await googleAccessToken(db);
    if (!accessToken) return;
    const tasklistId = await ensureViaTasklist(accessToken);
    const due = task.due_date ? dueDateToRfc3339(task.due_date) : null;

    if (task.google_task_id) {
      await patchGoogleTask(accessToken, tasklistId, task.google_task_id, {
        title: task.title,
        due,
        status: task.completed ? "completed" : "needsAction",
      });
      return;
    }

    const googleTaskId = await insertGoogleTask(accessToken, tasklistId, {
      title: task.title,
      ...(task.notes ? { notes: task.notes } : {}),
      ...(due ? { due } : {}),
      ...(task.completed ? { status: "completed" as const } : {}),
    });
    const { error } = await db.from("tasks").update({ google_task_id: googleTaskId }).eq("id", task.id);
    if (error) console.error(`Google Tasks: saving google_task_id for task ${task.id} failed:`, error.message);
  } catch (err) {
    console.error(`Google Tasks: push for task ${task.id} failed:`, err instanceof Error ? err.message : err);
  }
}

/** Best-effort Google-side delete when a CRM task is deleted. Never throws. */
export async function removeTaskFromGoogle(db: Db, task: Pick<TaskRow, "google_task_id">): Promise<void> {
  if (process.env.ENABLE_GOOGLE_TASKS_SYNC !== "true") return;
  if (!task.google_task_id) return;
  try {
    const accessToken = await googleAccessToken(db);
    if (!accessToken) return;
    const tasklistId = await ensureViaTasklist(accessToken);
    await deleteGoogleTask(accessToken, tasklistId, task.google_task_id);
  } catch (err) {
    // Already gone on Google's side (404) lands here too — that's fine.
    console.error(`Google Tasks: delete of ${task.google_task_id} failed:`, err instanceof Error ? err.message : err);
  }
}
