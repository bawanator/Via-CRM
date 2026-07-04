"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createBroker, updateBroker } from "@/lib/crm/brokers";
import { logInteraction } from "@/lib/crm/interactions";
import { addDriveLink, deleteDriveLink } from "@/lib/crm/driveLinks";
import {
  brokerInputSchema,
  brokerStageSchema,
  brokerUpdateSchema,
  driveLinkInputSchema,
  interactionInputSchema,
} from "@/lib/schemas";
import { todayISO } from "@/lib/dates";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const uuidSchema = z.string().uuid();

function invalid(error: z.ZodError): ActionResult {
  return { ok: false, error: error.issues[0]?.message ?? "Invalid input" };
}

function failed(e: unknown, fallback: string): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

export async function createBrokerAction(input: unknown): Promise<ActionResult> {
  const parsed = brokerInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const supabase = await createClient();
    const broker = await createBroker(supabase, parsed.data);
    revalidatePath("/brokers");
    return { ok: true, id: broker.id };
  } catch (e) {
    return failed(e, "Could not create the broker");
  }
}

export async function updateBrokerAction(id: string, fields: unknown): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: "Invalid broker id" };
  const parsed = brokerUpdateSchema.safeParse(fields);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const supabase = await createClient();
    await updateBroker(supabase, idParsed.data, parsed.data);
    revalidatePath("/brokers");
    revalidatePath(`/brokers/${idParsed.data}`);
    return { ok: true, id: idParsed.data };
  } catch (e) {
    return failed(e, "Could not save the broker");
  }
}

export async function updateBrokerStageAction(id: string, stage: unknown): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: "Invalid broker id" };
  const stageParsed = brokerStageSchema.safeParse(stage);
  if (!stageParsed.success) return { ok: false, error: "Invalid stage" };
  try {
    const supabase = await createClient();
    await updateBroker(supabase, idParsed.data, { stage: stageParsed.data });
    revalidatePath("/brokers");
    revalidatePath(`/brokers/${idParsed.data}`);
    return { ok: true, id: idParsed.data };
  } catch (e) {
    return failed(e, "Could not change the stage");
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
  if (parsed.data.parent_type !== "broker") return { ok: false, error: "Links added here must belong to a broker" };
  try {
    const supabase = await createClient();
    const link = await addDriveLink(supabase, parsed.data);
    revalidatePath(`/brokers/${parsed.data.parent_id}`);
    return { ok: true, id: link.id };
  } catch (e) {
    return failed(e, "Could not add the link");
  }
}

export async function deleteDriveLinkAction(id: string, brokerId: string): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(id);
  const brokerParsed = uuidSchema.safeParse(brokerId);
  if (!idParsed.success || !brokerParsed.success) return { ok: false, error: "Invalid link" };
  try {
    const supabase = await createClient();
    await deleteDriveLink(supabase, idParsed.data);
    revalidatePath(`/brokers/${brokerParsed.data}`);
    return { ok: true };
  } catch (e) {
    return failed(e, "Could not remove the link");
  }
}
