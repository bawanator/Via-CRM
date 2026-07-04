"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  brokerStageSchema,
  dealInputSchema,
  dealUpdateSchema,
  driveLinkInputSchema,
  keyDateInputSchema,
  pipelineStageSchema,
  settleDealSchema,
} from "@/lib/schemas";
import { createDeal, moveDealStage, settleDeal, updateDeal } from "@/lib/crm/deals";
import { getBroker, updateBroker } from "@/lib/crm/brokers";
import { addKeyDate, completeKeyDate, deleteKeyDate, updateKeyDate } from "@/lib/crm/keyDates";
import { addDriveLink, deleteDriveLink } from "@/lib/crm/driveLinks";
import { suggestBrokerPromotion } from "@/lib/crm/stageSuggestions";
import type { BrokerStage } from "@/lib/database.types";

const uuid = z.string().uuid();

function errorMessage(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "Invalid input";
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

function revalidateDeal(dealId: string) {
  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/loan-book");
  revalidatePath("/");
}

export async function createDealAction(raw: unknown): Promise<
  | {
      ok: true;
      dealId: string;
      suggestion: { brokerId: string; brokerName: string; to: BrokerStage; reason: string } | null;
    }
  | { ok: false; error: string }
> {
  try {
    const input = dealInputSchema.parse(raw);
    const supabase = await createClient();

    // Stats before insert; the new deal counts as +1 submitted and +1 live.
    const broker = await getBroker(supabase, input.broker_id);
    if (!broker) return { ok: false, error: "Broker not found" };
    const deal = await createDeal(supabase, input);

    const suggested = suggestBrokerPromotion({
      currentStage: broker.stage,
      totalDealsSubmitted: broker.total_deals_submitted + 1,
      liveDealCount: broker.live_deal_count + 1,
    });

    revalidateDeal(deal.id);
    revalidatePath("/brokers");
    revalidatePath(`/brokers/${broker.id}`);

    return {
      ok: true,
      dealId: deal.id,
      suggestion: suggested
        ? { brokerId: broker.id, brokerName: broker.full_name, to: suggested.to, reason: suggested.reason }
        : null,
    };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function updateDealAction(
  dealId: string,
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const id = uuid.parse(dealId);
    const input = dealUpdateSchema.parse(raw);
    const supabase = await createClient();
    await updateDeal(supabase, id, input);
    revalidateDeal(id);
    revalidatePath("/brokers");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function moveDealStageAction(
  dealId: string,
  stage: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const id = uuid.parse(dealId);
    const parsedStage = pipelineStageSchema.parse(stage);
    const supabase = await createClient();
    await moveDealStage(supabase, id, parsedStage);
    revalidatePath("/deals");
    revalidatePath(`/deals/${id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function settleDealAction(
  dealId: string,
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const id = uuid.parse(dealId);
    const input = settleDealSchema.parse(raw);
    const supabase = await createClient();
    await settleDeal(supabase, id, input.settlement_date, input.loan_term_months);
    revalidateDeal(id);
    revalidatePath("/brokers");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// Updates ONLY the stage — invoked from the explicit promotion prompt.
export async function promoteBrokerAction(
  brokerId: string,
  to: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const id = uuid.parse(brokerId);
    const stage = brokerStageSchema.parse(to);
    const supabase = await createClient();
    await updateBroker(supabase, id, { stage });
    revalidatePath("/brokers");
    revalidatePath(`/brokers/${id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function addKeyDateAction(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const input = keyDateInputSchema.parse(raw);
    const supabase = await createClient();
    await addKeyDate(supabase, input);
    revalidateDeal(input.deal_id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

const keyDateUpdateSchema = keyDateInputSchema.omit({ deal_id: true }).partial();

export async function updateKeyDateAction(
  dealId: string,
  keyDateId: string,
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const parentId = uuid.parse(dealId);
    const id = uuid.parse(keyDateId);
    const input = keyDateUpdateSchema.parse(raw);
    const supabase = await createClient();
    await updateKeyDate(supabase, id, input);
    revalidateDeal(parentId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function completeKeyDateAction(
  dealId: string,
  keyDateId: string,
  completed: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const parentId = uuid.parse(dealId);
    const id = uuid.parse(keyDateId);
    const done = z.boolean().parse(completed);
    const supabase = await createClient();
    await completeKeyDate(supabase, id, done);
    revalidateDeal(parentId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function deleteKeyDateAction(
  dealId: string,
  keyDateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const parentId = uuid.parse(dealId);
    const id = uuid.parse(keyDateId);
    const supabase = await createClient();
    await deleteKeyDate(supabase, id);
    revalidateDeal(parentId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function addDriveLinkAction(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const input = driveLinkInputSchema.parse(raw);
    const supabase = await createClient();
    await addDriveLink(supabase, input);
    if (input.parent_type === "deal") revalidatePath(`/deals/${input.parent_id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function deleteDriveLinkAction(
  dealId: string,
  linkId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const parentId = uuid.parse(dealId);
    const id = uuid.parse(linkId);
    const supabase = await createClient();
    await deleteDriveLink(supabase, id);
    revalidatePath(`/deals/${parentId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
