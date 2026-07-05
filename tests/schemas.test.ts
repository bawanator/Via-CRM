// The Zod schemas in src/lib/schemas.ts are the write boundary for the whole
// app (server actions, MCP tools, Attio import). These tests pin the
// normalisation behaviour forms rely on: "" → null for optional fields,
// email lowercasing, and string → number coercion for amounts and terms.
import { describe, expect, it } from "vitest";
import {
  brokerInputSchema,
  dealInputSchema,
  keyDateInputSchema,
  settleDealSchema,
} from "@/lib/schemas";

const BROKER_ID = "5f0c3a1e-2b4d-4c6e-9f8a-1234567890ab";
const DEAL_ID = "0b9e6d2c-7a1f-4e3b-8c5d-abcdef012345";

describe("brokerInputSchema", () => {
  it("rejects an empty name (including whitespace-only)", () => {
    expect(brokerInputSchema.safeParse({ full_name: "" }).success).toBe(false);
    expect(brokerInputSchema.safeParse({ full_name: "   " }).success).toBe(false);
    expect(brokerInputSchema.safeParse({}).success).toBe(false);
  });

  it('normalises "" email (cleared form field) to null', () => {
    const parsed = brokerInputSchema.parse({ full_name: "Jane O'Brien", email: "" });
    expect(parsed.email).toBeNull();
  });

  it("lowercases and trims emails", () => {
    const parsed = brokerInputSchema.parse({ full_name: "Jane O'Brien", email: "  Jane@BrokerCo.COM.au " });
    expect(parsed.email).toBe("jane@brokerco.com.au");
  });

  it("rejects a malformed email", () => {
    expect(brokerInputSchema.safeParse({ full_name: "Jane", email: "not-an-email" }).success).toBe(false);
  });

  it("rejects a bad linkedin url (including scheme-less ones)", () => {
    expect(brokerInputSchema.safeParse({ full_name: "Jane", linkedin_url: "not a url" }).success).toBe(false);
    // Scheme-less values are rejected too — the Attio importer prefixes
    // https:// before validating, and this is why.
    expect(brokerInputSchema.safeParse({ full_name: "Jane", linkedin_url: "linkedin.com/in/jane" }).success).toBe(
      false,
    );
    expect(
      brokerInputSchema.safeParse({ full_name: "Jane", linkedin_url: "https://linkedin.com/in/jane" }).success,
    ).toBe(true);
  });

  it("accepts a minimal valid broker and normalises blank optionals to null", () => {
    // company_name is a NAME the server resolves to a company record — the
    // schema just normalises it like any optional text field.
    const parsed = brokerInputSchema.parse({ full_name: "Tom Nguyen", company_name: "  ", notes: "" });
    expect(parsed.full_name).toBe("Tom Nguyen");
    expect(parsed.company_name).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("rejects an unknown stage", () => {
    expect(brokerInputSchema.safeParse({ full_name: "Jane", stage: "vip" }).success).toBe(false);
  });
});

describe("dealInputSchema", () => {
  const base = { name: "12 Smith St bridge", broker_id: BROKER_ID };

  it('coerces loan_amount "1,500,000" to the number 1500000', () => {
    const parsed = dealInputSchema.parse({ ...base, loan_amount: "1,500,000" });
    expect(parsed.loan_amount).toBe(1_500_000);
  });

  it("strips currency symbols and spaces from loan_amount", () => {
    const parsed = dealInputSchema.parse({ ...base, loan_amount: "$2,000,000 " });
    expect(parsed.loan_amount).toBe(2_000_000);
  });

  it('normalises loan_amount "" to null', () => {
    const parsed = dealInputSchema.parse({ ...base, loan_amount: "" });
    expect(parsed.loan_amount).toBeNull();
  });

  it("rejects a negative loan_amount (number or string form)", () => {
    expect(dealInputSchema.safeParse({ ...base, loan_amount: -5 }).success).toBe(false);
    expect(dealInputSchema.safeParse({ ...base, loan_amount: "-1,000" }).success).toBe(false);
  });

  it("rejects a non-numeric loan_amount", () => {
    expect(dealInputSchema.safeParse({ ...base, loan_amount: "twelve" }).success).toBe(false);
  });

  it('coerces loan_term_months "18" to 18', () => {
    const parsed = dealInputSchema.parse({ ...base, loan_term_months: "18" });
    expect(parsed.loan_term_months).toBe(18);
  });

  it("rejects loan_term_months of 0 and non-integers", () => {
    expect(dealInputSchema.safeParse({ ...base, loan_term_months: 0 }).success).toBe(false);
    expect(dealInputSchema.safeParse({ ...base, loan_term_months: "0" }).success).toBe(false);
    expect(dealInputSchema.safeParse({ ...base, loan_term_months: 6.5 }).success).toBe(false);
  });

  it('normalises loan_term_months "" to null', () => {
    const parsed = dealInputSchema.parse({ ...base, loan_term_months: "" });
    expect(parsed.loan_term_months).toBeNull();
  });

  it("requires a name and a uuid broker_id", () => {
    expect(dealInputSchema.safeParse({ name: "", broker_id: BROKER_ID }).success).toBe(false);
    expect(dealInputSchema.safeParse({ name: "Deal", broker_id: "jane" }).success).toBe(false);
  });
});

describe("settleDealSchema", () => {
  it("accepts a real settlement date and term", () => {
    const parsed = settleDealSchema.parse({ settlement_date: "2025-08-29", loan_term_months: 6 });
    expect(parsed).toEqual({ settlement_date: "2025-08-29", loan_term_months: 6 });
  });

  it("rejects malformed and impossible dates", () => {
    // "29/08/2025" and "2025-8-9" fail the YYYY-MM-DD regex; "2025-13-01"
    // additionally fails the Date.parse refine (month 13 is never valid).
    for (const bad of ["29/08/2025", "2025-8-9", "2025-13-01", ""]) {
      expect(settleDealSchema.safeParse({ settlement_date: bad, loan_term_months: 6 }).success).toBe(false);
    }
  });

  it("rejects impossible days like Feb 30 (round-trip refine)", () => {
    // Date.parse alone would roll "2025-02-30" over to March 2nd; the isoDate
    // refine re-serialises and compares, so impossible days are rejected.
    expect(settleDealSchema.safeParse({ settlement_date: "2025-02-30", loan_term_months: 6 }).success).toBe(false);
    expect(settleDealSchema.safeParse({ settlement_date: "2024-02-29", loan_term_months: 6 }).success).toBe(true);
    expect(settleDealSchema.safeParse({ settlement_date: "2025-02-29", loan_term_months: 6 }).success).toBe(false);
  });

  it("rejects a missing or non-positive term", () => {
    expect(settleDealSchema.safeParse({ settlement_date: "2025-08-29" }).success).toBe(false);
    expect(settleDealSchema.safeParse({ settlement_date: "2025-08-29", loan_term_months: 0 }).success).toBe(false);
  });
});

describe("keyDateInputSchema", () => {
  const base = { deal_id: DEAL_ID, label: "First interest payment", due_date: "2025-09-30" };

  it("defaults remind_days_before to 7", () => {
    const parsed = keyDateInputSchema.parse(base);
    expect(parsed.remind_days_before).toBe(7);
  });

  it("keeps an explicit remind_days_before", () => {
    expect(keyDateInputSchema.parse({ ...base, remind_days_before: 0 }).remind_days_before).toBe(0);
    expect(keyDateInputSchema.parse({ ...base, remind_days_before: 30 }).remind_days_before).toBe(30);
  });

  it("rejects negative or out-of-range reminders", () => {
    expect(keyDateInputSchema.safeParse({ ...base, remind_days_before: -1 }).success).toBe(false);
    expect(keyDateInputSchema.safeParse({ ...base, remind_days_before: 400 }).success).toBe(false);
  });

  it("requires a label and a real due date", () => {
    expect(keyDateInputSchema.safeParse({ ...base, label: " " }).success).toBe(false);
    expect(keyDateInputSchema.safeParse({ ...base, due_date: "next month" }).success).toBe(false);
  });
});
