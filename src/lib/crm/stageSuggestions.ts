import type { BrokerStage } from "@/lib/database.types";

// Broker stage promotion is never automatic — these rules only power a
// confirm prompt shown to the user after a deal is submitted.
export type StageSuggestion = { to: BrokerStage; reason: string };

export function suggestBrokerPromotion(input: {
  currentStage: BrokerStage;
  totalDealsSubmitted: number;
  liveDealCount: number;
}): StageSuggestion | null {
  const { currentStage, totalDealsSubmitted, liveDealCount } = input;

  if ((currentStage === "introduced" || currentStage === "engaged") && totalDealsSubmitted >= 1) {
    return { to: "active_submitter", reason: "First deal submitted" };
  }

  if (currentStage === "active_submitter" && liveDealCount >= 2) {
    return { to: "prime", reason: "Multiple concurrent live deals" };
  }

  return null;
}
