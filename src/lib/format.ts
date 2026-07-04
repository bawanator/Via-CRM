import { APP_TIMEZONE, daysBetween, todayISO } from "@/lib/dates";

// Display-only formatting. No arithmetic is ever performed on loan amounts.
export function formatAmount(amount: number | null): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateISO: string | null | undefined): string {
  if (!dateISO) return "—";
  const d = new Date(dateISO.length <= 10 ? dateISO + "T00:00:00" : dateISO);
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: APP_TIMEZONE,
  }).format(new Date(iso));
}

// "today" / "in 3 days" / "94 days ago"
export function relativeDays(dateISO: string, from: string = todayISO()): string {
  const diff = daysBetween(from, dateISO);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 0) return `in ${diff} days`;
  return `${-diff} days ago`;
}

// Countdown badge text for the Loan Book, e.g. "matures in 94 days".
export function maturityCountdown(maturityISO: string | null): { text: string; overdue: boolean; soon: boolean } {
  if (!maturityISO) return { text: "no maturity date", overdue: false, soon: false };
  const diff = daysBetween(todayISO(), maturityISO);
  if (diff < 0) return { text: `matured ${-diff} days ago`, overdue: true, soon: false };
  if (diff === 0) return { text: "matures today", overdue: false, soon: true };
  return { text: `matures in ${diff} days`, overdue: false, soon: diff <= 60 };
}
