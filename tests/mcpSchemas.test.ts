// Every MCP tool input shape must be a valid Zod raw shape: z.object(shape)
// has to accept a realistic tool call and reject a clearly-invalid one
// (wrong enum member, missing required field). A completeness check keeps
// this suite honest — adding a new shape to mcp/schemas.ts without a test
// case here fails the build.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as mcpSchemas from "../mcp/schemas";

const UUID = "5f0c3a1e-2b4d-4c6e-9f8a-1234567890ab";

type ShapeCase = { shape: z.ZodRawShape; valid: unknown; invalid: unknown };

const cases: Record<string, ShapeCase> = {
  // --- contacts ---
  listContactsShape: {
    shape: mcpSchemas.listContactsShape,
    valid: { type: "Broker", location: "Melbourne", overdue_only: true },
    invalid: { stage: "vip" }, // not a broker stage
  },
  getContactShape: {
    shape: mcpSchemas.getContactShape,
    valid: { id_or_name: "Jane" },
    invalid: {}, // missing required id_or_name
  },
  createContactShape: {
    shape: mcpSchemas.createContactShape,
    valid: { full_name: "Sam Solicitor", type: "Solicitor", location: "Sydney", email: "sam@law.com.au" },
    invalid: { full_name: "Sam", stage: "vip" },
  },
  updateContactShape: {
    shape: mcpSchemas.updateContactShape,
    valid: { id_or_name: "Sam", location: "Brisbane" },
    invalid: { location: "Brisbane" }, // missing required id_or_name
  },
  listBrokersShape: {
    shape: mcpSchemas.listBrokersShape,
    valid: { stage: "prime", overdue_only: true },
    invalid: { stage: "vip" }, // not a broker stage
  },
  getBrokerShape: {
    shape: mcpSchemas.getBrokerShape,
    valid: { id_or_name: "Jane" },
    invalid: {}, // missing required id_or_name
  },
  createBrokerShape: {
    shape: mcpSchemas.createBrokerShape,
    // company_name is a NAME the server resolves via ensureCompanyByName.
    valid: { full_name: "Jane O'Brien", email: "jane@brokerco.com.au", stage: "engaged", company_name: "BrokerCo" },
    invalid: { full_name: "Jane", stage: "vip" },
  },
  updateBrokerShape: {
    shape: mcpSchemas.updateBrokerShape,
    valid: { id_or_name: "Jane", next_action: "Send term sheet" },
    invalid: { next_action: "Send term sheet" }, // missing required id_or_name
  },
  // --- companies ---
  listCompaniesShape: {
    shape: mcpSchemas.listCompaniesShape,
    valid: { search: "Aria" },
    invalid: { search: "" }, // min(1) after trim
  },
  getCompanyShape: {
    shape: mcpSchemas.getCompanyShape,
    valid: { id_or_name: "Aria Capital" },
    invalid: {}, // missing required id_or_name
  },
  updateCompanyShape: {
    shape: mcpSchemas.updateCompanyShape,
    valid: { id_or_name: "Aria Capital", domain: "ariacapital.com.au", location: "Melbourne" },
    invalid: { id_or_name: "Aria Capital", domain: "not a domain!!" }, // fails the domain regex
  },
  logInteractionShape: {
    shape: mcpSchemas.logInteractionShape,
    valid: { contact: "Jane", type: "call", summary: "Discussed the Smith St scenario", date: "2025-06-04" },
    invalid: { contact: "Jane", type: "sms", summary: "x" }, // not an interaction type
  },
  // --- deals ---
  listDealsShape: {
    shape: mcpSchemas.listDealsShape,
    valid: { status: "live", pipeline_stage: "credit" },
    invalid: { status: "open" }, // not a deal status
  },
  getDealShape: {
    shape: mcpSchemas.getDealShape,
    valid: { id_or_name: "12 Smith St" },
    invalid: {}, // missing required id_or_name
  },
  createDealShape: {
    shape: mcpSchemas.createDealShape,
    valid: { broker: "Jane", name: "12 Smith St bridge", loan_amount: "1,500,000", product: "bridging" },
    invalid: { name: "No broker given" }, // missing required broker
  },
  updateDealShape: {
    shape: mcpSchemas.updateDealShape,
    valid: { id_or_name: "12 Smith St", funder: "funder_1" },
    invalid: { id_or_name: "12 Smith St", funder: "big_bank" }, // not a funder code
  },
  moveDealStageShape: {
    shape: mcpSchemas.moveDealStageShape,
    valid: { id_or_name: "12 Smith St", stage: "term_sheet" },
    invalid: { id_or_name: "12 Smith St", stage: "enquiry" }, // dropped stage
  },
  settleDealShape: {
    shape: mcpSchemas.settleDealShape,
    valid: { id_or_name: "12 Smith St", settlement_date: "2025-08-29", loan_term_months: 6 },
    invalid: { id_or_name: "12 Smith St", settlement_date: "2025-08-29", loan_term_months: 0 },
  },
  loseDealShape: {
    shape: mcpSchemas.loseDealShape,
    valid: { id_or_name: "12 Smith St", loss_reason: "lost_to_competitor" },
    invalid: { id_or_name: "12 Smith St", loss_reason: "changed_mind" }, // not a loss reason
  },
  // --- guarantors ---
  addGuarantorShape: {
    shape: mcpSchemas.addGuarantorShape,
    valid: { deal: "12 Smith St", full_name: "Pat Guarantor", email: "pat@x.com" },
    invalid: { deal: "12 Smith St" }, // missing required full_name
  },
  // --- tasks ---
  listTasksShape: {
    shape: mcpSchemas.listTasksShape,
    valid: { open_only: true, contact: "Jane" },
    invalid: { open_only: "yes" }, // not a boolean
  },
  createTaskShape: {
    shape: mcpSchemas.createTaskShape,
    valid: { title: "Chase valuation", due_date: "2025-06-10", deal: "12 Smith St" },
    invalid: {}, // missing required title
  },
  completeTaskShape: {
    shape: mcpSchemas.completeTaskShape,
    valid: { task_id: UUID, completed: false },
    invalid: { task_id: "not-a-uuid" },
  },
  // --- key dates & links ---
  addKeyDateShape: {
    shape: mcpSchemas.addKeyDateShape,
    valid: { deal: "12 Smith St", label: "First interest payment", due_date: "2025-09-30" },
    invalid: { deal: "12 Smith St", label: "Payment", due_date: "next month" },
  },
  completeKeyDateShape: {
    shape: mcpSchemas.completeKeyDateShape,
    valid: { key_date_id: UUID, completed: false },
    invalid: { key_date_id: "not-a-uuid" },
  },
  addDriveLinkShape: {
    shape: mcpSchemas.addDriveLinkShape,
    valid: { parent_type: "contact", parent: "Jane", label: "ID document", url: "https://drive.google.com/x" },
    invalid: { parent_type: "folder", parent: "Jane", label: "ID", url: "https://drive.google.com/x" },
  },
  // --- today & audit ---
  whatsDueShape: {
    shape: mcpSchemas.whatsDueShape,
    valid: { days_ahead: 14, cold_after_days: 30 },
    invalid: { days_ahead: 9999 }, // max 365
  },
  getAuditHistoryShape: {
    shape: mcpSchemas.getAuditHistoryShape,
    valid: { table: "contacts", record_id: UUID, limit: 20 },
    invalid: { table: "audit_log", record_id: UUID }, // audit_log itself is not audited
  },
  // --- reports ---
  reportSpecShape: {
    shape: mcpSchemas.reportSpecShape,
    valid: { metric: "stage_progression", target_stage: "term_sheet", from: "2025-01-01", to: "2025-03-31" },
    invalid: { metric: "revenue" }, // not a supported metric
  },
  runReportShape: {
    shape: mcpSchemas.runReportShape,
    valid: { metric: "deals_submitted", group_by: "product" },
    invalid: { metric: "revenue" },
  },
  saveReportShape: {
    shape: mcpSchemas.saveReportShape,
    valid: { name: "Deals submitted (90d)", spec: { metric: "deals_submitted" }, pinned: true },
    invalid: { spec: { metric: "deals_submitted" } }, // missing required name
  },
  deleteReportShape: {
    shape: mcpSchemas.deleteReportShape,
    valid: { id: UUID },
    invalid: { id: "not-a-uuid" },
  },
  setReportPinnedShape: {
    shape: mcpSchemas.setReportPinnedShape,
    valid: { id: UUID, pinned: true },
    invalid: { id: UUID }, // missing required pinned
  },
  // --- contact types ---
  addContactTypeShape: {
    shape: mcpSchemas.addContactTypeShape,
    valid: { name: "Referrer" },
    invalid: {}, // missing required name
  },
};

