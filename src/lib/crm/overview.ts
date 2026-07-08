import type { Db } from "@/lib/crm/db";
import { sydneyMidnightEpoch, todayISO } from "@/lib/dates";
import { countSentSince, refreshAccessToken } from "@/lib/gmail";

// Counts for the home overview's stat cards. Counts and dates only — the
// overview is a status board, never a calculator.

export type OverviewStats = {
  settledLoans: number;
  totalContacts: number;
  tasksCompletedToday: number;
  nextMaturity: { deal_id: string; name: string; maturity_date: string } | null;
};

export async function overviewStats(db: Db): Promise<OverviewStats> {
  const today = todayISO();
  const startOfDay = new Date(sydneyMidnightEpoch(today) * 1000).toISOString();

  const [settled, contacts, tasksToday, maturity] = await Promise.all([
    db.from("deals").select("id", { count: "exact", head: true }).eq("status", "settled"),
    db.from("contacts").select("id", { count: "exact", head: true }),
    db
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("completed", true)
      .gte("completed_at", startOfDay),
    db
      .from("deals")
      .select("id, name, maturity_date")
      .eq("status", "settled")
      .not("maturity_date", "is", null)
      .gte("maturity_date", today)
      .order("maturity_date", { ascending: true })
      .limit(1),
  ]);

  const next = maturity.data?.[0];
  return {
    settledLoans: settled.count ?? 0,
    totalContacts: contacts.count ?? 0,
    tasksCompletedToday: tasksToday.count ?? 0,
    nextMaturity:
      next && next.maturity_date ? { deal_id: next.id, name: next.name, maturity_date: next.maturity_date } : null,
  };
}

// ---------------------------------------------------------------------------
// Emails sent today — live from Gmail (read-only), because interactions only
// refresh on the nightly sync. Never blocks or breaks the page: any failure
// (no token, Google down, slow network) returns null and the card just shows
// tasks. Cached in-process for 5 minutes so repeat loads stay instant.
// ---------------------------------------------------------------------------

let sentCache: { key: string; value: number; at: number } | null = null;
const SENT_CACHE_TTL_MS = 5 * 60 * 1000;
const SENT_TIMEOUT_MS = 3_000;

export async function emailsSentToday(db: Db): Promise<number | null> {
  const today = todayISO();
  if (sentCache && sentCache.key === today && Date.now() - sentCache.at < SENT_CACHE_TTL_MS) {
    return sentCache.value;
  }
  try {
    const { data: tokens } = await db.from("google_oauth_tokens").select("refresh_token").limit(1);
    const refreshToken = tokens?.[0]?.refresh_token;
    if (!refreshToken) return null;

    const count = await Promise.race<number>([
      (async () => {
        const accessToken = await refreshAccessToken(refreshToken);
        return countSentSince(accessToken, sydneyMidnightEpoch(today));
      })(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Gmail count timed out")), SENT_TIMEOUT_MS)),
    ]);
    sentCache = { key: today, value: count, at: Date.now() };
    return count;
  } catch {
    return null;
  }
}
