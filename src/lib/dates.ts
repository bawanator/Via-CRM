// Date helpers. The business runs on Australia/Sydney time; "today" must not
// flip to yesterday's date just because the server is in UTC.

export const APP_TIMEZONE = "Australia/Sydney";

export function todayISO(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(now);
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Whole-day difference between two ISO dates (b - a).
export function daysBetween(aISO: string, bISO: string): number {
  const a = Date.parse(aISO + "T00:00:00Z");
  const b = Date.parse(bISO + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

// Mirrors Postgres `date + make_interval(months => n)`: month arithmetic that
// clamps to the last day of the target month (Jan 31 + 1 month = Feb 28).
// This is date arithmetic for maturity display, not financial arithmetic.
export function addMonthsClamped(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const zeroBased = m - 1 + months;
  const targetYear = y + Math.floor(zeroBased / 12);
  const targetMonth = ((zeroBased % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const result = new Date(Date.UTC(targetYear, targetMonth, day));
  return result.toISOString().slice(0, 10);
}

export function computeMaturityDate(settlementISO: string, termMonths: number): string {
  return addMonthsClamped(settlementISO, termMonths);
}