describe("mcp tool input shapes", () => {
  for (const [name, { shape, valid, invalid }] of Object.entries(cases)) {
    describe(name, () => {
      it("accepts a valid tool call", () => {
        const result = z.object(shape).safeParse(valid);
        expect(result.success, result.success ? undefined : z.prettifyError(result.error)).toBe(true);
      });

      it("rejects a clearly-invalid tool call", () => {
        expect(z.object(shape).safeParse(invalid).success).toBe(false);
      });
    });
  }

  it("covers every shape exported from mcp/schemas.ts", () => {
    const isRawShape = (value: unknown): value is z.ZodRawShape =>
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Object.values(value).length > 0 &&
      Object.values(value).every((field) => field instanceof z.ZodType);

    const exportedShapes = Object.entries(mcpSchemas)
      .filter(([, value]) => isRawShape(value))
      .map(([name]) => name)
      .sort();

    expect(exportedShapes).toEqual(Object.keys(cases).sort());
  });

  it("normalises through the shared field schemas (same rules as the UI boundary)", () => {
    const created = z.object(mcpSchemas.createBrokerShape).parse({ full_name: "Jane", email: "JANE@X.COM" });
    expect(created.email).toBe("jane@x.com");

    const deal = z.object(mcpSchemas.createDealShape).parse({ broker: "Jane", name: "Deal", loan_amount: "1,500,000" });
    expect(deal.loan_amount).toBe(1_500_000);

    const keyDate = z
      .object(mcpSchemas.addKeyDateShape)
      .parse({ deal: "12 Smith St", label: "Maturity", due_date: "2026-02-28" });
    expect(keyDate.remind_days_before).toBe(7); // default carried over from keyDateInputSchema
  });
});

describe("toJson", () => {
  it("wraps a result as a single pretty-printed text block", () => {
    const payload = { ok: true, items: [1, 2] };
    const result = mcpSchemas.toJson(payload);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual(payload);
    expect(result.isError).toBeUndefined();
  });
});
