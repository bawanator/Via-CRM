import type {
  DealFunder,
  DealLossReason,
  DealPipelineStage,
  DealProduct,
  DealStatus,
  InteractionType,
} from "@/lib/database.types";
import {
  INTERACTION_TYPES,
  INTERACTION_TYPE_LABELS,
  LOSS_REASONS,
  LOSS_REASON_LABELS,
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  PRODUCTS,
  PRODUCT_LABELS,
} from "@/lib/domain";
import { addDaysISO, todayISO } from "@/lib/dates";
import { assertOk, type Db } from "@/lib/crm/db";

// Reports are COUNTS and conversions only — never money. Every metric returns a
// list of labelled counts plus a total. Aggregation is done in JS over minimal
// column fetches (the data set is small; no server-side GROUP BY needed).

export type ReportMetric =
  | "deals_submitted"
  | "deals_by_stage"
  | "deals_by_outcome"
  | "stage_progression"
  | "activity"
  | "tasks_completed";

export type ReportSpec = {
  metric: ReportMetric;
  from?: string; // ISO date (inclusive)
  to?: string; // ISO date (inclusive)
  product?: DealProduct;
  funder?: DealFunder;
  broker_id?: string;
  stage?: DealPipelineStage;
  interaction_type?: InteractionType;
  target_stage?: DealPipelineStage;
  // Optional grouping directive for metrics that support it (deals_submitted,
  // activity). Absent → each metric's natural default grouping.
  group_by?: "product" | "broker" | "type" | "none";
};

export type ReportRow = { label: string; value: number };
export type ReportResult = { title: string; rows: ReportRow[]; total: number };

const DEFAULT_WINDOW_DAYS = 90;

// Resolve the [from, to] window, defaulting to the last 90 days.
function resolveRange(spec: ReportSpec): { from: string; to: string } {
  const to = spec.to ?? todayISO();
  const from = spec.from ?? addDaysISO(to, -DEFAULT_WINDOW_DAYS);
  return { from, to };
}

// Timestamptz upper bound: `< to + 1 day` so the whole `to` day is included.
function endExclusive(to: string): string {
  return addDaysISO(to, 1);
}

