"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { createBrokerAction } from "@/app/(app)/brokers/actions";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { BrokerFormFields, brokerFormValues, SheetSubmitButton } from "@/components/brokers/BrokerFormFields";

const FORM_ID = "add-broker-form";

export function AddBrokerButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = brokerFormValues(e.currentTarget);
    startTransition(async () => {
      const res = await createBrokerAction(values);
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
        variant="tinted"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Add Broker
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="New Broker"
        action={
          <SheetSubmitButton formId={FORM_ID} pending={pending}>
            Add
          </SheetSubmitButton>
        }
      >
        <form id={FORM_ID} onSubmit={handleSubmit}>
          <BrokerFormFields />
          {error ? <p className="text-footnote px-4 text-red">{error}</p> : null}
        </form>
      </Sheet>
    </>
  );
}
