"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { updateBrokerAction } from "@/app/(app)/brokers/actions";
import { Sheet } from "@/components/ui/Sheet";
import { FieldGroup, TextAreaField } from "@/components/ui/Field";
import { SectionHeader, SectionHeaderButton } from "@/components/brokers/SectionHeader";
import { SheetSubmitButton } from "@/components/brokers/BrokerFormFields";

const FORM_ID = "edit-notes-form";

export function NotesSection({ brokerId, notes }: { brokerId: string; notes: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const value = fd.get("notes");
    startTransition(async () => {
      const res = await updateBrokerAction(brokerId, { notes: typeof value === "string" ? value : "" });
      if (res.ok) {
        setError(null);
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <section className="mb-6">
      <SectionHeader title="Notes">
        <SectionHeaderButton
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          Edit Notes
        </SectionHeaderButton>
      </SectionHeader>
      <div className="rounded-xl bg-card px-4 py-3">
        {notes ? (
          <p className="text-body whitespace-pre-wrap text-label">{notes}</p>
        ) : (
          <p className="text-footnote text-label-3">No notes yet.</p>
        )}
      </div>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Notes"
        action={
          <SheetSubmitButton formId={FORM_ID} pending={pending}>
            Save
          </SheetSubmitButton>
        }
      >
        <form id={FORM_ID} onSubmit={handleSubmit}>
          <FieldGroup>
            <TextAreaField
              label="Notes"
              name="notes"
              rows={8}
              placeholder="What's important to them"
              defaultValue={notes ?? ""}
            />
          </FieldGroup>
          {error ? <p className="text-footnote px-4 text-red">{error}</p> : null}
        </form>
      </Sheet>
    </section>
  );
}
