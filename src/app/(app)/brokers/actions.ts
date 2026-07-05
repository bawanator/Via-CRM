"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createContact, updateContact } from "@/lib/crm/contacts";
import { addContactType } from "@/lib/crm/contactTypes";
import { logInteraction } from "@/lib/crm/interactions";
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
const INLINE_CONTACT_FIELDS = [
  "company",
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

export async function createContactAction(input: unknown): Promise<ActionResult> {
  const parsed = contactInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const supabase = await createClient();
    const contact = await createContact(supabase, parsed.data);
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
    await updateContact(supabase, idParsed.data, parsed.data);
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
    await updateContact(supabase, idParsed.data, parsed.data);
    revalidatePath("/brokers");
    revalidatePath(`/brokers/${idParsed.data}`);
    return { ok: true, id: idParsed.data };
  } catch (e) {
    return failed(e, "Could not save the change");
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

export async function logInteractionAction(input: unknown): Promise<ActionResult> {
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
