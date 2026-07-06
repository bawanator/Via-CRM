// Pure, framework-neutral helpers shared by the (client) report builder and the
// (server) reports page. NO server-only imports here — this module is bundled
// into the client builder, so it may only touch pure domain/date/format helpers.
//
// A saved report's `spec` (jsonb) is a superset of the runReport ReportSpec: it
// adds a `range_preset` so rolling windows ("last 30 days") stay rolling. The
// concrete from/to are re-derived from the preset every time the report is run,
// so a pinned headline number always reflects the trailing window — never a
// frozen snapshot. Custom ranges store literal from/to instead.

import type {
  DealFunder,
  DealPipelineStage,
  DealProduct,
  InteractionType,
} from "@/lib/database.types";
import type { ReportMetric, ReportSpec } from "@/lib/crm/reports";
import {
  FUNDER_LABELS,
  INTERACTION_TYPE_LABELS,
  PIPELINE_STAGE_LABELS,
  PRODUCT_LABELS,
} from "@/lib/domain";
import { addDaysISO, todayISO } from "@/lib/dates";
import { formatDate } from "@/lib/format";

export type RangePreset = "last_30" | "last_90" | "quarter" | "ytd" | "custom" | "none";

// What we persist. runReport only reads the ReportSpec keys; `range_preset` is an
// extra key it harmlessly ignores.
export type StoredSpec = ReportSpec & { range_preset?: RangePreset };

export type GroupBy = NonNullable<ReportSpec["group_by"]>;

// ---------------------------------------------------------------------------
// Metric metadata
// ---------------------------------------------------------------------------

export const REPORT_METRICS: ReportMetric[] = [
  "deals_submitted",
  "deals_by_stage",
  "deals_by_outcome",
  "stage_progression",
  "activity",
  "tasks_completed",
];

export const METRIC_LABELS: Record<ReportMetric, string> = {
  deals_submitted: "Deals submitted",
  deals_by_stage: "Live pipeline by stage",
  deals_by_outcome: "Deal outcomes",
  stage_progression: "Stage progression",
  activity: "Activity",
  tasks_completed: "Tasks completed",
};

export const METRIC_HELP: Record<ReportMetric, string> = {
  deals_submitted: "New deals created in the date range.",
  deals_by_stage: "Every live deal right now, grouped by pipeline stage.",
  deals_by_outcome: "Deals that closed in the range — settled, or lost by reason.",
  stage_progression: "How many deals reached a chosen stage during the range.",
  activity: "Logged interactions in the range (emails, calls, meetings, notes).",
  tasks_completed: "Tasks ticked off in the range, grouped by the linked person.",
};

// Which options each metric actually uses. The builder shows only these, and
// stray keys are never persisted — mirrors what runReport reads.
export const metricUsesRange = (m: ReportMetric) => m !== "deals_by_stage";
export const metricUsesProduct = (m: ReportMetric) =>
  m === "deals_submitted" || m === "deals_by_stage" || m === "deals_by_outcome";
export const metricUsesFunder = metricUsesProduct;
export const metricUsesBroker = (m: ReportMetric) =>
  m === "deals_submitted" || m === "deals_by_stage" || m === "deals_by_outcome" || m === "activity" ||
  m === "tasks_completed";
export const metricUsesGroupBy = (m: ReportMetric) => m === "deals_submitted" || m === "activity";
export const metricUsesInteractionType = (m: ReportMetric) => m === "activity";
export const metricUsesTargetStage = (m: ReportMetric) => m === "stage_progression";

export function groupByOptions(m: ReportMetric): { value: GroupBy; label: string }[] {
  if (m === "deals_submitted") {
    return [
      { value: "product", label: "By product" },
      { value: "broker", label: "By broker" },
      { value: "none", label: "Total only" },
    ];
  }
  if (m === "activity") {
    return [
      { value: "type", label: "By type" },
      { value: "broker", label: "By broker" },
    ];
  }
  return [];
}

export function defaultGroupBy(m: ReportMetric): GroupBy | undefined {
  if (m === "deals_submitted") return "product";
  if (m === "activity") return "type";
  return undefined;
}

// ---------------------------------------------------------------------------
// Range presets
// ---------------------------------------------------------------------------

