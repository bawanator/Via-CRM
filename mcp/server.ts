// Vía OS MCP server — the full CRM control surface for Claude, over stdio.
//
//   npm run mcp        (tsx resolves the @/* tsconfig path alias)
//
// Every write goes through the SAME src/lib/crm functions as the UI, on a
// service-role client tagged source="mcp", so the audit trail attributes each
// change to this channel. The actor (created_by/updated_by) is resolved once
// at startup from MCP_ACTOR_EMAIL because service-role requests have no
// auth.uid() for the DB to fall back on.
//
// Protocol note: stdout belongs to the stdio transport. Never console.log —
// all diagnostics go to stderr via console.error.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// quiet: dotenv v17 prints an "injected env" banner to stdout by default,
// which would corrupt the stdio JSON-RPC stream.
config({ path: path.join(REPO_ROOT, ".env.local"), quiet: true });
config({ path: path.join(REPO_ROOT, ".env"), quiet: true });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Db } from "@/lib/crm/db";
import { BROKER_STAGE_LABELS } from "@/lib/domain";
// Suggest-only by contract: the MCP server never changes a broker's stage
// automatically — the suggestion is surfaced in the create_deal response.
import { suggestBrokerPromotion } from "@/lib/crm/stageSuggestions";
import {
  brokerInputSchema,
  brokerUpdateSchema,
  dealInputSchema,
  dealUpdateSchema,
  driveLinkInputSchema,
  interactionInputSchema,
  keyDateInputSchema,
} from "@/lib/schemas";
import { createBroker, getBroker, listBrokers, resolveBrokerId, updateBroker } from "@/lib/crm/brokers";
import { createDeal, getDeal, listDeals, resolveDealId, updateDeal } from "@/lib/crm/deals";
import { logInteraction } from "@/lib/crm/interactions";
import { addKeyDate, updateKeyDate } from "@/lib/crm/keyDates";
import { addDriveLink, listDriveLinks } from "@/lib/crm/driveLinks";
import { whatsDue } from "@/lib/crm/today";
import { diffAuditEntry, listAuditLog } from "@/lib/crm/audit";
import {
  addDriveLinkShape,
  addKeyDateShape,
  completeKeyDateShape,
  createBrokerShape,
  createDealShape,
  getAuditHistoryShape,
  getBrokerShape,
  getDealShape,
  listBrokersShape,
  listDealsShape,
  logInteractionShape,
  moveDealStageShape,
  settleDealShape,
  toJson,
  updateBrokerShape,
  updateDealShape,
  whatsDueShape,
  type ToolResult,
} from "./schemas";

// ---------------------------------------------------------------- helpers --

function toError(err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

// Wrap a handler so failures come back as isError tool results, never throws.
function guarded<A>(fn: (args: A) => Promise<ToolResult>): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (err) {
      return toError(err);
    }
  };
}

// Drop keys whose value is undefined so partial updates only touch the
// fields Claude actually provided (null is meaningful: it clears a field).
function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function requireFields<T extends Record<string, unknown>>(input: T): T {
  if (Object.keys(input).length === 0) throw new Error("No fields provided to update");
  return input;
}

// Resolve MCP_ACTOR_EMAIL to an auth user id so writes are attributed to
// Harry rather than to nobody (service role has no auth.uid()).
async function resolveActorId(db: Db): Promise<string | null> {
  const email = process.env.MCP_ACTOR_EMAIL;
  if (!email) {
    console.error("via-os mcp: MCP_ACTOR_EMAIL is not set — writes will not be attributed to a user.");
    return null;
  }
  const { data, error } = await db.auth.admin.listUsers({ perPage: 200 });
  if (error) {
    console.error(`via-os mcp: could not list auth users (${error.message}) — continuing without an actor.`);
    return null;
  }
  const match = data.users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
  if (!match) {
    console.error(`via-os mcp: no auth user matches MCP_ACTOR_EMAIL "${email}" — continuing without an actor.`);
    return null;
  }
  return match.id;
}

// ------------------------------------------------------------------ tools --

