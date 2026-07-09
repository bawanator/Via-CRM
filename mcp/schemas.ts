// MCP tool input shapes — plain objects of Zod fields (Zod "raw shapes").
// The MCP SDK builds each tool's JSON Schema from these, and tests can
// validate them via z.object(shape). Field validators are composed from
// src/lib/schemas.ts wherever possible so the MCP boundary accepts exactly
// what the UI boundary accepts; server.ts additionally re-parses every write
// through the canonical object schemas before touching the database.
import { z } from "zod";
import {
  brokerStageSchema,
  companyUpdateSchema,
  contactInputSchema,
  contactUpdateSchema,
  dealFunderSchema,
  dealCreateSchema,
  dealInputSchema,
  dealLossReasonSchema,
  dealProductSchema,
  dealStatusSchema,
  driveLinkInputSchema,
  guarantorInputSchema,
  interactionInputSchema,
  interactionTypeSchema,
  keyDateInputSchema,
  linkParentTypeSchema,
  pipelineStageSchema,
  savedReportInputSchema,
  settleDealSchema,
  taskInputSchema,
} from "@/lib/schemas";
import { AUDITED_TABLES } from "@/lib/crm/audit";

// UUID or a (partial) name; resolveContactId/resolveDealId throw a helpful
// candidate list when the name is ambiguous, so Claude can disambiguate.
const idOrName = z.string().trim().min(1);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD)")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Not a real date");

// --------------------------------------------------------------- contacts --

// A contact is any person the CRM tracks; a broker is a contact of type
// "Broker". Filters mirror ContactFilter in src/lib/crm/contacts.ts.
export const listContactsShape = {
  stage: brokerStageSchema.optional().describe("Filter by relationship stage (meaningful for Broker-type contacts)"),
  type: z.string().trim().min(1).optional().describe("Filter by contact type name, e.g. Broker / Borrower"),
  location: z.string().trim().min(1).optional().describe("Filter by city / region"),
  overdue_only: z.boolean().optional().describe("Only contacts whose next action is due today or overdue"),
  cold_only: z.boolean().optional().describe("Only contacts with no contact for 30+ days (or never)"),
  search: z.string().trim().min(1).optional().describe("Fuzzy match over name / company / email"),
};

export const getContactShape = {
  id_or_name: idOrName.describe("Contact UUID or (partial) name"),
};

export const createContactShape = { ...contactInputSchema.shape };

export const updateContactShape = {
  id_or_name: idOrName.describe("Contact UUID or (partial) name"),
  ...contactUpdateSchema.shape,
};

// Broker aliases — thin wrappers that default the contact type to "Broker".
export const listBrokersShape = {
  stage: brokerStageSchema.optional().describe("Filter by relationship stage"),
  location: z.string().trim().min(1).optional().describe("Filter by city / region"),
  overdue_only: z.boolean().optional().describe("Only brokers whose next action is due today or overdue"),
  cold_only: z.boolean().optional().describe("Only brokers with no contact for 30+ days (or never)"),
  search: z.string().trim().min(1).optional().describe("Fuzzy match over name / company / email"),
};

export const getBrokerShape = {
  id_or_name: idOrName.describe("Broker UUID or (partial) name"),
};

export const createBrokerShape = { ...contactInputSchema.shape };

export const updateBrokerShape = {
  id_or_name: idOrName.describe("Broker UUID or (partial) name"),
  ...contactUpdateSchema.shape,
};

// -------------------------------------------------------------- companies --

// Companies are auto-created (from typed names and email domains) and never
// hand-maintained; these tools read them and patch details, never create.
export const listCompaniesShape = {
  search: z.string().trim().min(1).optional().describe("Fuzzy match over company name"),
};

export const getCompanyShape = {
  id_or_name: idOrName.describe("Company UUID or (partial) name"),
};

export const updateCompanyShape = {
  id_or_name: idOrName.describe("Company UUID or (partial) name"),
  ...companyUpdateSchema.shape,
};

export const logInteractionShape = {
  contact: idOrName.describe("Contact UUID or (partial) name (a broker is a contact)"),
  type: interactionTypeSchema,
  summary: interactionInputSchema.shape.summary,
  date: isoDate.optional().describe("When it happened (YYYY-MM-DD); defaults to now"),
  deal: idOrName.optional().describe("Optionally link to a deal (UUID or partial name)"),
};

// ------------------------------------------------------------------ deals --

export const listDealsShape = {
  status: dealStatusSchema.optional().describe("live | settled | lost"),
  pipeline_stage: pipelineStageSchema.optional(),
  funder: dealFunderSchema.optional().describe("funder_1 | funder_2 | funder_3 | other (code names only)"),
  broker: idOrName.optional().describe("Only deals for this broker — UUID or (partial) name"),
};

export const getDealShape = {
  id_or_name: idOrName.describe("Deal UUID or (partial) name"),
};

export const createDealShape = {
  broker: idOrName.describe("Introducing broker — UUID or (partial) name"),
  ...dealCreateSchema.omit({ broker_id: true }).shape,
};

export const updateDealShape = {
  id_or_name: idOrName.describe("Deal UUID or (partial) name"),
  ...dealInputSchema.partial().omit({ broker_id: true }).shape,
};

export const moveDealStageShape = {
  id_or_name: idOrName.describe("Deal UUID or (partial) name"),
  stage: pipelineStageSchema,
};

export const settleDealShape = {
  id_or_name: idOrName.describe("Deal UUID or (partial) name"),
  ...settleDealSchema.shape,
};

