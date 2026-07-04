import type { DealPipelineStage } from "@/lib/database.types";
import { COLD_AFTER_DAYS, KEY_DATE_LOOKAHEAD_DAYS } from "@/lib/domain";
import { countLiveDealsByStage } from "@/lib/crm/deals";
import { listBrokers, type BrokerWithStats } from "@/lib/crm/brokers";
import { listUpcomingKeyDates, type UpcomingKeyDate } from "@/lib/crm/keyDates";
import { todayISO } from "@/lib/dates";
import type { Db } from "@/lib/crm/db";

export type TodayData = {
  today: string;
  overdueActions: BrokerWithStats[];
  upcomingKeyDates: UpcomingKeyDate[];
  coldBrokers: BrokerWithStats[];
  liveDealsByStage: Record<DealPipelineStage, number>;
};

// The morning screen and the MCP whats_due tool share this exact function.
export async function whatsDue(
  db: Db,
  opts: { daysAhead?: number; coldAfterDays?: number } = {},
): Promise<TodayData> {
  const daysAhead = opts.daysAhead ?? KEY_DATE_LOOKAHEAD_DAYS;
  const coldAfterDays = opts.coldAfterDays ?? COLD_AFTER_DAYS;

  const [overdue, keyDates, cold, liveDealsByStage] = await Promise.all([
    listBrokers(db, { overdueOnly: true }),
    listUpcomingKeyDates(db, daysAhead),
    listBrokers(db, { coldOnly: true, coldAfterDays }),
    countLiveDealsByStage(db),
  ]);

  const overdueIds = new Set(overdue.map((b) => b.id));

  return {
    today: todayISO(),
    overdueActions: overdue,
    // Only settled/live relevance: skip key dates on dead deals.
    upcomingKeyDates: keyDates.filter((k) => k.deal == null || k.deal.status === "settled" || k.deal.status === "live"),
    // Don't show a broker twice on the same screen.
    coldBrokers: cold.filter((b) => !overdueIds.has(b.id)),
    liveDealsByStage,
  };
}
