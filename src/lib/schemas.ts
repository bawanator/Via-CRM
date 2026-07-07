// Zod schemas validating every write boundary: server actions, API routes,
// and MCP tool inputs all parse through these before touching the database.
import { z } from "zod";

export const brokerStageSchema = z.enum(["introduced", "engaged", "active_submitter", "prime"]);
export const dealStatusSchema = z.enum(["live", "settled", "lost"]);
export const dealLossReasonSchema = z.enum([
  "outside_mandate",
  "unknown_broker",
  "failed_broker_dd",
  "failed_customer_dd",
  "lost_to_competitor",
  "ghosted",
  "unknown",
]);
export const dealProductSchema = z.enum(["bridging", "equity_release", "purchase", "residual_stock", "other"]);
export const dealFunderSchema = z.enum(["funder_1", "funder_2", "funder_3", "other"]);
export const pipelineStageSchema = z.enum(["scenario", "term_sheet", "credit", "docs", "settlement"]);
export const interactionTypeSchema = z.enum(["email", "call", "meeting", "note"]);
export const linkParentTypeSchema = z.enum(["deal", "contact"]);

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
// http(s) only — a stored javascript:/data: URL would become a live href.
const httpUrl = z
  .string()
  .trim()
  .url()
  .max(2_000)
  .refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL");
const optionalUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  httpUrl.nullable().optional(),
);
const optionalAmount = z.preprocess(
  (v) => (v === "" || v === undefined ? null : typeof v === "string" ? Number(v.replace(/[,$\s]/g, "")) : v),
  z.number().finite().nonnegative().nullable().optional(),
);

// ---------------------------------------------------------------------------
// Contacts (brokers are contacts of type "Broker")
// ---------------------------------------------------------------------------

export const contactInputSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(200),
  // A company NAME typed by the user (or an LLM). Server actions / MCP resolve
  // it to a company record via ensureCompanyByName and pass company_id to the
  // database — this field never lands in the contacts table directly.
  company_name: optionalText,
  email: optionalEmail,
  phone: optionalText,
  linkedin_url: optionalUrl,
  type: z.string().trim().min(1).max(60).optional(), // references contact_types.name
  location: optionalText,
  stage: brokerStageSchema.optional(),
  next_action: optionalText,
  next_action_date: optionalDate.optional(),
  notes: optionalText,
  source: optionalText,
});

export const contactUpdateSchema = contactInputSchema.partial();

// Back-compat aliases.
export const brokerInputSchema = contactInputSchema;
export const brokerUpdateSchema = contactUpdateSchema;

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export const dealInputSchema = z.object({
  name: z.string().trim().min(1, "Deal name is required").max(300),
  broker_id: z.string().uuid(),
  borrower_entity: optionalText,
  borrower_contact_name: optionalText,
  borrower_contact_email: optionalEmail,
  borrower_contact_phone: optionalText,
  security_address: optionalText,
  loan_amount: optionalAmount,
  product: dealProductSchema.nullable().optional(),
  funder: dealFunderSchema.nullable().optional(),
  pipeline_stage: pipelineStageSchema.optional(),
  status: dealStatusSchema.optional(),
  loss_reason: dealLossReasonSchema.nullable().optional(),
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

// Moving a deal to Closed / Lost always carries a reason.
export const loseDealSchema = z.object({
  loss_reason: dealLossReasonSchema,
});

// ---------------------------------------------------------------------------
// Guarantors
// ---------------------------------------------------------------------------

export const guarantorInputSchema = z.object({
  deal_id: z.string().uuid(),
  full_name: z.string().trim().min(1, "Name is required").max(200),
  date_of_birth: optionalDate.optional(),
  email: optionalEmail,
  phone: optionalText,
  address: optionalText,
  notes: optionalText,
});

export const guarantorUpdateSchema = guarantorInputSchema.partial().omit({ deal_id: true });

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const taskInputSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(300),
    notes: optionalText,
    due_date: optionalDate.optional(),
    contact_id: z.string().uuid().nullable().optional(),
    deal_id: z.string().uuid().nullable().optional(),
  });

export const taskUpdateSchema = taskInputSchema.partial().extend({
  completed: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Key dates, drive links, interactions
// ---------------------------------------------------------------------------

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
  url: httpUrl,
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

// ---------------------------------------------------------------------------
// Contact types & saved reports (config)
// ---------------------------------------------------------------------------

export const contactTypeInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  sort: z.number().int().min(0).max(9999).optional(),
});

export const companyInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  domain: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim().toLowerCase().replace(/^@/, "") : v),
    z
      .string()
      .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Not a valid domain")
      .nullable()
      .optional(),
  ),
  location: optionalText,
  notes: optionalText,
});

export const companyUpdateSchema = companyInputSchema.partial();

export const savedReportInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  spec: z.record(z.string(), z.unknown()),
  pinned: z.boolean().optional(),
  sort: z.number().int().min(0).max(9999).optional(),
});

export const savedReportUpdateSchema = savedReportInputSchema.partial();

export type ContactInput = z.infer<typeof contactInputSchema>;
export type CompanyInput = z.infer<typeof companyInputSchema>;
export type BrokerInput = ContactInput;
export type DealInput = z.infer<typeof dealInputSchema>;
export type GuarantorInput = z.infer<typeof guarantorInputSchema>;
export type TaskInput = z.infer<typeof taskInputSchema>;
export type KeyDateInput = z.infer<typeof keyDateInputSchema>;
export type DriveLinkInput = z.infer<typeof driveLinkInputSchema>;
export type InteractionInput = z.infer<typeof interactionInputSchema>;
export type SavedReportInput = z.infer<typeof savedReportInputSchema>;
