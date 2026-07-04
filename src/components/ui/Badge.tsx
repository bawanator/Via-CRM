import type { ReactNode } from "react";
import type { BrokerStage, DealStatus } from "@/lib/database.types";

// Semantic colours only, and never the same colour for two meanings:
// green = settled/on-track, red = fell over/overdue, orange = due soon,
// gray = neutral metadata, blue = stage/identity accents.
export type BadgeTone = "gray" | "blue" | "green" | "red" | "orange";

const tones: Record<BadgeTone, string> = {
  gray: "bg-fill text-label-2",
  blue: "bg-blue/15 text-blue",
  green: "bg-green/15 text-green",
  red: "bg-red/15 text-red",
  orange: "bg-orange/15 text-orange",
};

export function Badge({ tone = "gray", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`text-caption-1 inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export const DEAL_STATUS_TONE: Record<DealStatus, BadgeTone> = {
  live: "blue",
  settled: "green",
  withdrawn: "gray",
  declined: "gray",
  fell_over: "red",
};

export const BROKER_STAGE_TONE: Record<BrokerStage, BadgeTone> = {
  introduced: "gray",
  engaged: "orange",
  active_submitter: "blue",
  prime: "green",
};
