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
import { BROKER_STAGE_LABELS, DEFAULT_CONTACT_TYPE } from "@/lib/domain";
// Suggest-only by contract: the MCP server never changes a broker's stage
// automatically — the suggestion is surfaced in the create_deal response.
import { suggestBrokerPromotion } from "@/lib/crm/stageSuggestions";
import {
  companyUpdateSchema,
  contactInputSchema,
  contactUpdateSchema,
  dealInputSchema,
  driveLinkInputSchema,
  guarantorInputSchema,
  interactionInputSchema,
  keyDateInputSchema,
  loseDealSchema,
  savedReportInputSchema,
  settleDealSchema,
  taskInputSchema,
} from "@/lib/schemas";
import {
  createContact,
  getContact,
  listBrokers,
  listContacts,
  resolveContactId,
  updateContact,
} from "@/lib/crm/contacts";
import {
  ensureCompanyByName,
  getCompany,
  listCompanies,
  resolveCompanyId,
  updateCompany,
} from "@/lib/crm/companies";
import { createDeal, getDeal, listDeals, resolveDealId, updateDeal } from "@/lib/crm/deals";
import { addGuarantor } from "@/lib/crm/guarantors";
import { createTask, listTasks, updateTask } from "@/lib/crm/tasks";
import { logInteraction } from "@/lib/crm/interactions";
import { addKeyDate, updateKeyDate } from "@/lib/crm/keyDates";
import { addDriveLink, listDriveLinks } from "@/lib/crm/driveLinks";
import { whatsDue } from "@/lib/crm/today";
import { runReport, type ReportSpec } from "@/lib/crm/reports";
import { createSavedReport, deleteSavedReport, listSavedReports, setPinned } from "@/lib/crm/savedReports";
import { addContactType, listContactTypes } from "@/lib/crm/contactTypes";
import { diffAuditEntry, listAuditLog } from "@/lib/crm/audit";
import {
  addContactTypeShape,
  addDriveLinkShape,
  addGuarantorShape,
  addKeyDateShape,
  completeKeyDateShape,
  completeTaskShape,
  createBrokerShape,
  createContactShape,
  createDealShape,
  createTaskShape,
  deleteReportShape,
  getAuditHistoryShape,
  getBrokerShape,
  getCompanyShape,
  getContactShape,
  getDealShape,
  listBrokersShape,
  listCompaniesShape,
  listContactsShape,
  listContactTypesShape,
  listDealsShape,
  listReportsShape,
  listTasksShape,
  logInteractionShape,
  loseDealShape,
  moveDealStageShape,
  runReportShape,
  saveReportShape,
  setReportPinnedShape,
  settleDealShape,
  toJson,
  updateBrokerShape,
  updateCompanyShape,
  updateContactShape,
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
  const server = new McpServer({ name: "via-os", version: "0.2.0" });
  // Audit metadata for inserts/updates. The DB coalesces these with
  // auth.uid(), which is null on service-role requests, so they win here.
  const created = { created_by: actorId, updated_by: actorId };
  const updated = { updated_by: actorId };

  // company_name is a NAME Claude typed — resolve it to a company record id
  // (find-or-create, case-insensitive) and strip it from the DB payload; the
  // contacts table only carries company_id. null clears the link on updates.
  async function resolveCompanyName<T extends { company_name?: string | null }>(
    input: T,
  ): Promise<Omit<T, "company_name"> & { company_id?: string | null }> {
    const { company_name, ...rest } = input;
    if (company_name === undefined) return rest;
    const companyId = await ensureCompanyByName(db, company_name, { created_by: actorId });
    return { ...rest, company_id: companyId };
  }

  // --------------------------------------------------------------- contacts --

  server.registerTool(
    "list_contacts",
    {
      description:
        "List contacts (any type) with live/total deal counts; filter by type, stage, location, overdue next actions, cold (no recent contact), or a fuzzy search.",
      inputSchema: listContactsShape,
    },
    guarded(async (args) => {
      const contacts = await listContacts(db, {
        stage: args.stage,
        type: args.type,
        location: args.location,
        overdueOnly: args.overdue_only,
        coldOnly: args.cold_only,
        search: args.search,
      });
      return toJson({ count: contacts.length, contacts });
    }),
  );

  server.registerTool(
    "get_contact",
    {
      description: "Fetch a contact by UUID or name: full record, deal counts, recent interactions, deals, and Drive links.",
      inputSchema: getContactShape,
    },
    guarded(async (args) => {
      const id = await resolveContactId(db, args.id_or_name);
      const [contact, driveLinks] = await Promise.all([getContact(db, id), listDriveLinks(db, "contact", id)]);
      if (!contact) throw new Error(`Contact not found: ${args.id_or_name}`);
      return toJson({ ...contact, drive_links: driveLinks });
    }),
  );

  server.registerTool(
    "create_contact",
    {
      description: "Create a contact of any type (defaults to Broker); accepts type, location, stage, and next-action fields.",
      inputSchema: createContactShape,
    },
    guarded(async (args) => {
      const input = await resolveCompanyName(contactInputSchema.parse(args));
      const contact = await createContact(db, { ...input, ...created });
      return toJson({ contact });
    }),
  );

  server.registerTool(
    "update_contact",
    {
      description: "Update fields on a contact — only the fields you pass — including type, location, and stage moves.",
      inputSchema: updateContactShape,
    },
    guarded(async (args) => {
      const { id_or_name, ...fields } = args;
      const id = await resolveContactId(db, id_or_name);
      const input = await resolveCompanyName(requireFields(definedOnly(contactUpdateSchema.parse(fields))));
      const contact = await updateContact(db, id, { ...input, ...updated });
      return toJson({ contact });
    }),
  );

  // --- Broker aliases (thin wrappers defaulting the contact type to Broker) --

  server.registerTool(
    "list_brokers",
    {
      description:
        "List Broker-type contacts with live/total deal counts; filter by stage, location, overdue next actions, cold, or search.",
      inputSchema: listBrokersShape,
    },
    guarded(async (args) => {
      const brokers = await listBrokers(db, {
        stage: args.stage,
        location: args.location,
        overdueOnly: args.overdue_only,
        coldOnly: args.cold_only,
        search: args.search,
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
      const id = await resolveContactId(db, args.id_or_name);
      const [broker, driveLinks] = await Promise.all([getContact(db, id), listDriveLinks(db, "contact", id)]);
      if (!broker) throw new Error(`Broker not found: ${args.id_or_name}`);
      return toJson({ ...broker, drive_links: driveLinks });
    }),
  );

  server.registerTool(
    "create_broker",
    {
      description: "Create a broker relationship record (a contact of type Broker).",
      inputSchema: createBrokerShape,
    },
    guarded(async (args) => {
      // Default the type to Broker; an explicit type still wins.
      const input = await resolveCompanyName(contactInputSchema.parse({ ...args, type: args.type ?? DEFAULT_CONTACT_TYPE }));
      const broker = await createContact(db, { ...input, ...created });
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
      const id = await resolveContactId(db, id_or_name);
      const input = await resolveCompanyName(requireFields(definedOnly(contactUpdateSchema.parse(fields))));
      const broker = await updateContact(db, id, { ...input, ...updated });
      return toJson({ broker });
    }),
  );

  // -------------------------------------------------------------- companies --
  // Companies are auto-created from typed names and email domains — these
  // tools never create one directly; update_company patches details only.

  server.registerTool(
    "list_companies",
    {
      description: "List companies (auto-created org records) with people counts; optionally filter by a (partial) name.",
      inputSchema: listCompaniesShape,
    },
    guarded(async (args) => {
      const companies = await listCompanies(db, { search: args.search });
      return toJson({ count: companies.length, companies });
    }),
  );

  server.registerTool(
    "get_company",
    {
      description:
        "Fetch a company by UUID or name: the org record, its people, org-wide interactions (everything logged against anyone at the company), and deals.",
      inputSchema: getCompanyShape,
    },
    guarded(async (args) => {
      const id = await resolveCompanyId(db, args.id_or_name);
      const company = await getCompany(db, id);
      if (!company) throw new Error(`Company not found: ${args.id_or_name}`);
      return toJson(company);
    }),
  );

  server.registerTool(
    "update_company",
    {
      description: "Update fields on a company — only the fields you pass (name, domain, location, notes).",
      inputSchema: updateCompanyShape,
    },
    guarded(async (args) => {
      const { id_or_name, ...fields } = args;
      const id = await resolveCompanyId(db, id_or_name);
      const input = requireFields(definedOnly(companyUpdateSchema.parse(fields)));
      const company = await updateCompany(db, id, { ...input, ...updated });
      return toJson({ company });
    }),
  );

  server.registerTool(
    "log_interaction",
    {
      description:
        "Log an email/call/meeting/note against a contact (optionally linked to a deal); bumps their last-contact date.",
      inputSchema: logInteractionShape,
    },
    guarded(async (args) => {
      const contactId = await resolveContactId(db, args.contact);
      const dealId = args.deal ? await resolveDealId(db, args.deal) : null;
      const input = interactionInputSchema.parse({
        broker_id: contactId,
        deal_id: dealId,
        type: args.type,
        summary: args.summary,
        occurred_at: args.date ?? undefined,
      });
      const interaction = await logInteraction(db, { ...input, ...created });
      return toJson({ interaction, note: "Contact last_contact_date bumped automatically." });
    }),
  );

  // ------------------------------------------------------------------ deals --

  server.registerTool(
    "list_deals",
    {
      description: "List deals (most recently updated first); filter by status (live|settled|lost), pipeline stage, funder, or broker.",
      inputSchema: listDealsShape,
    },
    guarded(async (args) => {
      const brokerId = args.broker ? await resolveContactId(db, args.broker) : undefined;
      const deals = await listDeals(db, {
        status: args.status,
        pipelineStage: args.pipeline_stage,
        funder: args.funder,
        brokerId,
      });
      return toJson({ count: deals.length, deals });
    }),
  );

  server.registerTool(
    "get_deal",
    {
      description: "Fetch a deal by UUID or name: full record, broker, guarantors, key dates, and Drive links.",
      inputSchema: getDealShape,
    },
    guarded(async (args) => {
      const id = await resolveDealId(db, args.id_or_name);
      const deal = await getDeal(db, id);
      if (!deal) throw new Error(`Deal not found: ${args.id_or_name}`);
      return toJson(deal);
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
      const brokerId = await resolveContactId(db, broker);
      const input = dealInputSchema.parse({ ...fields, broker_id: brokerId });
      const deal = await createDeal(db, { ...input, ...created });

      // Promotion hint is best-effort advice, never an action.
      let promotionHint: string | null = null;
      try {
        const b = await getContact(db, brokerId);
        if (!b) throw new Error("broker vanished");
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
      const input = requireFields(definedOnly(dealInputSchema.partial().parse(fields)));
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
      const { settlement_date, loan_term_months } = settleDealSchema.parse(args);
      // Mirrors settleDeal() exactly (status flip + stage + dates; DB trigger
      // derives maturity_date), adding the audit actor which the wrapper
      // doesn't accept. No financial arithmetic happens anywhere here.
      const deal = await updateDeal(db, id, {
        status: "settled",
        pipeline_stage: "settlement",
        settlement_date,
        loan_term_months,
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
    "lose_deal",
    {
      description: "Close / lose a deal with a required loss reason (the database enforces lost ⇔ reason).",
      inputSchema: loseDealShape,
    },
    guarded(async (args) => {
      const id = await resolveDealId(db, args.id_or_name);
      const { loss_reason } = loseDealSchema.parse({ loss_reason: args.loss_reason });
      // Mirrors loseDeal() exactly, adding the audit actor.
      const deal = await updateDeal(db, id, { status: "lost", loss_reason, ...updated });
      return toJson({ deal });
    }),
  );

  // ------------------------------------------------------------- guarantors --

  server.registerTool(
    "add_guarantor",
    {
      description: "Add a guarantor to a deal (max 3 per deal, enforced). Others are visible via get_deal.",
      inputSchema: addGuarantorShape,
    },
    guarded(async (args) => {
      const { deal, ...fields } = args;
      const dealId = await resolveDealId(db, deal);
      const input = guarantorInputSchema.parse({ ...fields, deal_id: dealId });
      const guarantor = await addGuarantor(db, { ...input, ...created });
      return toJson({ guarantor });
    }),
  );

  // ------------------------------------------------------------------ tasks --

  server.registerTool(
    "list_tasks",
    {
      description: "List tasks (soonest due first); filter to open only and/or a specific contact or deal.",
      inputSchema: listTasksShape,
    },
    guarded(async (args) => {
      const contactId = args.contact ? await resolveContactId(db, args.contact) : undefined;
      const dealId = args.deal ? await resolveDealId(db, args.deal) : undefined;
      const tasks = await listTasks(db, { openOnly: args.open_only, contactId, dealId });
      return toJson({ count: tasks.length, tasks });
    }),
  );

  server.registerTool(
    "create_task",
    {
      description: "Create a task, optionally due-dated and linked to a contact and/or deal.",
      inputSchema: createTaskShape,
    },
    guarded(async (args) => {
      const contactId = args.contact ? await resolveContactId(db, args.contact) : null;
      const dealId = args.deal ? await resolveDealId(db, args.deal) : null;
      const input = taskInputSchema.parse({
        title: args.title,
        notes: args.notes,
        due_date: args.due_date,
        contact_id: contactId,
        deal_id: dealId,
      });
      const task = await createTask(db, { ...input, ...created });
      return toJson({ task });
    }),
  );

  server.registerTool(
    "complete_task",
    {
      description: "Mark a task complete (or reopen it with completed=false).",
      inputSchema: completeTaskShape,
    },
    guarded(async (args) => {
      // completeTask() is this same one-field update, minus the audit actor;
      // completed_at is stamped/cleared by the DB trigger.
      const task = await updateTask(db, args.task_id, { completed: args.completed ?? true, ...updated });
      return toJson({ task });
    }),
  );

  // ---------------------------------------------------- key dates and links --

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
      description: "Attach a Google Drive URL to a deal or contact (link only — the CRM never touches files).",
      inputSchema: addDriveLinkShape,
    },
    guarded(async (args) => {
      const parentId =
        args.parent_type === "contact"
          ? await resolveContactId(db, args.parent)
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

  // -------------------------------------------------------------- overviews --

  server.registerTool(
    "whats_due",
    {
      description:
        "The morning screen: overdue next actions, upcoming key dates, cold brokers, open tasks, and live deal counts by stage.",
      inputSchema: whatsDueShape,
    },
    guarded(async (args) => {
      const data = await whatsDue(db, { daysAhead: args.days_ahead, coldAfterDays: args.cold_after_days });
      return toJson(data);
    }),
  );

  // ---------------------------------------------------------------- reports --

  server.registerTool(
    "run_report",
    {
      description:
        "Run a COUNTS/conversions report (never money). Metrics: deals_submitted, deals_by_stage, deals_by_outcome, stage_progression (requires target_stage), activity. Answers e.g. 'how many scenarios progressed to term sheet last quarter'.",
      inputSchema: runReportShape,
    },
    guarded(async (args) => {
      const { broker, ...rest } = args;
      const spec: ReportSpec = { ...rest };
      if (broker) spec.broker_id = await resolveContactId(db, broker);
      const result = await runReport(db, spec);
      return toJson(result);
    }),
  );

  server.registerTool(
    "save_report",
    {
      description: "Persist a report spec by name so it can be re-run or pinned to the dashboard (max 3 pinned).",
      inputSchema: saveReportShape,
    },
    guarded(async (args) => {
      const input = savedReportInputSchema.parse({ name: args.name, spec: args.spec, pinned: args.pinned });
      const report = await createSavedReport(db, { ...input, ...created });
      return toJson({ report });
    }),
  );

  server.registerTool(
    "list_reports",
    { description: "List saved reports (pinned and unpinned), in display order.", inputSchema: listReportsShape },
    guarded(async () => {
      const reports = await listSavedReports(db);
      return toJson({ count: reports.length, reports });
    }),
  );

  server.registerTool(
    "delete_report",
    { description: "Delete a saved report by id.", inputSchema: deleteReportShape },
    guarded(async (args) => {
      await deleteSavedReport(db, args.id);
      return toJson({ ok: true, id: args.id });
    }),
  );

  server.registerTool(
    "set_report_pinned",
    {
      description: "Pin or unpin a saved report on the dashboard (at most 3 pinned at once).",
      inputSchema: setReportPinnedShape,
    },
    guarded(async (args) => {
      const report = await setPinned(db, args.id, args.pinned);
      return toJson({ report });
    }),
  );

  // ----------------------------------------------------------- contact types --

  server.registerTool(
    "list_contact_types",
    { description: "List the contact type lookup values (Broker, Borrower, …) in display order.", inputSchema: listContactTypesShape },
    guarded(async () => {
      const types = await listContactTypes(db);
      return toJson({ count: types.length, contact_types: types });
    }),
  );

  server.registerTool(
    "add_contact_type",
    { description: "Add a new contact type value (extends the lookup without code).", inputSchema: addContactTypeShape },
    guarded(async (args) => {
      const contactType = await addContactType(db, args.name.trim(), args.sort);
      return toJson({ contact_type: contactType });
    }),
  );

  // ------------------------------------------------------------------ audit --

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