function buildServer(db: Db, actorId: string | null): McpServer {
  const server = new McpServer({ name: "via-os", version: "0.1.0" });
  // Audit metadata for inserts/updates. The DB coalesces these with
  // auth.uid(), which is null on service-role requests, so they win here.
  const created = { created_by: actorId, updated_by: actorId };
  const updated = { updated_by: actorId };

  server.registerTool(
    "list_brokers",
    {
      description:
        "List brokers with live/total deal counts; filter by stage, overdue next actions, or cold (no recent contact).",
      inputSchema: listBrokersShape,
    },
    guarded(async (args) => {
      const brokers = await listBrokers(db, {
        stage: args.stage,
        overdueOnly: args.overdue_only,
        coldOnly: args.cold_only,
      });
      return toJson({ count: brokers.length, brokers });
    }),
  );

  server.registerTool(
    "get_broker",
    {
      description: "Fetch a broker by UUID or name: full record, recent interactions, deals, and Drive links.",
      inputSchema: getBrokerShape,
    },
    guarded(async (args) => {
      const id = await resolveBrokerId(db, args.id_or_name);
      const [broker, driveLinks] = await Promise.all([getBroker(db, id), listDriveLinks(db, "broker", id)]);
      return toJson({ ...broker, drive_links: driveLinks });
    }),
  );

  server.registerTool(
    "create_broker",
    { description: "Create a broker relationship record.", inputSchema: createBrokerShape },
    guarded(async (args) => {
      const input = brokerInputSchema.parse(args);
      const broker = await createBroker(db, { ...input, ...created });
      return toJson({ broker });
    }),
  );

  server.registerTool(
    "update_broker",
    {
      description: "Update fields on a broker — only the fields you pass — including stage moves.",
      inputSchema: updateBrokerShape,
    },
    guarded(async (args) => {
      const { id_or_name, ...fields } = args;
      const id = await resolveBrokerId(db, id_or_name);
      const input = requireFields(definedOnly(brokerUpdateSchema.parse(fields)));
      const broker = await updateBroker(db, id, { ...input, ...updated });
      return toJson({ broker });
    }),
  );

  server.registerTool(
    "log_interaction",
    {
      description:
        "Log an email/call/meeting/note against a broker (optionally linked to a deal); bumps their last-contact date.",
      inputSchema: logInteractionShape,
    },
    guarded(async (args) => {
      const brokerId = await resolveBrokerId(db, args.broker);
      const dealId = args.deal ? await resolveDealId(db, args.deal) : null;
      const input = interactionInputSchema.parse({
        broker_id: brokerId,
        deal_id: dealId,
        type: args.type,
        summary: args.summary,
        occurred_at: args.date ?? undefined,
      });
      const interaction = await logInteraction(db, { ...input, ...created });
      return toJson({ interaction, note: "Broker last_contact_date bumped automatically." });
    }),
  );

  server.registerTool(
    "list_deals",
    {
      description: "List deals (most recently updated first); filter by status, pipeline stage, or funder.",
      inputSchema: listDealsShape,
    },
    guarded(async (args) => {
      const deals = await listDeals(db, {
        status: args.status,
        pipelineStage: args.pipeline_stage,
        funder: args.funder,
      });
      return toJson({ count: deals.length, deals });
    }),
  );

  server.registerTool(
    "get_deal",
    {
      description: "Fetch a deal by UUID or name: full record, broker, key dates, and Drive links.",
      inputSchema: getDealShape,
    },
    guarded(async (args) => {
      const id = await resolveDealId(db, args.id_or_name);
      return toJson(await getDeal(db, id));
    }),
  );

  server.registerTool(
    "create_deal",
    {
      description:
        "Create a deal under a broker; the response may include a broker stage promotion suggestion (never applied automatically).",
      inputSchema: createDealShape,
    },
    guarded(async (args) => {
      const { broker, ...fields } = args;
      const brokerId = await resolveBrokerId(db, broker);
      const input = dealInputSchema.parse({ ...fields, broker_id: brokerId });
      const deal = await createDeal(db, { ...input, ...created });

      // Promotion hint is best-effort advice, never an action.
      let promotionHint: string | null = null;
      try {
        const b = await getBroker(db, brokerId);
        const suggestion = suggestBrokerPromotion({
          currentStage: b.stage,
          totalDealsSubmitted: b.total_deals_submitted,
          liveDealCount: b.live_deal_count,
        });
        if (suggestion) {
          promotionHint =
            `${b.full_name} is currently "${BROKER_STAGE_LABELS[b.stage]}" — ${suggestion.reason.toLowerCase()} — ` +
            `consider update_broker with stage "${suggestion.to}" (${BROKER_STAGE_LABELS[suggestion.to]}). ` +
            "Stage changes are never automatic.";
        }
      } catch (err) {
        console.error("via-os mcp: promotion hint skipped:", err instanceof Error ? err.message : err);
      }
      return toJson({ deal, promotion_hint: promotionHint });
    }),
  );

  server.registerTool(
    "update_deal",
    { description: "Update fields on a deal — only the fields you pass.", inputSchema: updateDealShape },
    guarded(async (args) => {
      const { id_or_name, ...fields } = args;
      const id = await resolveDealId(db, id_or_name);
      const input = requireFields(definedOnly(dealUpdateSchema.parse(fields)));
      const deal = await updateDeal(db, id, { ...input, ...updated });
      return toJson({ deal });
    }),
  );

  server.registerTool(
    "move_deal_stage",
    { description: "Move a deal to another pipeline stage (explicit, no drag-and-drop).", inputSchema: moveDealStageShape },
    guarded(async (args) => {
      const id = await resolveDealId(db, args.id_or_name);
      // Mirrors moveDealStage() exactly; goes via updateDeal directly so the
      // audit actor travels with the write (the wrapper doesn't thread it).
      const deal = await updateDeal(db, id, { pipeline_stage: args.stage, ...updated });
      return toJson({ deal });
    }),
  );

  server.registerTool(
    "settle_deal",
    {
      description: "Mark a deal settled with settlement date and term; the database derives the maturity date.",
      inputSchema: settleDealShape,
    },
    guarded(async (args) => {
      const id = await resolveDealId(db, args.id_or_name);
      // Mirrors settleDeal() exactly (status flip + stage + dates; DB trigger
      // derives maturity_date), adding the audit actor which the wrapper
      // doesn't accept. No financial arithmetic happens anywhere here.
      const deal = await updateDeal(db, id, {
        status: "settled",
        pipeline_stage: "settlement",
        settlement_date: args.settlement_date,
        loan_term_months: args.loan_term_months,
        ...updated,
      });
      return toJson({
        deal,
        maturity_date: deal.maturity_date,
        note: deal.maturity_date
          ? `Maturity derived by the database: ${deal.maturity_date}.`
          : "Maturity date not yet derived.",
      });
    }),
  );

  server.registerTool(
    "add_key_date",
    { description: "Add a key date (dated reminder) to a deal.", inputSchema: addKeyDateShape },
    guarded(async (args) => {
      const dealId = await resolveDealId(db, args.deal);
      const input = keyDateInputSchema.parse({
        deal_id: dealId,
        label: args.label,
        due_date: args.due_date,
        remind_days_before: args.remind_days_before,
      });
      const keyDate = await addKeyDate(db, { ...input, ...created });
      return toJson({ key_date: keyDate });
    }),
  );

  server.registerTool(
    "complete_key_date",
    {
      description: "Mark a key date complete (or reopen it with completed=false).",
      inputSchema: completeKeyDateShape,
    },
    guarded(async (args) => {
      // completeKeyDate() is this same one-field update, minus the audit actor.
      const keyDate = await updateKeyDate(db, args.key_date_id, { completed: args.completed ?? true, ...updated });
      return toJson({ key_date: keyDate });
    }),
  );

  server.registerTool(
    "add_drive_link",
    {
      description: "Attach a Google Drive URL to a broker or deal (link only — the CRM never touches files).",
      inputSchema: addDriveLinkShape,
    },
    guarded(async (args) => {
      const parentId =
        args.parent_type === "broker"
          ? await resolveBrokerId(db, args.parent)
          : await resolveDealId(db, args.parent);
      const input = driveLinkInputSchema.parse({
        parent_type: args.parent_type,
        parent_id: parentId,
        label: args.label,
        url: args.url,
      });
      const link = await addDriveLink(db, { ...input, ...created });
      return toJson({ drive_link: link });
    }),
  );

  server.registerTool(
    "whats_due",
    {
      description:
        "The morning screen: overdue next actions, upcoming key dates, cold brokers, and live deal counts by stage.",
      inputSchema: whatsDueShape,
    },
    guarded(async (args) => {
      const data = await whatsDue(db, { daysAhead: args.days_ahead, coldAfterDays: args.cold_after_days });
      return toJson(data);
    }),
  );

  server.registerTool(
    "get_audit_history",
    {
      description: "Audit trail for a record, with field-level before/after changes per entry.",
      inputSchema: getAuditHistoryShape,
    },
    guarded(async (args) => {
      const entries = await listAuditLog(db, {
        tableName: args.table,
        recordId: args.record_id,
        limit: args.limit ?? 50,
      });
      const history = entries.map((entry) => ({
        id: entry.id,
        action: entry.action,
        changed_at: entry.changed_at,
        changed_by: entry.changed_by,
        source: entry.source,
        changes: diffAuditEntry(entry),
      }));
      return toJson({ table: args.table, record_id: args.record_id, count: history.length, entries: history });
    }),
  );

  return server;
}

// ------------------------------------------------------------------- main --

async function main(): Promise<void> {
  const db = createAdminClient("mcp");
  const actorId = await resolveActorId(db);
  const server = buildServer(db, actorId);
  await server.connect(new StdioServerTransport());
  console.error(
    `via-os mcp: ready on stdio (${actorId ? `actor ${process.env.MCP_ACTOR_EMAIL}` : "no actor"}, source=mcp)`,
  );
}

process.on("uncaughtException", (err) => {
  console.error("via-os mcp: uncaught exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("via-os mcp: unhandled rejection:", reason);
});

main().catch((err) => {
  console.error("via-os mcp: failed to start:", err);
  process.exit(1);
});
