// Date arithmetic must agree with Postgres, because the same computation
// exists twice: sync_maturity_date() in the database does
// `settlement_date + make_interval(months => n)`, and the app previews it
// with addMonthsClamped/computeMaturityDate.
//
// Postgres month-clamping semantics (verified against `select date '...' +
// make_interval(months => n)`): the day-of-month is kept, but clamped to the
// last day of the target month — it never spills into the following month.
//   2025-01-31 + 1 month  = 2025-02-28
//   2024-01-31 + 1 month  = 2024-02-29   (leap year)
//   2025-08-31 + 6 months = 2026-02-28
//   2024-02-29 + 12 months = 2025-02-28  (leap day → non-leap year)
import { describe, expect, it } from "vitest";
import { addDaysISO, addMonthsClamped, computeMaturityDate, daysBetween } from "@/lib/dates";

describe("addMonthsClamped", () => {
  it("adds ordinary months without touching the day", () => {
    expect(addMonthsClamped("2025-03-15", 1)).toBe("2025-04-15");
    expect(addMonthsClamped("2025-01-01", 3)).toBe("2025-04-01");
    expect(addMonthsClamped("2025-06-30", 2)).toBe("2025-08-30");
  });

  it("clamps Jan 31 + 1 month to the end of February", () => {
    expect(addMonthsClamped("2025-01-31", 1)).toBe("2025-02-28");
    expect(addMonthsClamped("2025-01-30", 1)).toBe("2025-02-28");
    expect(addMonthsClamped("2025-01-28", 1)).toBe("2025-02-28"); // no clamp needed
  });

  it("clamps to Feb 29 in leap years", () => {
    expect(addMonthsClamped("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonthsClamped("2024-01-30", 1)).toBe("2024-02-29");
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("clamps across a year rollover: 2025-08-31 + 6 = 2026-02-28", () => {
    expect(addMonthsClamped("2025-08-31", 6)).toBe("2026-02-28");
    expect(addMonthsClamped("2025-10-31", 4)).toBe("2026-02-28");
    expect(addMonthsClamped("2025-12-31", 2)).toBe("2026-02-28");
  });

  it("rolls the year over for plain adds", () => {
    expect(addMonthsClamped("2025-11-15", 2)).toBe("2026-01-15");
    expect(addMonthsClamped("2025-12-01", 1)).toBe("2026-01-01");
  });

  it("handles the standard 12/18/24-month loan terms", () => {
    expect(addMonthsClamped("2025-03-10", 12)).toBe("2026-03-10");
    expect(addMonthsClamped("2024-02-29", 12)).toBe("2025-02-28"); // leap day → non-leap year
    expect(addMonthsClamped("2025-01-31", 18)).toBe("2026-07-31");
    expect(addMonthsClamped("2025-05-31", 18)).toBe("2026-11-30");
    expect(addMonthsClamped("2024-02-29", 24)).toBe("2026-02-28");
    expect(addMonthsClamped("2025-06-30", 24)).toBe("2027-06-30");
  });

  it("supports negative months with the same clamping", () => {
    expect(addMonthsClamped("2025-03-31", -1)).toBe("2025-02-28");
    expect(addMonthsClamped("2025-01-15", -2)).toBe("2024-11-15"); // year rolls back
  });

  it("is a no-op for zero months", () => {
    expect(addMonthsClamped("2025-02-28", 0)).toBe("2025-02-28");
  });
});

describe("computeMaturityDate", () => {
  it("is settlement + term months, month-clamped (matches the DB trigger)", () => {
    expect(computeMaturityDate("2025-01-31", 1)).toBe("2025-02-28");
    expect(computeMaturityDate("2024-01-31", 1)).toBe("2024-02-29");
    expect(computeMaturityDate("2025-08-31", 6)).toBe("2026-02-28");
    expect(computeMaturityDate("2025-04-14", 12)).toBe("2026-04-14");
  });

  it("agrees with addMonthsClamped for every term we offer", () => {
    for (const term of [1, 3, 6, 9, 12, 18, 24]) {
      expect(computeMaturityDate("2025-08-31", term)).toBe(addMonthsClamped("2025-08-31", term));
    }
  });
});

describe("daysBetween", () => {
  it("computes whole-day differences (b - a)", () => {
    expect(daysBetween("2025-01-01", "2025-01-31")).toBe(30);
    expect(daysBetween("2025-06-04", "2025-06-04")).toBe(0);
    expect(daysBetween("2025-06-10", "2025-06-04")).toBe(-6);
  });

  it("is DST-proof across the Sydney spring-forward (2025-10-05 is a 23h day locally)", () => {
    // A local-time subtraction would give 8.958… days here; the UTC-based
    // implementation must return exactly 9.
    expect(daysBetween("2025-10-01", "2025-10-10")).toBe(9);
  });

  it("is DST-proof across the Sydney fall-back (2025-04-06 is a 25h day locally)", () => {
    expect(daysBetween("2025-04-01", "2025-04-10")).toBe(9);
  });

  it("crosses year boundaries and leap days", () => {
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2); // leap year: via Feb 29
    expect(daysBetween("2025-02-28", "2025-03-01")).toBe(1);
  });
});

describe("addDaysISO", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDaysISO("2025-01-30", 3)).toBe("2025-02-02");
    expect(addDaysISO("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("handles leap-day boundaries", () => {
    expect(addDaysISO("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysISO("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDaysISO("2025-02-28", 1)).toBe("2025-03-01");
  });

  it("supports negative day offsets", () => {
    expect(addDaysISO("2025-01-01", -1)).toBe("2024-12-31");
    expect(addDaysISO("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("round-trips with daysBetween across the Sydney DST change", () => {
    expect(addDaysISO("2025-10-01", 9)).toBe("2025-10-10");
    expect(daysBetween("2025-10-01", addDaysISO("2025-10-01", 9))).toBe(9);
  });
});
