// MCP tool input shapes — plain objects of Zod fields (Zod "raw shapes").
// The MCP SDK builds each tool's JSON Schema from these, and tests can
// validate them via z.object(shape). Field validators are composed from
// src/lib/schemas.ts wherever possible so the MCP boundary accepts exactly
// what the UI boundary accepts; server.ts additionally re-parses every write
// through the canonical object schemas before touching the database.
import { z } from "zod";
import {
  brokerInputSchema,
  brokerStageSchema,
  brokerUpdateSchema,
  dealFunderSchema,
  dealInputSchema,
  dealStatusSchema,
  dealUpdateSchema,
  driveLinkInputSchema,
  interactionInputSchema,
  interactionTypeSchema,
  keyDateInputSchema,
  linkParentTypeSchema,
  pipelineStageSchema,
  settleDealSchema,
} from "@/lib/schemas";
import { AUDITED_TABLES } from "@/lib/crm/audit";

// UUID or a (partial) name; resolveBrokerId/resolveDealId throw a helpful
// candidate list when the name is ambiguous, so Claude can disambiguate.
const idOrName = z.string().trim().min(1);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD)")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Not a real date");

// ---------------------------------------------------------------- brokers --

export const listBrokersShape = {
  stage: brokerStageSchema.optional().describe("Filter by relationship stage"),
  overdue_only: z.boolean().optional().describe("Only brokers whose next action is due today or overdue"),
  cold_only: z.boolean().optional().describe("Only brokers with no contact for 30+ days (or never)"),
};

export const getBrokerShape = {
  id_or_name: idOrName.describe("Broker UUID or (partial) name"),
};

export const createBrokerShape = { ...brokerInputSchema.shape };

export const updateBrokerShape = {
  id_or_name: idOrName.describe("Broker UUID or (partial) name"),
  ...brokerUpdateSchema.shape,
};

export const logInteractionShape = {
  broker: idOrName.describe("Broker UUID or (partial) name"),
  type: interactionTypeSchema,
  summary: interactionInputSchema.shape.summary,
  date: isoDate.optional().describe("When it happened (YYYY-MM-DD); defaults to now"),
  deal: idOrName.optional().describe("Optionally link to a deal (UUID or partial name)"),
};

// ------------------------------------------------------------------ deals --

export const listDealsShape = {
  status: dealStatusSchema.optional(),
  pipeline_stage: pipelineStageSchema.optional(),
  funder: dealFunderSchema.optional(),
};

export const getDealShape = {
  id_or_name: idOrName.describe("Deal UUID or (partial) name"),
};

export const createDealShape = {
  broker: idOrName.describe("Introducing broker — UUID or (partial) name"),
  ...dealInputSchema.omit({ broker_id: true }).shape,
};

export const updateDealShape = {
  id_or_name: idOrName.describe("Deal UUID or (partial) name"),
  ...dealUpdateSchema.omit({ broker_id: true }).shape,
};

export const moveDealStageShape = {
  id_or_name: idOrName.describe("Deal UUID or (partial) name"),
  stage: pipelineStageSchema,
};

export const settleDealShape = {
  id_or_name: idOrName.describe("Deal UUID or (partial) name"),
  ...settleDealSchema.shape,
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
  parent_type: linkParentTypeSchema,
  parent: idOrName.describe("Parent record — broker or deal UUID or (partial) name, per parent_type"),
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

// ---------------------------------------------------------------- helpers --

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

// Standard success payload: pretty-printed JSON in a single text block.
export function toJson(result: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
