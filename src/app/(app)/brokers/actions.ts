"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createContact, deleteContact, updateContact } from "@/lib/crm/contacts";
import { ensureCompanyByName } from "@/lib/crm/companies";
import { addContactType } from "@/lib/crm/contactTypes";
import { deleteInteraction, logInteraction } from "@/lib/crm/interactions";
import { addDriveLink, deleteDriveLink } from "@/lib/crm/driveLinks";
import { completeTask, createTask } from "@/lib/crm/tasks";
import {
  brokerStageSchema,
  contactInputSchema,
  contactTypeInputSchema,
  contactUpdateSchema,
  driveLinkInputSchema,
  interactionInputSchema,
  taskInputSchema,
  taskUpdateSchema,
} from "@/lib/schemas";
import { todayISO } from "@/lib/dates";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const uuidSchema = z.string().uuid();

// The columns the inline detail editor is allowed to write single-field.
// `company_name` is a pseudo-field: it is resolved to company_id via
// ensureCompanyByName — the contacts table has no company text column anymore.
const INLINE_CONTACT_FIELDS = [
  "full_name",
  "company_name",
  "email",
  "phone",
  "linkedin_url",
  "location",
  "source",
  "next_action",
  "next_action_date",
  "notes",
  "type",
] as const;
type InlineContactField = (typeof INLINE_CONTACT_FIELDS)[number];

function invalid(error: z.ZodError): ActionResult {
  return { ok: false, error: error.issues[0]?.message ?? "Invalid input" };
}

function failed(e: unknown, fallback: string): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

// Strip the schema-level `company_name` and (when it was provided) resolve it
// to a company_id — find-or-create by name. The name never reaches the table.
async function resolveCompanyField<T extends { company_name?: string | null }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  data: T,
): Promise<Omit<T, "company_name"> & { company_id?: string | null }> {
  const { company_name, ...rest } = data;
  if (!("company_name" in data)) return rest;
  const company_id = await ensureCompanyByName(supabase, company_name ?? null);
  return { ...rest, company_id };
}

export async function createContactAction(input: unknown): Promise<ActionResult> {
  const parsed = contactInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const supabase = await createClient();
    const contact = await createContact(supabase, await resolveCompanyField(supabase, parsed.data));
    revalidatePath("/brokers");
    return { ok: true, id: contact.id };
  } catch (e) {
    return failed(e, "Could not create the contact");
  }
}

export async function updateContactAction(id: string, fields: unknown): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: "Invalid contact id" };
  const parsed = contactUpdateSchema.safeParse(fields);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const supabase = await createClient();
    await updateContact(supabase, idParsed.data, await resolveCompanyField(supabase, parsed.data));
    revalidatePath("/brokers");
    revalidatePath(`/brokers/${idParsed.data}`);
    return { ok: true, id: idParsed.data };
  } catch (e) {
    return failed(e, "Could not save the contact");
  }
}

// Single-field inline saves from the record page (#17). The field name is
// whitelisted, then the value is parsed through the same contact schema.
export async function updateContactFieldAction(id: string, field: string, value: string): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: "Invalid contact id" };
  if (!INLINE_CONTACT_FIELDS.includes(field as InlineContactField)) {
    return { ok: false, error: "That field can't be edited here" };
  }
  const parsed = contactUpdateSchema.safeParse({ [field]: value });
  if (!parsed.success) return invalid(parsed.error);
  try {
    const supabase = await createClient();
    await updateContact(supabase, idParsed.data, await resolveCompanyField(supabase, parsed.data));
    revalidatePath("/brokers");
    revalidatePath(`/brokers/${idParsed.data}`);
    return { ok: true, id: idParsed.data };
  } catch (e) {
    return failed(e, "Could not save the change");
  }
}

// Deleting a contact ends on the list — the record page is gone. deleteContact
// pre-checks deals and throws the human message ("This contact has N deal(s)…")
// which surfaces inline in the confirm UI.
export async function deleteContactAction(id: string): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: "Invalid contact id" };
  try {
    const supabase = await createClient();
    await deleteContact(supabase, idParsed.data);
    revalidatePath("/brokers");
    revalidatePath("/companies");
    revalidatePath("/");
  } catch (e) {
    return failed(e, "Could not delete the contact");
  }
  // redirect() throws — it must run last, outside the try/catch.
  redirect("/brokers");
}

// Delete a logged interaction (note / call / meeting / synced email — all live
// on the interactions table).
export async function deleteInteractionAction(id: string, contactId: string): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(id);
  const contactParsed = uuidSchema.safeParse(contactId);
  if (!idParsed.success || !contactParsed.success) return { ok: false, error: "Invalid id" };
  try {
    const supabase = await createClient();
    await deleteInteraction(supabase, idParsed.data);
    revalidatePath("/brokers");
    revalidatePath(`/brokers/${contactParsed.data}`);
    return { ok: true };
  } catch (e) {
    return failed(e, "Could not delete the entry");
  }
}

