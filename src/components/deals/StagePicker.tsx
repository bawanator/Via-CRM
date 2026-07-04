"use client";

import { useState, useTransition } from "react";
import { moveDealStageAction } from "@/app/(app)/deals/actions";
import { SelectField } from "@/components/ui/Field";
import { PIPELINE_STAGE_LABELS, PIPELINE_STAGES } from "@/lib/domain";
import type { DealPipelineStage } from "@/lib/database.types";

// Explicit stage control — no drag-and-drop anywhere in the pipeline.
export function StagePicker({ dealId, stage }: { dealId: string; stage: DealPipelineStage }) {
  const [value, setValue] = useState<DealPipelineStage>(stage);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <SelectField
        label="Stage"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as DealPipelineStage;
          const previous = value;
          setValue(next);
          setError(null);
          startTransition(async () => {
            const res = await moveDealStageAction(dealId, next);
            if (!res.ok) {
              setValue(previous);
              setError(res.error);
            }
          });
        }}
      >
        {PIPELINE_STAGES.map((s) => (
          <option key={s} value={s}>
            {PIPELINE_STAGE_LABELS[s]}
          </option>
        ))}
      </SelectField>
      {error ? <p className="text-footnote px-4 pb-2 text-red">{error}</p> : null}
    </div>
  );
}
