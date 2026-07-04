import type {
  BrokerInsert,
  BrokerRow,
  BrokerStage,
  BrokerStatsRow,
  BrokerUpdate,
  DealRow,
  InteractionRow,
} from "@/lib/database.types";
import { COLD_AFTER_DAYS } from "@/lib/domain";
import { addDaysISO, todayISO } from "@/lib/dates";
import { assertOk, isUuid, type Db } from "@/lib/crm/db";

export type BrokerWithStats = BrokerRow & {
  live_deal_count: number;
  total_deals_submitted: number;
  last_deal_outcome: BrokerStatsRow["last_deal_outcome"];
};

export type BrokerDetail = BrokerWithStats & {
  interactions: InteractionRow[];
  deals: DealRow[];
};

async function attachStats(db: Db, brokers: BrokerRow[]): Promise<BrokerWithStats[]> {
  if (brokers.length === 0) return [];
  const ids = brokers.map((b) => b.id);
  const { data, error } = await db.from("broker_stats").select("*").in("broker_id", ids);
  const stats = assertOk(data, error, "Loading broker stats");
  const byId = new Map(stats.map((s) => [s.broker_id, s]));
  return brokers.map((b) => {
    const s = byId.get(b.id);
    return {
      ...b,
      live_deal_count: s?.live_deal_count ?? 0,
      total_deals_submitted: s?.total_deals_submitted ?? 0,
      last_deal_outcome: s?.last_deal_outcome ?? null,
    };
  });
}

export async function listBrokers(
  db: Db,
  filter: { stage?: BrokerStage; overdueOnly?: boolean; coldOnly?: boolean; coldAfterDays?: number } = {},
): Promise<BrokerWithStats[]> {
  let query = db.from("brokers").select("*").order("full_name");
  if (filter.stage) query = query.eq("stage", filter.stage);
  if (filter.overdueOnly) query = query.lte("next_action_date", todayISO());
  if (filter.coldOnly) {
    const cutoff = addDaysISO(todayISO(), -(filter.coldAfterDays ?? COLD_AFTER_DAYS));
    query = query.or(`last_contact_date.lte.${cutoff},last_contact_date.is.null`);
  }
  const { data, error } = await query;
  return attachStats(db, assertOk(data, error, "Listing brokers"));
}

export async function getBroker(db: Db, id: string): Promise<BrokerDetail> {
  const { data, error } = await db.from("brokers").select("*").eq("id", id).single();
  const broker = assertOk(data, error, "Loading broker");

  const [withStats, interactionsRes, dealsRes] = await Promise.all([
    attachStats(db, [broker]),
    db.from("interactions").select("*").eq("broker_id", id).order("occurred_at", { ascending: false }).limit(100),
    db.from("deals").select("*").eq("broker_id", id).order("created_at", { ascending: false }),
  ]);

  return {
    ...withStats[0],
    interactions: assertOk(interactionsRes.data, interactionsRes.error, "Loading interactions"),
    deals: assertOk(dealsRes.data, dealsRes.error, "Loading broker deals"),
  };
}

// MCP convenience: accept a UUID or a (partial) name. Throws with candidate
// names when the match is ambiguous so Claude can disambiguate.
export async function resolveBrokerId(db: Db, idOrName: string): Promise<string> {
  if (isUuid(idOrName)) return idOrName;
  const { data, error } = await db
    .from("brokers")
    .select("id, full_name, company")
    .ilike("full_name", `%${idOrName}%`)
    .limit(10);
  const matches = assertOk(data, error, "Resolving broker");
  if (matches.length === 1) return matches[0].id;
  if (matches.length === 0) throw new Error(`No broker found matching "${idOrName}"`);
  const exact = matches.filter((m) => m.full_name.toLowerCase() === idOrName.toLowerCase());
  if (exact.length === 1) return exact[0].id;
  throw new Error(
    `Ambiguous broker "${idOrName}" — candidates: ${matches.map((m) => `${m.full_name}${m.company ? ` (${m.company})` : ""} [${m.id}]`).join(", ")}`,
  );
}

export async function createBroker(db: Db, input: BrokerInsert): Promise<BrokerRow> {
  const { data, error } = await db.from("brokers").insert(input).select().single();
  return assertOk(data, error, "Creating broker");
}

export async function updateBroker(db: Db, id: string, input: BrokerUpdate): Promise<BrokerRow> {
  const { data, error } = await db.from("brokers").update(input).eq("id", id).select().single();
  return assertOk(data, error, "Updating broker");
}
