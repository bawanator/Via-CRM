"use client";

import { useState, useTransition } from "react";
import { deleteCompanyAction } from "@/app/(app)/companies/actions";
import { Button } from "@/components/ui/Button";
import { GroupedSection } from "@/components/ui/GroupedList";

// The red "Delete Company" row at the bottom of the org record. First tap arms
// an inline confirm (matching the DealStatusActions pattern). Deleting only
// removes the org record — the people who work here are kept and unlinked.
// On success the action redirects to /companies.
export function DeleteCompanyRow({ companyId }: { companyId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      // On success the action redirects (never resolves with a result here).
      const res = await deleteCompanyAction(companyId);
      if (res && !res.ok) {
        setError(res.error);
        setConfirm(false);
      }
    });
  }

  return (
    <GroupedSection footer="People at this company are kept — they're just unlinked from it.">
      {confirm ? (
        <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-1.5">
          <span className="text-body text-label">Delete this company? People are kept.</span>
          <div className="flex items-center gap-1">
            <Button variant="plain" onClick={() => setConfirm(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={pending} className="font-semibold">
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirm(true);
          }}
          disabled={pending}
          className="text-body pressable flex min-h-11 w-full items-center px-4 py-2.5 text-left text-red disabled:opacity-40"
        >
          Delete Company
        </button>
      )}
      {error ? <p className="text-footnote px-4 pb-2.5 text-red">{error}</p> : null}
    </GroupedSection>
  );
}
