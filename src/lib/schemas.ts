// Zod schemas validating every write boundary: server actions, API routes,
// and MCP tool inputs all parse through these before touching the database.
import { z } from "zod";

export const brokerStageSchema = z.enum(["introduced", "engaged", "active_submitter", "prime"]);
export const dealStatusSchema = z.enum(["live", "settled", "withdrawn", "declined", "fell_over"]);
export const dealProductSchema = z.enum(["bridge", "draw", "hold", "frame", "other"]);
export const dealFunderSchema = z.enum(["hcp", "first_federal", "other"]);
export const pipelineStageSchema = z.enum(["enquiry", "scenario", "term_sheet", "credit", "docs", "settlement"]);
export const interactionTypeSchema = z.enum(["email", "call", "meeting", "note"]);
export const linkParentTypeSchema = z.enum(["deal", "broker"]);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD)")
  // Round-trip check: Date.parse alone accepts impossible days ("2025-02-30"
  // rolls over to March 2nd); re-serialising catches them.
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Not a real date");

// HTML date inputs submit "" when cleared; normalise to null.
const optionalDate = z.preprocess((v) => (v === "" || v === undefined ? null : v), isoDate.nullable());
const optionalText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().max(10_000).nullable().optional(),
);
const optionalEmail = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim().toLowerCase() : v),
  z.string().email().nullable().optional(),
);
const optionalUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().url().max(2_000).nullable().optional(),
);

export const brokerInputSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(200),
  company: optionalText,
  email: optionalEmail,
  phone: optionalText,
  linkedin_url: optionalUrl,
  stage: brokerStageSchema.optional(),
  last_contact_date: optionalDate.optional(),
  next_action: optionalText,
  next_action_date: optionalDate.optional(),
  notes: optionalText,
  source: optionalText,
});

export const brokerUpdateSchema = brokerInputSchema.partial();

export const dealInputSchema = z.object({
  name: z.string().trim().min(1, "Deal name is required").max(300),
  broker_id: z.string().uuid(),
  borrower_entity: optionalText,
  borrower_contact_name: optionalText,
  borrower_contact_email: optionalEmail,
  borrower_contact_phone: optionalText,
  security_address: optionalText,
  loan_amount: z.preprocess(
    (v) => (v === "" || v === undefined ? null : typeof v === "string" ? Number(v.replace(/[,$\s]/g, "")) : v),
    z.number().finite().nonnegative().nullable().optional(),
  ),
  product: dealProductSchema.nullable().optional(),
  funder: dealFunderSchema.nullable().optional(),
  pipeline_stage: pipelineStageSchema.optional(),
  status: dealStatusSchema.optional(),
  settlement_date: optionalDate.optional(),
  loan_term_months: z.preprocess(
    (v) => (v === "" || v === undefined ? null : typeof v === "string" ? Number(v) : v),
    z.number().int().positive().max(600).nullable().optional(),
  ),
  maturity_date: optionalDate.optional(),
  notes: optionalText,
});

export const dealUpdateSchema = dealInputSchema.partial();

export const settleDealSchema = z.object({
  settlement_date: isoDate,
  loan_term_months: z.number().int().positive().max(600),
});

export const keyDateInputSchema = z.object({
  deal_id: z.string().uuid(),
  label: z.string().trim().min(1, "Label is required").max(300),
  due_date: isoDate,
  remind_days_before: z.number().int().min(0).max(365).default(7),
});

export const driveLinkInputSchema = z.object({
  parent_type: linkParentTypeSchema,
  parent_id: z.string().uuid(),
  label: z.string().trim().min(1, "Label is required").max(300),
  url: z.string().trim().url().max(2_000),
});

export const interactionInputSchema = z.object({
  broker_id: z.string().uuid(),
  deal_id: z.string().uuid().nullable().optional(),
  type: interactionTypeSchema,
  occurred_at: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "Not a valid timestamp")
    .optional(),
  summary: z.string().trim().min(1, "Summary is required").max(10_000),
});

export type BrokerInput = z.infer<typeof brokerInputSchema>;
export type DealInput = z.infer<typeof dealInputSchema>;
export type KeyDateInput = z.infer<typeof keyDateInputSchema>;
export type DriveLinkInput = z.infer<typeof driveLinkInputSchema>;
export type InteractionInput = z.infer<typeof interactionInputSchema>;