function tally<T>(items: T[], keyOf: (t: T) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    if (key == null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

type BrokerRef = { id: string; full_name: string } | null;

// Group rows carrying a broker reference by broker, sorted by count desc.
function groupByBroker(rows: { broker_id: string; broker: BrokerRef }[]): ReportRow[] {
  const acc = new Map<string, ReportRow>();
  for (const r of rows) {
    const key = r.broker?.id ?? r.broker_id;
    const label = r.broker?.full_name ?? "Unknown";
    const existing = acc.get(key);
    if (existing) existing.value += 1;
    else acc.set(key, { label, value: 1 });
  }
  return [...acc.values()].sort((a, b) => b.value - a.value);
}

// deals_submitted: deals created in the window, grouped by product (default) or
// broker; total is the deal count.
async function reportDealsSubmitted(db: Db, spec: ReportSpec): Promise<ReportResult> {
  const { from, to } = resolveRange(spec);
  let query = db
    .from("deals")
    .select("product, broker_id, broker:contacts(id, full_name)")
    .gte("created_at", from)
    .lt("created_at", endExclusive(to));
  if (spec.product) query = query.eq("product", spec.product);
  if (spec.funder) query = query.eq("funder", spec.funder);
  if (spec.broker_id) query = query.eq("broker_id", spec.broker_id);
  const { data, error } = await query.returns<
    { product: DealProduct | null; broker_id: string; broker: BrokerRef }[]
  >();
  const rows = assertOk(data, error, "Report: deals submitted");
  const total = rows.length;

  const groupBy = spec.group_by ?? "product";
  let out: ReportRow[];
  if (groupBy === "broker") {
    out = groupByBroker(rows);
  } else if (groupBy === "none") {
    out = [{ label: "Deals submitted", value: total }];
  } else {
    const counts = tally(rows, (r) => r.product ?? "__none__");
    out = PRODUCTS.map((p) => ({ label: PRODUCT_LABELS[p], value: counts.get(p) ?? 0 })).filter((r) => r.value > 0);
    const unspecified = counts.get("__none__");
    if (unspecified) out.push({ label: "Unspecified", value: unspecified });
  }
  return { title: "Deals submitted", rows: out, total };
}

// deals_by_stage: current live deals grouped by pipeline stage (all 5 shown).
async function reportDealsByStage(db: Db, spec: ReportSpec): Promise<ReportResult> {
  let query = db.from("deals").select("pipeline_stage").eq("status", "live");
  if (spec.product) query = query.eq("product", spec.product);
  if (spec.funder) query = query.eq("funder", spec.funder);
  if (spec.broker_id) query = query.eq("broker_id", spec.broker_id);
  const { data, error } = await query.returns<{ pipeline_stage: DealPipelineStage }[]>();
  const rows = assertOk(data, error, "Report: deals by stage");
  const counts = tally(rows, (r) => r.pipeline_stage);
  const out = PIPELINE_STAGES.map((s) => ({ label: PIPELINE_STAGE_LABELS[s], value: counts.get(s) ?? 0 }));
  return { title: "Live deals by stage", rows: out, total: rows.length };
}

// deals_by_outcome: deals that closed (closed_at) in the window, grouped by
// status; lost deals are further broken down by loss reason.
async function reportDealsByOutcome(db: Db, spec: ReportSpec): Promise<ReportResult> {
  const { from, to } = resolveRange(spec);
  let query = db
    .from("deals")
    .select("status, loss_reason")
    .not("closed_at", "is", null)
    .gte("closed_at", from)
    .lt("closed_at", endExclusive(to));
  if (spec.product) query = query.eq("product", spec.product);
  if (spec.funder) query = query.eq("funder", spec.funder);
  if (spec.broker_id) query = query.eq("broker_id", spec.broker_id);
  const { data, error } = await query.returns<{ status: DealStatus; loss_reason: DealLossReason | null }[]>();
  const rows = assertOk(data, error, "Report: deals by outcome");

  const settled = rows.filter((r) => r.status === "settled").length;
  const lossCounts = tally(
    rows.filter((r) => r.status === "lost"),
    (r) => r.loss_reason,
  );
  const out: ReportRow[] = [{ label: "Settled", value: settled }];
  for (const reason of LOSS_REASONS) {
    const value = lossCounts.get(reason) ?? 0;
    if (value > 0) out.push({ label: `Lost — ${LOSS_REASON_LABELS[reason]}`, value });
  }
  return { title: "Deal outcomes", rows: out, total: rows.length };
}

// stage_progression: distinct deals that ENTERED spec.target_stage in the window,
// derived from the audit log (a deals update whose pipeline_stage changed TO the
// target). Requires target_stage.
async function reportStageProgression(db: Db, spec: ReportSpec): Promise<ReportResult> {
  const target = spec.target_stage;
  if (!target) throw new Error("stage_progression report requires a target_stage.");
  const { from, to } = resolveRange(spec);
  const { data, error } = await db
    .from("audit_log")
    .select("record_id, before, after")
    .eq("table_name", "deals")
    .eq("action", "update")
    .gte("changed_at", from)
    .lt("changed_at", endExclusive(to));
  const rows = assertOk(data, error, "Report: stage progression");

  const entered = new Set<string>();
  for (const r of rows) {
    const after = (r.after ?? {}) as Record<string, unknown>;
    const before = (r.before ?? {}) as Record<string, unknown>;
    if (after.pipeline_stage === target && before.pipeline_stage !== target) {
      entered.add(r.record_id);
    }
  }
  const count = entered.size;
  const title = `Entered ${PIPELINE_STAGE_LABELS[target]}`;
  return { title, rows: [{ label: title, value: count }], total: count };
}

// activity: interactions in the window, grouped by type (default) or broker; a
// specific interaction_type filters instead of grouping by type.
async function reportActivity(db: Db, spec: ReportSpec): Promise<ReportResult> {
  const { from, to } = resolveRange(spec);
  let query = db
    .from("interactions")
    .select("type, broker_id, broker:contacts(id, full_name)")
    .gte("occurred_at", from)
    .lt("occurred_at", endExclusive(to));
  if (spec.interaction_type) query = query.eq("type", spec.interaction_type);
  if (spec.broker_id) query = query.eq("broker_id", spec.broker_id);
  const { data, error } = await query.returns<
    { type: InteractionType; broker_id: string; broker: BrokerRef }[]
  >();
  const rows = assertOk(data, error, "Report: activity");
  const total = rows.length;

  let out: ReportRow[];
  if (spec.group_by === "broker") {
    out = groupByBroker(rows);
  } else {
    const counts = tally(rows, (r) => r.type);
    out = INTERACTION_TYPES.map((t) => ({ label: INTERACTION_TYPE_LABELS[t], value: counts.get(t) ?? 0 })).filter(
      (r) => r.value > 0,
    );
  }
  return { title: "Activity", rows: out, total };
}

// tasks_completed: tasks whose completed_at falls in the window — completed
// tasks are stored forever precisely so this can be reported on. Grouped by
// the linked contact (default) or flat.
async function reportTasksCompleted(db: Db, spec: ReportSpec): Promise<ReportResult> {
  const { from, to } = resolveRange(spec);
  let query = db
    .from("tasks")
    .select("contact_id, contact:contacts(id, full_name)")
    .eq("completed", true)
    .gte("completed_at", from)
    .lt("completed_at", endExclusive(to));
  if (spec.broker_id) query = query.eq("contact_id", spec.broker_id);
  const { data, error } = await query.returns<{ contact_id: string | null; contact: BrokerRef }[]>();
  const rows = assertOk(data, error, "Counting completed tasks");

  const title = `Tasks completed (${from} → ${to})`;
  if (spec.group_by === "none") return { title, rows: [], total: rows.length };
  const grouped = groupByBroker(
    rows.map((r) => ({ broker_id: r.contact_id ?? "unlinked", broker: r.contact })),
  ).map((row) => (row.label === "Unknown" ? { ...row, label: "Not linked to a person" } : row));
  return { title, rows: grouped, total: rows.length };
}

export async function runReport(db: Db, spec: ReportSpec): Promise<ReportResult> {
  switch (spec.metric) {
    case "deals_submitted":
      return reportDealsSubmitted(db, spec);
    case "deals_by_stage":
      return reportDealsByStage(db, spec);
    case "deals_by_outcome":
      return reportDealsByOutcome(db, spec);
    case "stage_progression":
      return reportStageProgression(db, spec);
    case "activity":
      return reportActivity(db, spec);
    case "tasks_completed":
      return reportTasksCompleted(db, spec);
    default: {
      const exhaustive: never = spec.metric;
      throw new Error(`Unknown report metric: ${String(exhaustive)}`);
    }
  }
}
