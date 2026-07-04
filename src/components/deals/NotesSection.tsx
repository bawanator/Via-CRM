"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { updateDealAction } from "@/app/(app)/deals/actions";
import { Button } from "@/components/ui/Button";
import { GroupedSection } from "@/components/ui/GroupedList";
import { Sheet } from "@/components/ui/Sheet";
import { FieldGroup, TextAreaField } from "@/components/ui/Field";

export function NotesSection({ dealId, notes }: { dealId: string; notes: string | null }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await updateDealAction(dealId, { notes: String(fd.get("notes") ?? "") });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <GroupedSection header="Notes">
      <div className="px-4 py-3">
        {notes ? (
          <p className="text-body whitespace-pre-wrap text-label">{notes}</p>
        ) : (
          <p className="text-body text-label-3">No notes yet.</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-body pressable flex min-h-11 w-full items-center px-4 py-2.5 text-left text-blue"
      >
        Edit Notes
      </button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
        title="Edit Notes"
        action={
          <Button type="submit" form="edit-notes-form" disabled={pending} className="font-semibold">
            Save
          </Button>
        }
      >
        <form id="edit-notes-form" onSubmit={handleSubmit}>
          <FieldGroup>
            <TextAreaField label="Notes" name="notes" rows={8} defaultValue={notes ?? ""} />
          </FieldGroup>
          {error ? <p className="text-footnote px-4 text-red">{error}</p> : null}
        </form>
      </Sheet>
    </GroupedSection>
  );
}
