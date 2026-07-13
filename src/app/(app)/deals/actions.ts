"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  brokerInputSchema,
  brokerStageSchema,
  dealCreateSchema,
  dealUpdateSchema,
  driveLinkInputSchema,
  dealSecurityInputSchema,
  dealSecurityUpdateSchema,
  guarantorInputSchema,
  guarantorUpdateSchema,
  keyDateInputSchema,
  loseDealSchema,
  pipelineStageSchema,
  settleDealSchema,
  taskInputSchema,
} from "@/lib/schemas";
import {
  createDeal,
  deleteDeal,
  loseDeal,
  moveDealStage,
  reopenDeal,
  settleDeal,
  updateDeal,
} from "@/lib/crm/deals";
import { createBroker, getBroker, updateBroker } from "@/lib/crm/brokers";
import { addGuarantor, deleteGuarantor, updateGuarantor } from "@/lib/crm/guarantors";
import { addSecurity, deleteSecurity, updateSecurity } from "@/lib/crm/securities";
import { addKeyDate, completeKeyDate, deleteKeyDate, updateKeyDate } from "@/lib/crm/keyDates";
import { addDriveLink, deleteDriveLink } from "@/lib/crm/driveLinks";
import { completeTask, createTask } from "@/lib/crm/tasks";
import { suggestBrokerPromotion } from "@/lib/crm/stageSuggestions";
import { DEFAULT_CONTACT_TYPE } from "@/lib/domain";
import type { BrokerStage } from "@/lib/database.types";

const uuid = z.string().uuid();

type Result = { ok: true } | { ok: false; error: string };

