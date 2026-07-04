import type {
  BrokerStage,
  DealFunder,
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

// Encoded straight from the spec — shown as help text in the UI.
export const BROKER_STAGE_HELP: Record<BrokerStage, string> = {
  introduced: "Known of / introduced, not yet properly met.",
  engaged: "Met (coffee/first meeting done), warm, no deal submitted yet. This is the reactivation list.",
  active_submitter: "Has submitted at least one deal.",
  prime: "Multiple concurrent live deals.",
};

export const PIPELINE_STAGES: DealPipelineStage[] = [
  "enquiry",
  "scenario",
  "term_sheet",
  "credit",
  "docs",
  "settlement",
];

export const PIPELINE_STAGE_LABELS: Record<DealPipelineStage, string> = {
  enquiry: "Enquiry",
  scenario: "Scenario",
  term_sheet: "Term Sheet",
  credit: "Credit",
  docs: "Docs",
  settlement: "Settlement",
};

export const DEAL_STATUSES: DealStatus[] = ["live", "settled", "withdrawn", "declined", "fell_over"];

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  live: "Live",
  settled: "Settled",
  withdrawn: "Withdrawn",
  declined: "Declined",
  fell_over: "Fell Over",
};

export const PRODUCTS: DealProduct[] = ["bridge", "draw", "hold", "frame", "other"];

export const PRODUCT_LABELS: Record<DealProduct, string> = {
  bridge: "Bridge",
  draw: "Draw",
  hold: "Hold",
  frame: "Frame",
  other: "Other",
};

export const FUNDERS: DealFunder[] = ["hcp", "first_federal", "other"];

export const FUNDER_LABELS: Record<DealFunder, string> = {
  hcp: "HCP",
  first_federal: "First Federal",
  other: "Other",
};

export const INTERACTION_TYPES: InteractionType[] = ["email", "call", "meeting", "note"];

export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  email: "Email",
  call: "Call",
  meeting: "Meeting",
  note: "Note",
};

// A broker is "gone cold" after this many days without contact.
export const COLD_AFTER_DAYS = 30;

// Today view looks this far ahead for key dates.
export const KEY_DATE_LOOKAHEAD_DAYS = 14;
