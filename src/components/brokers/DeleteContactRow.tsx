"use client";

import { useState, useTransition } from "react";
import { deleteContactAction } from "@/app/(app)/brokers/actions";
import { Button } from "@/components/ui/Button";
import { GroupedSection } from "@/components/ui/GroupedList";

// The red "Delete Contact" row at the very bottom of the record. First tap
// arms an inline confirm (matching the DealStatusActions pattern); the delete
// only fires from the explicit Delete button. A contact with deals can't be
// deleted — the server's "This contact has N deal(s)…" message shows inline.
// On success the action redirects to /brokers.
export function DeleteContactRow({ contactId }: { contactId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      // On success the action redirects (never resolves with a result here).
      const res = await deleteContactAction(contactId);
      if (res && !res.ok) {
        setError(res.error);
        setConfirm(false);
      }
    });
  }

  return (
    <GroupedSection footer="Deletes this contact and their logged activity, tasks and links. Companies and deals are never deleted this way.">
      {confirm ? (
        <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-1.5">
          <span className="text-body text-label">Delete this contact?</span>
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
          Delete Contact
        </button>
      )}
      {error ? <p className="text-footnote px-4 pb-2.5 text-red">{error}</p> : null}
    </GroupedSection>
  );
}