function errorMessage(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "Invalid input";
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

// A deal move ripples across the board, the record, the loan book (settled),
// Today, and broker stats — revalidate them all so nothing shows stale.
function revalidateDeal(dealId: string) {
  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/loan-book");
  revalidatePath("/brokers");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createDealAction(raw: unknown): Promise<
  | {
      ok: true;
      dealId: string;
      suggestion: { brokerId: string; brokerName: string; to: BrokerStage; reason: string } | null;
    }
  | { ok: false; error: string }
> {
  try {
    const { security_address, ...input } = dealCreateSchema.parse(raw);
    const supabase = await createClient();

    // Stats before insert; the new deal counts as +1 submitted and +1 live.
    const broker = await getBroker(supabase, input.broker_id);
    if (!broker) return { ok: false, error: "Broker not found" };
    const deal = await createDeal(supabase, input);
    if (security_address) await addSecurity(supabase, { deal_id: deal.id, address: security_address });

    const suggested = suggestBrokerPromotion({
      currentStage: broker.stage,
      totalDealsSubmitted: broker.total_deals_submitted + 1,
      liveDealCount: broker.live_deal_count + 1,
    });

    revalidateDeal(deal.id);
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

// Nested quick-create from the Add Deal sheet — a broker is a Broker-type
// contact. Returns the new broker so the caller can select it inline.
export async function createBrokerQuickAction(
  raw: unknown,
): Promise<{ ok: true; broker: { id: string; full_name: string } } | { ok: false; error: string }> {
  try {
    const input = brokerInputSchema.parse(raw);
    const supabase = await createClient();
    const broker = await createBroker(supabase, { ...input, type: DEFAULT_CONTACT_TYPE });
    revalidatePath("/brokers");
    revalidatePath("/deals");
    return { ok: true, broker: { id: broker.id, full_name: broker.full_name } };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Inline field edits (the record uses no Edit button)
// ---------------------------------------------------------------------------

// Only plain facts are editable inline; status / stage / loss reason have their
// own dedicated actions and are deliberately excluded here.
const INLINE_FIELDS = [
  "name",
  "borrower_entity",
  "borrower_contact_name",
  "borrower_contact_email",
  "borrower_contact_phone",
  "loan_amount",
  "gross_lvr",
  "product",
  "funder",
  "notes",
] as const;
type InlineField = (typeof INLINE_FIELDS)[number];

export async function updateDealFieldAction(dealId: string, field: string, value: string): Promise<Result> {
  try {
    const id = uuid.parse(dealId);
    if (!INLINE_FIELDS.includes(field as InlineField)) {
      return { ok: false, error: "That field can't be edited here" };
    }
    // Enum <select> rows submit "" to mean "clear"; the text/amount schemas
    // already normalise "" to null themselves.
    const raw = (field === "product" || field === "funder") && value === "" ? null : value;
    const patch = dealUpdateSchema.parse({ [field]: raw });
    const supabase = await createClient();
    await updateDeal(supabase, id, patch);
    revalidateDeal(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// Reassign the deal to a different broker. Both brokers' stats views shift,
// so their record pages revalidate too.
export async function changeDealBrokerAction(dealId: string, brokerId: string): Promise<Result> {
  try {
    const id = uuid.parse(dealId);
    const broker = uuid.parse(brokerId);
    const supabase = await createClient();
    await updateDeal(supabase, id, { broker_id: broker });
    revalidateDeal(id);
    revalidatePath(`/brokers/${broker}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Status & stage transitions
// ---------------------------------------------------------------------------

export async function moveDealStageAction(dealId: string, stage: unknown): Promise<Result> {
  try {
    const id = uuid.parse(dealId);
    const parsedStage = pipelineStageSchema.parse(stage);
    const supabase = await createClient();
    await moveDealStage(supabase, id, parsedStage);
    revalidateDeal(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function settleDealAction(dealId: string, raw: unknown): Promise<Result> {
  try {
    const id = uuid.parse(dealId);
    const input = settleDealSchema.parse(raw);
    const supabase = await createClient();
    await settleDeal(supabase, id, input.settlement_date, input.loan_term_months);
    revalidateDeal(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function loseDealAction(dealId: string, raw: unknown): Promise<Result> {
  try {
    const id = uuid.parse(dealId);
    const { loss_reason } = loseDealSchema.parse(raw);
    const supabase = await createClient();
    await loseDeal(supabase, id, loss_reason);
    revalidateDeal(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// Reopen a settled/lost deal as live. An optional target stage is passed when
// a lost card is dragged straight back into a pipeline column; otherwise the
// existing pipeline_stage is kept.
export async function reopenDealAction(dealId: string, stage?: unknown): Promise<Result> {
  try {
    const id = uuid.parse(dealId);
    const supabase = await createClient();
    if (stage !== undefined && stage !== null) {
      const parsedStage = pipelineStageSchema.parse(stage);
      // updateDeal clears loss_reason for any non-lost status.
      await updateDeal(supabase, id, { status: "live", loss_reason: null, pipeline_stage: parsedStage });
    } else {
      await reopenDeal(supabase, id);
    }
    revalidateDeal(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// Deleting a deal ends on the board — the record page is gone. Drive links are
// removed by the crm layer; key dates/guarantors/tasks cascade, interactions
// keep their history with deal_id nulled.
export async function deleteDealAction(dealId: string): Promise<Result> {
  try {
    const id = uuid.parse(dealId);
    const supabase = await createClient();
    await deleteDeal(supabase, id);
    revalidateDeal(id);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  // redirect() throws — it must run last, outside the try/catch.
  redirect("/deals");
}

// ---------------------------------------------------------------------------
// Guarantors (max 3, cap enforced in the crm layer)
// ---------------------------------------------------------------------------

export async function addGuarantorAction(raw: unknown): Promise<Result> {
  try {
    const input = guarantorInputSchema.parse(raw);
    const supabase = await createClient();
    await addGuarantor(supabase, input);
    revalidateDeal(input.deal_id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function updateGuarantorAction(
  dealId: string,
  guarantorId: string,
  raw: unknown,
): Promise<Result> {
  try {
    const parentId = uuid.parse(dealId);
    const id = uuid.parse(guarantorId);
    const input = guarantorUpdateSchema.parse(raw);
    const supabase = await createClient();
    await updateGuarantor(supabase, id, input);
    revalidateDeal(parentId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function deleteGuarantorAction(dealId: string, guarantorId: string): Promise<Result> {
  try {
    const parentId = uuid.parse(dealId);
    const id = uuid.parse(guarantorId);
    const supabase = await createClient();
    await deleteGuarantor(supabase, id);
    revalidateDeal(parentId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Securities (any number per deal)
// ---------------------------------------------------------------------------

export async function addSecurityAction(raw: unknown): Promise<Result> {
  try {
    const input = dealSecurityInputSchema.parse(raw);
    const supabase = await createClient();
    await addSecurity(supabase, input);
    revalidateDeal(input.deal_id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function updateSecurityAction(dealId: string, securityId: string, raw: unknown): Promise<Result> {
  try {
    const parentId = uuid.parse(dealId);
    const id = uuid.parse(securityId);
    const input = dealSecurityUpdateSchema.parse(raw);
    const supabase = await createClient();
    await updateSecurity(supabase, id, input);
    revalidateDeal(parentId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function deleteSecurityAction(dealId: string, securityId: string): Promise<Result> {
  try {
    const parentId = uuid.parse(dealId);
    const id = uuid.parse(securityId);
    const supabase = await createClient();
    await deleteSecurity(supabase, id);
    revalidateDeal(parentId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Key dates
// ---------------------------------------------------------------------------

export async function addKeyDateAction(raw: unknown): Promise<Result> {
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
): Promise<Result> {
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
): Promise<Result> {
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

export async function deleteKeyDateAction(dealId: string, keyDateId: string): Promise<Result> {
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

// ---------------------------------------------------------------------------
// Drive links (parent_type 'deal')
// ---------------------------------------------------------------------------

export async function addDriveLinkAction(raw: unknown): Promise<Result> {
  try {
    const input = driveLinkInputSchema.parse(raw);
    if (input.parent_type !== "deal") return { ok: false, error: "Links added here must belong to a deal" };
    const supabase = await createClient();
    await addDriveLink(supabase, input);
    revalidatePath(`/deals/${input.parent_id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function deleteDriveLinkAction(dealId: string, linkId: string): Promise<Result> {
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

// ---------------------------------------------------------------------------
// Tasks (scoped to this deal)
// ---------------------------------------------------------------------------

export async function addDealTaskAction(dealId: string, raw: unknown): Promise<Result> {
  try {
    const parentId = uuid.parse(dealId);
    const input = taskInputSchema.parse({ ...(raw as Record<string, unknown>), deal_id: parentId });
    const supabase = await createClient();
    await createTask(supabase, input);
    revalidateDeal(parentId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function toggleDealTaskAction(
  dealId: string,
  taskId: string,
  completed: unknown,
): Promise<Result> {
  try {
    const parentId = uuid.parse(dealId);
    const id = uuid.parse(taskId);
    const done = z.boolean().parse(completed);
    const supabase = await createClient();
    await completeTask(supabase, id, done);
    revalidateDeal(parentId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Broker promotion (explicit prompt only — never automatic)
// ---------------------------------------------------------------------------

export async function promoteBrokerAction(brokerId: string, to: unknown): Promise<Result> {
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
