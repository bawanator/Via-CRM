"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { InteractionRow } from "@/lib/database.types";
import { todayISO } from "@/lib/dates";
import { logCallAction } from "@/app/(app)/brokers/actions";
import { Sheet } from "@/components/ui/Sheet";
import { DateField, FieldGroup, SelectField, TextAreaField } from "@/components/ui/Field";
import { EmptyCardRow, InteractionListRow } from "@/components/brokers/InteractionListRow";
import { SectionHeader, SectionHeaderButton } from "@/components/brokers/SectionHeader";
import { SheetSubmitButton } from "@/components/brokers/ContactFormFields";

const FORM_ID = "log-call-form";
const THIRTY_DAYS_MS = 30 * 86_400_000;

// Calls tab: logged calls newest first, a 30-day cadence caption, and a quick
// "Log Call" composer (summary + optional date + optional linked deal).
export function CallsTab({
  brokerId,
  calls,
  deals,
}: {
  brokerId: string;
  calls: InteractionRow[];
  deals: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Counted client-side from the loaded interactions — no extra query.
  // Date.now() captured in state so render stays pure (same value all renders).
  const [now] = useState(() => Date.now());
  const recentCount = calls.filter((c) => now - Date.parse(c.occurred_at) <= THIRTY_DAYS_MS).length;

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
      occurred_at: get("occurred_at") || undefined,
      summary: get("summary"),
    };
    startTransition(async () => {
      const res = await logCallAction(input);
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
      <SectionHeader title="Calls">
        <SectionHeaderButton
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          Log Call
        </SectionHeaderButton>
      </SectionHeader>
      <p className="text-footnote mb-1.5 px-4 text-label-3">
        {recentCount === 0 ? "No calls in the last 30 days" : `${recentCount} ${recentCount === 1 ? "call" : "calls"} in the last 30 days`}
      </p>

      <div className="card hairline-rows overflow-hidden rounded-xl bg-card">
        {calls.length === 0 ? (
          <EmptyCardRow text="No calls logged yet." />
        ) : (
          calls.map((interaction) => (
            <InteractionListRow key={interaction.id} interaction={interaction} showIcon={false} />
          ))
        )}
      </div>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Log Call"
        action={
          <SheetSubmitButton formId={FORM_ID} pending={pending}>
            Save
          </SheetSubmitButton>
        }
      >
        {open ? (
          <form id={FORM_ID} onSubmit={handleSubmit}>
            <FieldGroup>
              <TextAreaField
                label="Summary"
                name="summary"
                required
                placeholder="Spoke with Jono, discussed new application for client X. Next step: he emails me in a couple of days."
              />
            </FieldGroup>
            <FieldGroup>
              <DateField label="Date" name="occurred_at" defaultValue={todayISO()} />
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
            {error ? <p className="text-footnote px-4 text-red">{error}</p> : null}
          </form>
        ) : null}
      </Sheet>
    </section>
  );
}