export const loseDealShape = {
  id_or_name: idOrName.describe("Deal UUID or (partial) name"),
  loss_reason: dealLossReasonSchema.describe("Required reason the deal was closed / lost"),
};

// ------------------------------------------------------------- securities --

export const addSecurityShape = {
  deal: idOrName.describe("Deal UUID or (partial) name"),
  address: z.string().trim().min(1).max(500).describe("Security property address"),
};

export const removeSecurityShape = {
  security_id: z.string().uuid().describe("deal_securities row id (see get_deal → securities)"),
};

// ------------------------------------------------------------- guarantors --

export const addGuarantorShape = {
  deal: idOrName.describe("Deal UUID or (partial) name"),
  ...guarantorInputSchema.omit({ deal_id: true }).shape,
};

// ------------------------------------------------------------------ tasks --

export const listTasksShape = {
  open_only: z.boolean().optional().describe("Only incomplete tasks"),
  contact: idOrName.optional().describe("Only tasks for this contact — UUID or (partial) name"),
  deal: idOrName.optional().describe("Only tasks for this deal — UUID or (partial) name"),
};

export const createTaskShape = {
  title: taskInputSchema.shape.title,
  notes: taskInputSchema.shape.notes,
  due_date: taskInputSchema.shape.due_date,
  contact: idOrName.optional().describe("Optionally link to a contact — UUID or (partial) name"),
  deal: idOrName.optional().describe("Optionally link to a deal — UUID or (partial) name"),
};

export const completeTaskShape = {
  task_id: z.string().uuid(),
  completed: z.boolean().optional().describe("Defaults to true; pass false to reopen"),
};

// ---------------------------------------------------- key dates and links --

export const addKeyDateShape = {
  deal: idOrName.describe("Deal UUID or (partial) name"),
  ...keyDateInputSchema.omit({ deal_id: true }).shape,
};

export const completeKeyDateShape = {
  key_date_id: z.string().uuid(),
  completed: z.boolean().optional().describe("Defaults to true; pass false to reopen"),
};

export const addDriveLinkShape = {
  parent_type: linkParentTypeSchema.describe("'deal' or 'contact'"),
  parent: idOrName.describe("Parent record — deal or contact UUID or (partial) name, per parent_type"),
  ...driveLinkInputSchema.omit({ parent_type: true, parent_id: true }).shape,
};

// -------------------------------------------------------- today and audit --

export const whatsDueShape = {
  days_ahead: z.number().int().min(0).max(365).optional().describe("Key-date lookahead in days (default 14)"),
  cold_after_days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe("Days without contact before a broker counts as cold (default 30)"),
};

export const getAuditHistoryShape = {
  table: z.enum(AUDITED_TABLES).describe("Audited table name"),
  record_id: z.string().uuid(),
  limit: z.number().int().min(1).max(200).optional().describe("Max entries (default 50)"),
};

// ---------------------------------------------------------------- reports --

// Reports are COUNTS and conversions only — never money. Mirrors ReportSpec in
// src/lib/crm/reports.ts. Answers questions like "how many scenarios progressed
// to term sheet last quarter" (metric=stage_progression, target_stage=term_sheet).
export const reportMetricSchema = z
  .enum(["deals_submitted", "deals_by_stage", "deals_by_outcome", "stage_progression", "activity", "tasks_completed"])
  .describe(
    "deals_submitted (created in window) | deals_by_stage (current live) | deals_by_outcome (closed in window) | " +
      "stage_progression (distinct deals that ENTERED target_stage in window; requires target_stage) | activity (interactions) | " +
      "tasks_completed (tasks finished in window, grouped by linked person)",
  );

export const reportSpecShape = {
  metric: reportMetricSchema,
  from: isoDate.optional().describe("Window start (inclusive, YYYY-MM-DD); defaults to 90 days before `to`"),
  to: isoDate.optional().describe("Window end (inclusive, YYYY-MM-DD); defaults to today"),
  product: dealProductSchema.optional(),
  funder: dealFunderSchema.optional(),
  broker_id: z.string().uuid().optional().describe("Filter to a broker by UUID"),
  stage: pipelineStageSchema.optional(),
  interaction_type: interactionTypeSchema.optional().describe("For activity: filter to one interaction type"),
  target_stage: pipelineStageSchema.optional().describe("Required by stage_progression — the stage deals entered"),
  group_by: z.enum(["product", "broker", "type", "none"]).optional().describe("Grouping for deals_submitted / activity"),
};

export const runReportShape = {
  ...reportSpecShape,
  broker: idOrName.optional().describe("Convenience: resolve a broker by name into broker_id before running"),
};

export const saveReportShape = {
  name: savedReportInputSchema.shape.name,
  spec: z.object(reportSpecShape).describe("The report spec to persist and re-run"),
  pinned: z.boolean().optional().describe("Pin to the dashboard (max 3 pinned)"),
};

export const listReportsShape = {};

export const deleteReportShape = {
  id: z.string().uuid().describe("Saved report UUID"),
};

export const setReportPinnedShape = {
  id: z.string().uuid().describe("Saved report UUID"),
  pinned: z.boolean().describe("true to pin (max 3), false to unpin"),
};

// ----------------------------------------------------------- contact types --

export const listContactTypesShape = {};

export const addContactTypeShape = {
  name: z.string().trim().min(1).max(60).describe("New contact type name, e.g. Borrower / Referrer"),
  sort: z.number().int().min(0).max(9999).optional().describe("Display order (lower first)"),
};

// ---------------------------------------------------------------- helpers --

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

// Standard success payload: pretty-printed JSON in a single text block.
export function toJson(result: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
