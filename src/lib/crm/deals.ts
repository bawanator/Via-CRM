import type {
  DealFunder,
  DealInsert,
  DealLossReason,
  DealPipelineStage,
  DealRow,
  DealSecurityRow,
  DealStatus,
  DealUpdate,
  DriveLinkRow,
  GuarantorRow,
  KeyDateRow,
} from "@/lib/database.types";
import { assertOk, isUuid, type Db } from "@/lib/crm/db";

export type DealWithBroker = DealRow & {
  broker: { id: string; full_name: string; company: { id: string; name: string } | null } | null;
};

export type DealDetail = DealWithBroker & {
  key_dates: KeyDateRow[];
  drive_links: DriveLinkRow[];
  guarantors: GuarantorRow[];
  securities: DealSecurityRow[];
};

// The broker on a deal is a Broker-type contact (FK column keeps the name
// broker_id); embed by the real target table, `contacts`.
const DEAL_WITH_BROKER = "*, broker:contacts(id, full_name, company:companies(id, name))";

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
export async function listLoanBook(
  db: Db,
): Promise<(DealWithBroker & { key_dates: KeyDateRow[]; securities: { address: string }[] })[]> {
  const res = await db
    .from("deals")
    .select(`${DEAL_WITH_BROKER}, key_dates(*), securities:deal_securities(address)`)
    .eq("status", "settled")
    .returns<(DealWithBroker & { key_dates: KeyDateRow[]; securities: { address: string }[] })[]>();
  const deals = assertOk(res.data, res.error, "Loading loan book");
  return deals
    .map((d) => ({ ...d, key_dates: d.key_dates.filter((k) => !k.completed).sort((a, b) => a.due_date.localeCompare(b.due_date)) }))
    .sort((a, b) => (a.maturity_date ?? "9999-12-31").localeCompare(b.maturity_date ?? "9999-12-31"));
}

// Returns null when the deal doesn't exist; throws on real failures —
// callers must not turn a database outage into a 404.
export async function getDeal(db: Db, id: string): Promise<DealDetail | null> {
  const { data, error } = await db
    .from("deals")
    .select(`${DEAL_WITH_BROKER}, key_dates(*), guarantors(*), securities:deal_securities(*)`)
    .eq("id", id)
    .maybeSingle<DealWithBroker & { key_dates: KeyDateRow[]; guarantors: GuarantorRow[]; securities: DealSecurityRow[] }>();
  if (error) throw new Error(`Loading deal: ${error.message}`);
  if (!data) return null;
  const deal = data;

  const links = await db
    .from("drive_links")
    .select("*")
    .eq("parent_type", "deal")
    .eq("parent_id", id)
    .order("created_at");

  return {
    ...deal,
    key_dates: [...deal.key_dates].sort((a, b) => a.due_date.localeCompare(b.due_date)),
    guarantors: [...deal.guarantors].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    securities: [...deal.securities].sort((a, b) => a.created_at.localeCompare(b.created_at)),
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
  // Honour the DB invariant (lost ⇔ loss_reason present): moving a deal to any
  // non-lost status clears the loss reason unless the caller set one explicitly.
  const patch: DealUpdate = { ...input };
  if (patch.status && patch.status !== "lost" && patch.loss_reason === undefined) {
    patch.loss_reason = null;
  }
  const { data, error } = await db.from("deals").update(patch).eq("id", id).select().single();
  return assertOk(data, error, "Updating deal");
}

export async function moveDealStage(db: Db, id: string, stage: DealPipelineStage): Promise<DealRow> {
  return updateDeal(db, id, { pipeline_stage: stage });
}

// Deleting a deal. Its drive links go first (no FK cascade across the
// polymorphic parent); key_dates/guarantors/tasks cascade via FK and
// interactions keep their history with deal_id nulled.
export async function deleteDeal(db: Db, id: string): Promise<void> {
  const { error: linksError } = await db
    .from("drive_links")
    .delete()
    .eq("parent_type", "deal")
    .eq("parent_id", id);
  if (linksError) throw new Error(`Deleting deal drive links: ${linksError.message}`);

  const { error } = await db.from("deals").delete().eq("id", id);
  if (error) throw new Error(`Deleting deal: ${error.message}`);
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

// Closing / losing a deal: status → 'lost' with the required reason (the DB
// check constraint enforces the pairing).
export async function loseDeal(db: Db, id: string, lossReason: DealLossReason): Promise<DealRow> {
  return updateDeal(db, id, { status: "lost", loss_reason: lossReason });
}

// Reopening a settled/lost deal back to live; updateDeal clears loss_reason.
export async function reopenDeal(db: Db, id: string): Promise<DealRow> {
  return updateDeal(db, id, { status: "live", loss_reason: null });
}

export async function countLiveDealsByStage(db: Db): Promise<Record<DealPipelineStage, number>> {
  const { data, error } = await db.from("deals").select("pipeline_stage").eq("status", "live");
  const rows = assertOk(data, error, "Counting live deals");
  const counts: Record<DealPipelineStage, number> = {
    scenario: 0,
    term_sheet: 0,
    docs: 0,
    settlement: 0,
  };
  for (const row of rows) counts[row.pipeline_stage] += 1;
  return counts;
}
