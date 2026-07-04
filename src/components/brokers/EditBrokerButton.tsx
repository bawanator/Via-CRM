"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { BrokerRow } from "@/lib/database.types";
import { formatDate } from "@/lib/format";
import { updateBrokerAction } from "@/app/(app)/brokers/actions";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { DetailRow } from "@/components/ui/GroupedList";
import { DateField, FieldGroup, TextField } from "@/components/ui/Field";
import { BrokerFormFields, brokerFormValues, SheetSubmitButton } from "@/components/brokers/BrokerFormFields";

export type EditableBroker = Pick<
  BrokerRow,
  | "id"
  | "full_name"
  | "company"
  | "email"
  | "phone"
  | "linkedin_url"
  | "stage"
  | "source"
  | "notes"
  | "next_action"
  | "next_action_date"
  | "last_contact_date"
>;

const FORM_ID = "edit-broker-form";

export function EditBrokerButton({ broker }: { broker: EditableBroker }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = brokerFormValues(e.currentTarget);
    startTransition(async () => {
      const res = await updateBrokerAction(broker.id, values);
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
        variant="plain"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Edit
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Edit Broker"
        action={
          <SheetSubmitButton formId={FORM_ID} pending={pending}>
            Save
          </SheetSubmitButton>
        }
      >
        <form id={FORM_ID} onSubmit={handleSubmit}>
          <BrokerFormFields defaults={broker} />
          <FieldGroup
            header="Follow-up"
            footer="Last contact updates automatically when an interaction is logged."
          >
            <TextField
              label="Next Action"
              name="next_action"
              placeholder="e.g. Coffee catch-up"
              defaultValue={broker.next_action ?? ""}
            />
            <DateField label="Due" name="next_action_date" defaultValue={broker.next_action_date ?? ""} />
            <DetailRow label="Last Contact" value={formatDate(broker.last_contact_date)} />
          </FieldGroup>
          {error ? <p className="text-footnote px-4 text-red">{error}</p> : null}
        </form>
      </Sheet>
    </>
  );
}
