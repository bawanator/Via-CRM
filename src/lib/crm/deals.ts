import type {
  DealFunder,
  DealInsert,
  DealPipelineStage,
  DealRow,
  DealStatus,
  DealUpdate,
  DriveLinkRow,
  KeyDateRow,
} from "@/lib/database.types";
import { assertOk, isUuid, type Db } from "@/lib/crm/db";

export type DealWithBroker = DealRow & {
  broker: { id: string; full_name: string; company: string | null } | null;
};

export type DealDetail = DealWithBroker & {
  key_dates: KeyDateRow[];
  drive_links: DriveLinkRow[];
};

const DEAL_WITH_BROKER = "*, broker:brokers(id, full_name, company)";

export async function listDeals(
  db: Db,
  filter: { status?: DealStatus; pipelineStage?: DealPipelineStage; funder?: DealFunder; brokerId?: string } = {},
): Promise<DealWithBroker[]> {
  let query = db.from("deals").select(DEAL_WITH_BROKER).order("updated_at", { ascending: false });
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.pipelineStage) query = query.eq("pipeline_stage", filter.pipelineStage);
  if (filter.funder) query = query.eq("funder", filter.funder);
  if (filter.brokerId) query = query.eq("broker_id", filter.brokerId);
  const { data, error } = await query.returns<DealWithBroker[]>();
  return assertOk(data, error, "Listing deals");
}

// Loan Book: settled deals ordered by maturity (soonest first, nulls last).
export async function listLoanBook(db: Db): Promise<(DealWithBroker & { key_dates: KeyDateRow[] })[]> {
  const res = await db
    .from("deals")
    .select(`${DEAL_WITH_BROKER}, key_dates(*)`)
    .eq("status", "settled")
    .returns<(DealWithBroker & { key_dates: KeyDateRow[] })[]>();
  const deals = assertOk(res.data, res.error, "Loading loan book");
  return deals
    .map((d) => ({ ...d, key_dates: d.key_dates.filter((k) => !k.completed).sort((a, b) => a.due_date.localeCompare(b.due_date)) }))
    .sort((a, b) => (a.maturity_date ?? "9999-12-31").localeCompare(b.maturity_date ?? "9999-12-31"));
}

export async function getDeal(db: Db, id: string): Promise<DealDetail> {
  const { data, error } = await db
    .from("deals")
    .select(`${DEAL_WITH_BROKER}, key_dates(*)`)
    .eq("id", id)
    .single<DealWithBroker & { key_dates: KeyDateRow[] }>();
  const deal = assertOk(data, error, "Loading deal");

  const links = await db
    .from("drive_links")
    .select("*")
    .eq("parent_type", "deal")
    .eq("parent_id", id)
    .order("created_at");

  return {
    ...deal,
    key_dates: [...deal.key_dates].sort((a, b) => a.due_date.localeCompare(b.due_date)),
    drive_links: assertOk(links.data, links.error, "Loading drive links"),
  };
}

export async function resolveDealId(db: Db, idOrName: string): Promise<string> {
  if (isUuid(idOrName)) return idOrName;
  const { data, error } = await db.from("deals").select("id, name, status").ilike("name", `%${idOrName}%`).limit(10);
  const matches = assertOk(data, error, "Resolving deal");
  if (matches.length === 1) return matches[0].id;
  if (matches.length === 0) throw new Error(`No deal found matching "${idOrName}"`);
  const exact = matches.filter((m) => m.name.toLowerCase() === idOrName.toLowerCase());
  if (exact.length === 1) return exact[0].id;
  throw new Error(
    `Ambiguous deal "${idOrName}" — candidates: ${matches.map((m) => `${m.name} (${m.status}) [${m.id}]`).join(", ")}`,
  );
}

export async function createDeal(db: Db, input: DealInsert): Promise<DealRow> {
  const { data, error } = await db.from("deals").insert(input).select().single();
  return assertOk(data, error, "Creating deal");
}

export async function updateDeal(db: Db, id: string, input: DealUpdate): Promise<DealRow> {
  const { data, error } = await db.from("deals").update(input).eq("id", id).select().single();
  return assertOk(data, error, "Updating deal");
}

export async function moveDealStage(db: Db, id: string, stage: DealPipelineStage): Promise<DealRow> {
  return updateDeal(db, id, { pipeline_stage: stage });
}

// Settling: status flips, dates are set; the DB trigger derives maturity_date
// (settlement + term months — date arithmetic, not financial arithmetic).
export async function settleDeal(
  db: Db,
  id: string,
  settlementDate: string,
  loanTermMonths: number,
): Promise<DealRow> {
  return updateDeal(db, id, {
    status: "settled",
    pipeline_stage: "settlement",
    settlement_date: settlementDate,
    loan_term_months: loanTermMonths,
  });
}

export async function countLiveDealsByStage(db: Db): Promise<Record<DealPipelineStage, number>> {
  const { data, error } = await db.from("deals").select("pipeline_stage").eq("status", "live");
  const rows = assertOk(data, error, "Counting live deals");
  const counts: Record<DealPipelineStage, number> = {
    enquiry: 0,
    scenario: 0,
    term_sheet: 0,
    credit: 0,
    docs: 0,
    settlement: 0,
  };
  for (const row of rows) counts[row.pipeline_stage] += 1;
  return counts;
}
