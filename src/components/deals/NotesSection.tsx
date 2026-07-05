"use client";

import { updateDealFieldAction } from "@/app/(app)/deals/actions";
import { GroupedSection } from "@/components/ui/GroupedList";
import { InlineTextarea } from "@/components/common/InlineTextarea";

// Inline, click-to-edit notes — no Edit button, no sheet.
export function NotesSection({ dealId, notes }: { dealId: string; notes: string | null }) {
  return (
    <GroupedSection header="Notes">
      <div className="px-4 py-1.5">
        <InlineTextarea
          value={notes}
          onSave={(v) => updateDealFieldAction(dealId, "notes", v)}
          ariaLabel="Deal notes"
          placeholder="No notes yet."
          rows={6}
        />
      </div>
    </GroupedSection>
  );
}