export async function updateContactStageAction(id: string, stage: unknown): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: "Invalid contact id" };
  const stageParsed = brokerStageSchema.safeParse(stage);
  if (!stageParsed.success) return { ok: false, error: "Invalid stage" };
  try {
    const supabase = await createClient();
    await updateContact(supabase, idParsed.data, { stage: stageParsed.data });
    revalidatePath("/brokers");
    revalidatePath(`/brokers/${idParsed.data}`);
    return { ok: true, id: idParsed.data };
  } catch (e) {
    return failed(e, "Could not change the stage");
  }
}

export async function addContactTypeAction(
  name: unknown,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const parsed = contactTypeInputSchema.safeParse({ name });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid type name" };
  try {
    const supabase = await createClient();
    const type = await addContactType(supabase, parsed.data.name, parsed.data.sort);
    revalidatePath("/brokers");
    return { ok: true, name: type.name };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not add the type";
    if (/duplicate key|already exists/i.test(msg)) return { ok: false, error: "That type already exists" };
    return { ok: false, error: msg };
  }
}

async function parseAndLogInteraction(input: unknown): Promise<ActionResult> {
  const parsed = interactionInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const supabase = await createClient();
    // A date-only "today" is dropped so the DB default now() records the real
    // moment; a back-dated entry keeps the chosen date. No date arithmetic.
    const { occurred_at, ...rest } = parsed.data;
    const interaction = await logInteraction(supabase, {
      ...rest,
      ...(occurred_at && occurred_at !== todayISO() ? { occurred_at } : {}),
    });
    revalidatePath("/brokers");
    revalidatePath(`/brokers/${parsed.data.broker_id}`);
    return { ok: true, id: interaction.id };
  } catch (e) {
    return failed(e, "Could not log the interaction");
  }
}

export async function logInteractionAction(input: unknown): Promise<ActionResult> {
  return parseAndLogInteraction(input);
}

// Force the interaction type server-side so the Calls / Notes composers can
// never be repurposed to write another type.
function withType(input: unknown, type: "call" | "note"): Record<string, unknown> {
  const base = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  return { ...base, type };
}

export async function logCallAction(input: unknown): Promise<ActionResult> {
  return parseAndLogInteraction(withType(input, "call"));
}

export async function addNoteAction(input: unknown): Promise<ActionResult> {
  return parseAndLogInteraction(withType(input, "note"));
}

export async function addDriveLinkAction(input: unknown): Promise<ActionResult> {
  const parsed = driveLinkInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (parsed.data.parent_type !== "contact") return { ok: false, error: "Links added here must belong to a contact" };
  try {
    const supabase = await createClient();
    const link = await addDriveLink(supabase, parsed.data);
    revalidatePath(`/brokers/${parsed.data.parent_id}`);
    return { ok: true, id: link.id };
  } catch (e) {
    return failed(e, "Could not add the link");
  }
}

export async function deleteDriveLinkAction(id: string, contactId: string): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(id);
  const contactParsed = uuidSchema.safeParse(contactId);
  if (!idParsed.success || !contactParsed.success) return { ok: false, error: "Invalid link" };
  try {
    const supabase = await createClient();
    await deleteDriveLink(supabase, idParsed.data);
    revalidatePath(`/brokers/${contactParsed.data}`);
    return { ok: true };
  } catch (e) {
    return failed(e, "Could not remove the link");
  }
}

// ---------------------------------------------------------------------------
// Tasks (against this contact)
// ---------------------------------------------------------------------------

export async function createTaskForContactAction(contactId: string, input: unknown): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(contactId);
  if (!idParsed.success) return { ok: false, error: "Invalid contact id" };
  const base = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const parsed = taskInputSchema.safeParse({ ...base, contact_id: idParsed.data });
  if (!parsed.success) return invalid(parsed.error);
  try {
    const supabase = await createClient();
    const task = await createTask(supabase, parsed.data);
    revalidatePath(`/brokers/${idParsed.data}`);
    revalidatePath("/");
    return { ok: true, id: task.id };
  } catch (e) {
    return failed(e, "Could not add the task");
  }
}

export async function toggleTaskAction(id: string, completed: unknown, contactId?: string): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: "Invalid task id" };
  const parsed = taskUpdateSchema.safeParse({ completed });
  if (!parsed.success) return invalid(parsed.error);
  try {
    const supabase = await createClient();
    await completeTask(supabase, idParsed.data, parsed.data.completed ?? false);
    if (contactId) {
      const contactParsed = uuidSchema.safeParse(contactId);
      if (contactParsed.success) revalidatePath(`/brokers/${contactParsed.data}`);
    }
    revalidatePath("/brokers");
    revalidatePath("/");
    return { ok: true, id: idParsed.data };
  } catch (e) {
    return failed(e, "Could not update the task");
  }
}