export const RANGE_PRESETS: Exclude<RangePreset, "none">[] = [
  "last_30",
  "last_90",
  "quarter",
  "ytd",
  "custom",
];

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  last_30: "Last 30 days",
  last_90: "Last 90 days",
  quarter: "This quarter",
  ytd: "Year to date",
  custom: "Custom range",
  none: "Current",
};

function quarterStartISO(todayIso: string): string {
  const [y, m] = todayIso.split("-").map(Number);
  const startMonth = Math.floor((m - 1) / 3) * 3 + 1; // 1, 4, 7 or 10
  return `${y}-${String(startMonth).padStart(2, "0")}-01`;
}

// Resolve a stored spec's preset to concrete { from, to }. Rolling presets are
// recomputed against today so saved reports keep rolling forward.
export function resolveRange(stored: StoredSpec): { from?: string; to?: string } {
  const preset = stored.range_preset;
  if (preset === "none") return {};
  if (preset === "custom" || preset == null) return { from: stored.from, to: stored.to };
  const to = todayISO();
  switch (preset) {
    case "last_30":
      return { from: addDaysISO(to, -30), to };
    case "last_90":
      return { from: addDaysISO(to, -90), to };
    case "quarter":
      return { from: quarterStartISO(to), to };
    case "ytd":
      return { from: `${to.slice(0, 4)}-01-01`, to };
    default:
      return { from: stored.from, to: stored.to };
  }
}

// Collapse a stored spec into the exact ReportSpec runReport expects.
export function toRunSpec(stored: StoredSpec): ReportSpec {
  // Drop range_preset and the stored from/to snapshot; re-derive the window.
  const { range_preset: _preset, from: _from, to: _to, ...rest } = stored;
  return { ...rest, ...resolveRange(stored) };
}

// ---------------------------------------------------------------------------
// Defensive coercion — a spec can arrive from an old row or an MCP save_report
// call, so validate before running rather than trusting the jsonb blob.
// ---------------------------------------------------------------------------

export function coerceStoredSpec(raw: unknown): StoredSpec | null {
  if (raw == null || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const metric = s.metric;
  if (typeof metric !== "string" || !REPORT_METRICS.includes(metric as ReportMetric)) return null;

  const out: StoredSpec = { metric: metric as ReportMetric };
  const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

  const rp = str(s.range_preset);
  if (rp) out.range_preset = rp as RangePreset;
  const from = str(s.from);
  if (from) out.from = from;
  const to = str(s.to);
  if (to) out.to = to;
  const product = str(s.product);
  if (product) out.product = product as DealProduct;
  const funder = str(s.funder);
  if (funder) out.funder = funder as DealFunder;
  const brokerId = str(s.broker_id);
  if (brokerId) out.broker_id = brokerId;
  const interactionType = str(s.interaction_type);
  if (interactionType) out.interaction_type = interactionType as InteractionType;
  const targetStage = str(s.target_stage);
  if (targetStage) out.target_stage = targetStage as DealPipelineStage;
  const groupBy = str(s.group_by);
  if (groupBy) out.group_by = groupBy as GroupBy;

  return out;
}

// A one-line, human-readable summary of a spec's window + filters. Funder is
// only ever rendered through FUNDER_LABELS (1 / 2 / 3) — never a real name.
export function describeSpec(stored: StoredSpec): string {
  const parts: string[] = [];

  if (!metricUsesRange(stored.metric)) {
    parts.push("Current");
  } else {
    const preset = stored.range_preset ?? "custom";
    if (preset === "custom") {
      if (stored.from || stored.to) {
        parts.push(`${formatDate(stored.from ?? null)} – ${formatDate(stored.to ?? null)}`);
      } else {
        parts.push(RANGE_PRESET_LABELS.last_90);
      }
    } else {
      parts.push(RANGE_PRESET_LABELS[preset]);
    }
  }

  if (stored.product) parts.push(PRODUCT_LABELS[stored.product]);
  if (stored.funder) parts.push(`Funder ${FUNDER_LABELS[stored.funder]}`);
  if (stored.interaction_type) parts.push(INTERACTION_TYPE_LABELS[stored.interaction_type]);
  if (stored.target_stage) parts.push(`→ ${PIPELINE_STAGE_LABELS[stored.target_stage]}`);

  return parts.join(" · ");
}
