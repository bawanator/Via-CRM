"use client";

import { useState, useTransition, type FormEvent } from "react";
import { INTERACTION_TYPES, INTERACTION_TYPE_LABELS } from "@/lib/domain";
import { todayISO } from "@/lib/dates";
import { logInteractionAction } from "@/app/(app)/brokers/actions";
import { Sheet } from "@/components/ui/Sheet";
import { DateField, FieldGroup, SelectField, TextAreaField } from "@/components/ui/Field";
import { SheetSubmitButton } from "@/components/brokers/ContactFormFields";

const FORM_ID = "log-interaction-form";

// The generic "Log" composer — any interaction type (meetings live here).
// Calls and notes also have their own quicker composers on their tabs.
export function LogInteractionSheet({
  brokerId,
  deals,
  open,
  onOpenChange,
}: {
  brokerId: string;
  deals: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (key: string) => {
      const v = fd.get(key);
      return typeof v === "string" ? v : "";
    };
    const input = {
      broker_id: brokerId,
      deal_id: get("deal_id") || null,
      type: get("type"),
      occurred_at: get("occurred_at") || undefined,
      summary: get("summary"),
    };
    startTransition(async () => {
      const res = await logInteractionAction(input);
      if (res.ok) {
        setError(null);
        onOpenChange(false);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Log Interaction"
      action={
        <SheetSubmitButton formId={FORM_ID} pending={pending}>
          Save
        </SheetSubmitButton>
      }
    >
      {/* Remount per open so the previous draft never leaks into a new log. */}
      {open ? (
        <form id={FORM_ID} onSubmit={handleSubmit}>
          <FieldGroup>
            <SelectField label="Type" name="type" defaultValue="meeting">
              {INTERACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INTERACTION_TYPE_LABELS[t]}
                </option>
              ))}
            </SelectField>
            <DateField label="Occurred" name="occurred_at" defaultValue={todayISO()} />
            {deals.length > 0 ? (
              <SelectField label="Deal" name="deal_id" defaultValue="">
                <option value="">None</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </SelectField>
            ) : null}
          </FieldGroup>
          <FieldGroup>
            <TextAreaField label="Summary" name="summary" required placeholder="What happened?" />
          </FieldGroup>
          {error ? <p className="text-footnote px-4 text-red">{error}</p> : null}
        </form>
      ) : null}
    </Sheet>
  );
}
