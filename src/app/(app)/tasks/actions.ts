"use server";

// Shared task route-actions owned by the Today slice. Contacts and Deals slices
// keep their own task actions in their folders; these are the general-purpose
// create/toggle/complete used by the Today to-do list (and any caller that just
// needs the plain versions). Every write parses through the Zod schema and goes
// through the crm layer (which carries the audit "ui" source header).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { taskInputSchema, taskUpdateSchema } from "@/lib/schemas";
import { createTask, completeTask as completeTaskCrm, updateTask } from "@/lib/crm/tasks";

type ActionOk = { ok: true; id: string };
type ActionErr = { ok: false; error: string };
type ActionResult = ActionOk | ActionErr;

const uuid = z.string().uuid();

function errorMessage(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "Invalid input";
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

// Tasks surface on Today and (when linked) on the related contact/deal.
function revalidateTaskPaths(refs: { contact_id?: string | null; deal_id?: string | null }) {
  revalidatePath("/");
  revalidatePath("/brokers");
  revalidatePath("/deals");
  if (refs.contact_id) revalidatePath(`/brokers/${refs.contact_id}`);
  if (refs.deal_id) revalidatePath(`/deals/${refs.deal_id}`);
}

// Create a task from the Today composer (title + optional due date); also
// accepts an optional contact_id/deal_id so linked callers can reuse it.
export async function createTaskAction(raw: unknown): Promise<ActionResult> {
  try {
    const input = taskInputSchema.parse(raw);
    const supabase = await createClient();
    const task = await createTask(supabase, input);
    revalidateTaskPaths(task);
    return { ok: true, id: task.id };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// Toggle a task's completion (the checkbox on the Today list). completed_at is
// stamped/cleared by the DB trigger.
export async function toggleTaskAction(id: string, completed: boolean): Promise<ActionResult> {
  try {
    const taskId = uuid.parse(id);
    const done = z.boolean().parse(completed);
    const supabase = await createClient();
    const task = await updateTask(supabase, taskId, { completed: done });
    revalidateTaskPaths(task);
    return { ok: true, id: task.id };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// Edit a task in place (Today's inline rename / reschedule). Accepts any
// partial task shape — title, due_date, notes, completed — parsed through
// taskUpdateSchema before the crm write.
export async function updateTaskAction(id: string, raw: unknown): Promise<ActionResult> {
  try {
    const taskId = uuid.parse(id);
    const input = taskUpdateSchema.parse(raw);
    const supabase = await createClient();
    const task = await updateTask(supabase, taskId, input);
    revalidateTaskPaths(task);
    return { ok: true, id: task.id };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// Convenience for callers that only ever mark done (defaults to completing).
export async function completeTask(id: string, completed = true): Promise<ActionResult> {
  try {
    const taskId = uuid.parse(id);
    const supabase = await createClient();
    const task = await completeTaskCrm(supabase, taskId, completed);
    revalidateTaskPaths(task);
    return { ok: true, id: task.id };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
