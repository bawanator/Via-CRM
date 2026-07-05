"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  dealFunderSchema,
  dealProductSchema,
  interactionTypeSchema,
  pipelineStageSchema,
  savedReportInputSchema,
  savedReportUpdateSchema,
} from "@/lib/schemas";
import {
  createSavedReport,
  deleteSavedReport,
  setPinned,
  updateSavedReport,
} from "@/lib/crm/savedReports";

const uuid = z.string().uuid();

function errorMessage(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "Invalid input";
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

// ISO date, rejecting impossible days (matches @/lib/schemas isoDate).
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD)")
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Not a real date");

const reportMetricSchema = z.enum([
  "deals_submitted",
  "deals_by_stage",
  "deals_by_outcome",
  "stage_progression",
  "activity",
]);
const rangePresetSchema = z.enum(["last_30", "last_90", "quarter", "ytd", "custom", "none"]);
const groupBySchema = z.enum(["product", "broker", "type", "none"]);

// Validate the builder's spec independently of the loose `z.record` on
// savedReportInputSchema, so a malformed spec is rejected at the write boundary
// rather than blowing up at render time.
const reportSpecSchema = z
  .object({
    metric: reportMetricSchema,
    range_preset: rangePresetSchema.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    product: dealProductSchema.optional(),
    funder: dealFunderSchema.optional(),
    broker_id: uuid.optional(),
    interaction_type: interactionTypeSchema.optional(),
    target_stage: pipelineStageSchema.optional(),
    group_by: groupBySchema.optional(),
  })
  .refine((s) => s.metric !== "stage_progression" || s.target_stage != null, {
    message: "Pick a target stage for a stage-progression report.",
    path: ["target_stage"],
  });

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function revalidateReports() {
  revalidatePath("/reports");
  revalidatePath("/");
}

export async function createReportAction(raw: unknown): Promise<ActionResult> {
  try {
    const r = (raw ?? {}) as Record<string, unknown>;
    const spec = reportSpecSchema.parse(r.spec);
    const input = savedReportInputSchema.parse({ name: r.name, spec });
    const supabase = await createClient();
    const created = await createSavedReport(supabase, input);
    revalidateReports();
    return { ok: true, id: created.id };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function updateReportAction(reportId: string, raw: unknown): Promise<ActionResult> {
  try {
    const id = uuid.parse(reportId);
    const r = (raw ?? {}) as Record<string, unknown>;
    const spec = reportSpecSchema.parse(r.spec);
    // Only name + spec change here; pinned/sort are managed separately.
    const input = savedReportUpdateSchema.parse({ name: r.name, spec });
    const supabase = await createClient();
    await updateSavedReport(supabase, id, input);
    revalidateReports();
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function deleteReportAction(reportId: string): Promise<ActionResult> {
  try {
    const id = uuid.parse(reportId);
    const supabase = await createClient();
    await deleteSavedReport(supabase, id);
    revalidateReports();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function setReportPinnedAction(reportId: string, pinned: unknown): Promise<ActionResult> {
  try {
    const id = uuid.parse(reportId);
    const next = z.boolean().parse(pinned);
    const supabase = await createClient();
    // setPinned enforces the max-3 rule and throws a clear message past it.
    await setPinned(supabase, id, next);
    revalidateReports();
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
