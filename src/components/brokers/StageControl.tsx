"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import type { BrokerStage } from "@/lib/database.types";
import { BROKER_STAGES, BROKER_STAGE_HELP, BROKER_STAGE_LABELS } from "@/lib/domain";
import { updateContactStageAction } from "@/app/(app)/brokers/actions";
import { GroupedSection } from "@/components/ui/GroupedList";
import { SelectField } from "@/components/ui/Field";

// The one manual stage control — stages never change silently. The select
// shows the chosen stage optimistically and reverts if the save fails.
// Broker-only: the record page renders it just for Broker-type contacts.
export function StageControl({ contactId, stage }: { contactId: string; stage: BrokerStage }) {
  const router = useRouter();
  const [optimisticStage, setOptimisticStage] = useOptimistic(stage);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleChange(next: string) {
    const nextStage = next as BrokerStage;
    setError(null);
    startTransition(async () => {
      setOptimisticStage(nextStage);
      const res = await updateContactStageAction(contactId, nextStage);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <GroupedSection
      header="Stage"
      footer={
        <>
          {BROKER_STAGE_HELP[optimisticStage]}
          {error ? <span className="block text-red">{error}</span> : null}
        </>
      }
    >
      <SelectField
        label="Stage"
        value={optimisticStage}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value)}
      >
        {BROKER_STAGES.map((s) => (
          <option key={s} value={s}>
            {BROKER_STAGE_LABELS[s]}
          </option>
        ))}
      </SelectField>
    </GroupedSection>
  );
}
