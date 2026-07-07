"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { deleteCompany, updateCompany } from "@/lib/crm/companies";
import { completeTask } from "@/lib/crm/tasks";
import { companyUpdateSchema } from "@/lib/schemas";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const uuidSchema = z.string().uuid();

// Inline saves from the company record page (name / domain / location / notes).
// Everything parses through companyUpdateSchema — the same boundary the MCP
// tools use — so a bad domain or empty name never reaches the database.
export async function updateCompanyAction(id: string, fields: unknown): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: "Invalid company id" };
  const parsed = companyUpdateSchema.safeParse(fields);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const supabase = await createClient();
    await updateCompany(supabase, idParsed.data, parsed.data);
    revalidatePath("/companies");
    revalidatePath(`/companies/${idParsed.data}`);
    return { ok: true, id: idParsed.data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save the company";
    if (/duplicate key|already exists/i.test(msg)) {
      return { ok: false, error: "Another company already uses that name or domain" };
    }
    return { ok: false, error: msg };
  }
}

// Deleting a company unlinks its people first (they keep existing) and ends on
// the companies list — the record page is gone.
export async function deleteCompanyAction(id: string): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: "Invalid company id" };
  try {
    const supabase = await createClient();
    await deleteCompany(supabase, idParsed.data);
    revalidatePath("/companies");
    revalidatePath("/brokers");
    revalidatePath("/");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete the company" };
  }
  // redirect() throws — it must run last, outside the try/catch.
  redirect("/companies");
}

// Toggle a task from the company Tasks tab (tasks belong to the company's
// people; the org page is just another lens onto them).
export async function toggleCompanyTaskAction(
  companyId: string,
  taskId: string,
  completed: boolean,
): Promise<ActionResult> {
  const companyParsed = uuidSchema.safeParse(companyId);
  const taskParsed = uuidSchema.safeParse(taskId);
  if (!companyParsed.success || !taskParsed.success) return { ok: false, error: "Invalid id" };
  try {
    const supabase = await createClient();
    await completeTask(supabase, taskParsed.data, completed);
    revalidatePath(`/companies/${companyParsed.data}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the task" };
  }
}
