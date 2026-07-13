"use client";

import { changeLossReasonAction } from "@/app/(app)/deals/actions";
import { InlineSelect } from "@/components/common/InlineSelect";
import { LOSS_REASON_LABELS, LOSS_REASONS } from "@/lib/domain";
import type { DealLossReason } from "@/lib/database.types";

// The editable "Reason" row shown on a Closed / Lost deal. Click to pick a
// different reason; saves immediately via changeLossReasonAction (status stays
// lost). Mirrors the label-left / control-right shape of the deal details rows.
export function LossReasonRow({ dealId, reason }: { dealId: string; reason: DealLossReason | null }) {
  return (
    <div className="flex min-h-11 items-center gap-4 px-4">
      <span className="text-body w-32 shrink-0 text-label">Reason</span>
      <div className="min-w-0 flex-1">
        <InlineSelect
          value={reason}
          options={LOSS_REASONS.map((r) => ({ value: r, label: LOSS_REASON_LABELS[r] }))}
          onSave={(value) => changeLossReasonAction(dealId, value)}
          ariaLabel="Loss reason"
          placeholder="—"
        />
      </div>
    </div>
  );
}
