import type { DealPipelineStage } from "@/lib/database.types";
import { COLD_AFTER_DAYS, KEY_DATE_LOOKAHEAD_DAYS } from "@/lib/domain";
import { countLiveDealsByStage } from "@/lib/crm/deals";
import { listBrokers, type BrokerWithStats } from "@/lib/crm/contacts";
import { listOpenTasks, type TaskWithRefs } from "@/lib/crm/tasks";
import { listUpcomingKeyDates, type UpcomingKeyDate } from "@/lib/crm/keyDates";
import { todayISO } from "@/lib/dates";
import type { Db } from "@/lib/crm/db";

// Cap on open tasks surfaced to the Today view — enough to be useful, few
// enough to stay a glanceable list.
const OPEN_TASKS_CAP = 20;

export type TodayData = {
  today: string;
  overdueActions: BrokerWithStats[];
  upcomingKeyDates: UpcomingKeyDate[];
  coldBrokers: BrokerWithStats[];
  liveDealsByStage: Record<DealPipelineStage, number>;
  openTasks: TaskWithRefs[];
  // Open tasks can exceed the Today cap; the UI shows this beside "View all".
  totalOpenTasks: number;
};

// The morning screen and the MCP whats_due tool share this exact function.
export async function whatsDue(
  db: Db,
  opts: { daysAhead?: number; coldAfterDays?: number } = {},
): Promise<TodayData> {
  const daysAhead = opts.daysAhead ?? KEY_DATE_LOOKAHEAD_DAYS;
  const coldAfterDays = opts.coldAfterDays ?? COLD_AFTER_DAYS;

  const [overdue, keyDates, cold, liveDealsByStage, openTasks] = await Promise.all([
    listBrokers(db, { overdueOnly: true }),
    listUpcomingKeyDates(db, daysAhead),
    listBrokers(db, { coldOnly: true, coldAfterDays }),
    countLiveDealsByStage(db),
    listOpenTasks(db),
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
    openTasks: openTasks.slice(0, OPEN_TASKS_CAP),
    totalOpenTasks: openTasks.length,
  };
}
