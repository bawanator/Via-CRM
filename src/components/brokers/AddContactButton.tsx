"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { ContactTypeRow } from "@/lib/database.types";
import { createContactAction } from "@/app/(app)/brokers/actions";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { ContactFormFields, contactFormValues, SheetSubmitButton } from "@/components/brokers/ContactFormFields";

const FORM_ID = "add-contact-form";

export function AddContactButton({ types }: { types: ContactTypeRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = contactFormValues(e.currentTarget);
    startTransition(async () => {
      const res = await createContactAction(values);
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
    <>
      <Button
        variant="filled"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Add Contact
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="New Contact"
        action={
          <SheetSubmitButton formId={FORM_ID} pending={pending}>
            Add
          </SheetSubmitButton>
        }
      >
        {/* Remount the fields each time the sheet opens so type/stage state resets. */}
        {open ? (
          <form id={FORM_ID} onSubmit={handleSubmit}>
            <ContactFormFields types={types} />
            {error ? <p className="text-footnote px-4 text-red">{error}</p> : null}
          </form>
        ) : null}
      </Sheet>
    </>
  );
}
