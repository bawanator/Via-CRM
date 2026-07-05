import type { TaskInsert, TaskRow, TaskUpdate } from "@/lib/database.types";
import { assertOk, type Db } from "@/lib/crm/db";

// Tasks carry optional display context for their contact and/or deal.
export type TaskWithRefs = TaskRow & {
  contact: { id: string; full_name: string } | null;
  deal: { id: string; name: string } | null;
};

const TASK_SELECT = "*, contact:contacts(id, full_name), deal:deals(id, name)";

export type TaskFilter = {
  openOnly?: boolean;
  contactId?: string;
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
  if (filter.dealId) query = query.eq("deal_id", filter.dealId);
  if (filter.dueBefore) query = query.lte("due_date", filter.dueBefore);
  const { data, error } = await query.returns<TaskWithRefs[]>();
  return assertOk(data, error, "Listing tasks");
}

// Incomplete tasks, ordered by due date (nulls last) then creation.
export async function listOpenTasks(db: Db): Promise<TaskWithRefs[]> {
  return listTasks(db, { openOnly: true });
}

export async function createTask(db: Db, input: TaskInsert): Promise<TaskRow> {
  const { data, error } = await db.from("tasks").insert(input).select().single();
  return assertOk(data, error, "Creating task");
}

export async function updateTask(db: Db, id: string, input: TaskUpdate): Promise<TaskRow> {
  const { data, error } = await db.from("tasks").update(input).eq("id", id).select().single();
  return assertOk(data, error, "Updating task");
}

// completed_at is stamped/cleared by the DB trigger (sync_task_completed_at).
export async function completeTask(db: Db, id: string, completed = true): Promise<TaskRow> {
  return updateTask(db, id, { completed });
}

export async function deleteTask(db: Db, id: string): Promise<void> {
  const { error } = await db.from("tasks").delete().eq("id", id);
  if (error) throw new Error(`Deleting task: ${error.message}`);
}
