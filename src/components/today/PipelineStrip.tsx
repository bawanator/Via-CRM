import Link from "next/link";
import type { DealPipelineStage } from "@/lib/database.types";
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS } from "@/lib/domain";

// Glance strip: six stage counts in one tappable card. Not a chart.
export function PipelineStrip({ counts }: { counts: Record<DealPipelineStage, number> }) {
  return (
    <section className="mb-6">
      <h2 className="text-footnote mb-1.5 px-4 uppercase tracking-wide text-label-2">Live Pipeline</h2>
      <Link
        href="/deals"
        className="pressable grid min-h-11 grid-cols-6 items-start overflow-hidden rounded-xl bg-card px-2 py-3"
      >
        {PIPELINE_STAGES.map((stage) => {
          const count = counts[stage];
          const dimmed = count === 0;
          return (
            <span key={stage} className="flex flex-col items-center gap-0.5 text-center">
              <span className={`text-title-3 ${dimmed ? "text-label-3" : "text-label"}`}>{count}</span>
              <span className={`text-caption-1 leading-tight ${dimmed ? "text-label-3" : "text-label-2"}`}>
                {PIPELINE_STAGE_LABELS[stage]}
              </span>
            </span>
          );
        })}
      </Link>
    </section>
  );
}
