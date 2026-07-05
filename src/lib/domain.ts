import type {
  BrokerStage,
  DealFunder,
  DealLossReason,
  DealPipelineStage,
  DealProduct,
  DealStatus,
  InteractionType,
} from "@/lib/database.types";

export const BROKER_STAGES: BrokerStage[] = ["introduced", "engaged", "active_submitter", "prime"];

export const BROKER_STAGE_LABELS: Record<BrokerStage, string> = {
  introduced: "Introduced",
  engaged: "Engaged",
  active_submitter: "Active Submitter",
  prime: "Prime",
};

// Kept for reference/help text where useful. The broker kanban shows only the
// title (no inline descriptions) per design.
export const BROKER_STAGE_HELP: Record<BrokerStage, string> = {
  introduced: "Known of / introduced, not yet properly met.",
  engaged: "Met, warm, no deal submitted yet. The reactivation list.",
  active_submitter: "Has submitted at least one deal.",
  prime: "Multiple concurrent live deals.",
};

// Deal pipeline — starts at Scenario (no Enquiry). Closed/Lost is a terminal
// board column handled via status, not a pipeline_stage value.
export const PIPELINE_STAGES: DealPipelineStage[] = ["scenario", "term_sheet", "credit", "docs", "settlement"];

export const PIPELINE_STAGE_LABELS: Record<DealPipelineStage, string> = {
  scenario: "Scenario",
  term_sheet: "Term Sheet",
  credit: "Credit",
  docs: "Docs",
  settlement: "Settlement",
};

export const DEAL_STATUSES: DealStatus[] = ["live", "settled", "lost"];

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  live: "Live",
  settled: "Settled",
  lost: "Closed / Lost",
};

// Required when a deal is moved to Closed / Lost.
export const LOSS_REASONS: DealLossReason[] = [
  "outside_mandate",
  "unknown_broker",
  "failed_broker_dd",
  "failed_customer_dd",
  "lost_to_competitor",
  "ghosted",
];

export const LOSS_REASON_LABELS: Record<DealLossReason, string> = {
  outside_mandate: "Outside mandate",
  unknown_broker: "Unknown broker",
  failed_broker_dd: "Failed broker DD",
  failed_customer_dd: "Failed customer DD",
  lost_to_competitor: "Lost to competitor",
  ghosted: "Ghosted",
};

export const PRODUCTS: DealProduct[] = ["bridging", "equity_release", "purchase", "residual_stock", "other"];

export const PRODUCT_LABELS: Record<DealProduct, string> = {
  bridging: "Bridging",
  equity_release: "Equity Release",
  purchase: "Purchase",
  residual_stock: "Residual Stock",
  other: "Other",
};

// Funders are code-named. The real names appear NOWHERE in the app — not in
// labels, not in the kanban, not in exports. Displayed only as 1 / 2 / 3.
export const FUNDERS: DealFunder[] = ["funder_1", "funder_2", "funder_3"];

export const FUNDER_LABELS: Record<DealFunder, string> = {
  funder_1: "1",
  funder_2: "2",
  funder_3: "3",
  other: "—",
};

export const INTERACTION_TYPES: InteractionType[] = ["email", "call", "meeting", "note"];

export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  email: "Email",
  call: "Call",
  meeting: "Meeting",
  note: "Note",
};

// The default contact type new contacts get. The full list is data-driven
// (contact_types table) so more can be added without code.
export const DEFAULT_CONTACT_TYPE = "Broker";

// A broker is "gone cold" after this many days without contact.
export const COLD_AFTER_DAYS = 30;

// Today view looks this far ahead for key dates.
export const KEY_DATE_LOOKAHEAD_DAYS = 14;
