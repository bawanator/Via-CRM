"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { createDealAction, promoteBrokerAction } from "@/app/(app)/deals/actions";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { FieldGroup, SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { BROKER_STAGE_LABELS, FUNDER_LABELS, FUNDERS, PIPELINE_STAGE_LABELS, PIPELINE_STAGES, PRODUCT_LABELS, PRODUCTS } from "@/lib/domain";
import type { BrokerStage } from "@/lib/database.types";

type Suggestion = { brokerId: string; brokerName: string; to: BrokerStage; reason: string };

export function AddDealSheet({ brokers }: { brokers: { id: string; full_name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [suggestion, setSuggestion] = useState<(Suggestion & { dealId: string }) | null>(null);

  function reset() {
    setError(null);
    setSuggestion(null);
  }

  function finish(dealId: string) {
    setOpen(false);
    reset();
    router.push(`/deals/${dealId}`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? ""),
      broker_id: String(fd.get("broker_id") ?? ""),
      loan_amount: String(fd.get("loan_amount") ?? ""),
      product: (fd.get("product") as string) || null,
      funder: (fd.get("funder") as string) || null,
      pipeline_stage: String(fd.get("pipeline_stage") ?? "enquiry"),
      security_address: String(fd.get("security_address") ?? ""),
      borrower_entity: String(fd.get("borrower_entity") ?? ""),
      notes: String(fd.get("notes") ?? ""),
    };
    setError(null);
    startTransition(async () => {
      const res = await createDealAction(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.suggestion) {
        setSuggestion({ ...res.suggestion, dealId: res.dealId });
      } else {
        finish(res.dealId);
      }
    });
  }

  function handlePromote() {
    if (!suggestion) return;
    setError(null);
    startTransition(async () => {
      const res = await promoteBrokerAction(suggestion.brokerId, suggestion.to);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      finish(suggestion.dealId);
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // The deal is already created by the time the promotion prompt shows;
        // dismissing the sheet then should still land on the new record.
        if (!next && suggestion) {
          finish(suggestion.dealId);
          return;
        }
        setOpen(next);
        if (!next) reset();
      }}
      title={suggestion ? "Promote Broker?" : "New Deal"}
      trigger={<Button variant="tinted">Add Deal</Button>}
      action={
        suggestion ? null : (
          <Button type="submit" form="add-deal-form" disabled={pending} className="font-semibold">
            Add
          </Button>
        )
      }
    >
      {suggestion ? (
        <div className="flex flex-col items-center gap-1 px-2 py-4 text-center">
          <p className="text-headline text-label">
            Move {suggestion.brokerName} to {BROKER_STAGE_LABELS[suggestion.to]}?
          </p>
          <p className="text-footnote text-label-2">{suggestion.reason}. The stage is never changed automatically.</p>
          {error ? <p className="text-footnote mt-1 text-red">{error}</p> : null}
          <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
            <Button variant="filled" onClick={handlePromote} disabled={pending}>
              Move to {BROKER_STAGE_LABELS[suggestion.to]}
            </Button>
            <Button variant="plain" onClick={() => finish(suggestion.dealId)} disabled={pending}>
              Not Now
            </Button>
          </div>
        </div>
      ) : (
        <form id="add-deal-form" onSubmit={handleSubmit}>
          <FieldGroup>
            <TextField label="Name" name="name" required placeholder="44 Chesterfield Road Epping" autoFocus />
            <SelectField label="Broker" name="broker_id" required defaultValue="">
              <option value="" disabled>
                Select broker
              </option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.full_name}
                </option>
              ))}
            </SelectField>
            <TextField label="Loan Amount" name="loan_amount" inputMode="decimal" placeholder="1,500,000" />
            <SelectField label="Product" name="product" defaultValue="">
              <option value="">None</option>
              {PRODUCTS.map((p) => (
                <option key={p} value={p}>
                  {PRODUCT_LABELS[p]}
                </option>
              ))}
            </SelectField>
            <SelectField label="Funder" name="funder" defaultValue="">
              <option value="">None</option>
              {FUNDERS.map((f) => (
                <option key={f} value={f}>
                  {FUNDER_LABELS[f]}
                </option>
              ))}
            </SelectField>
            <SelectField label="Stage" name="pipeline_stage" defaultValue="enquiry">
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {PIPELINE_STAGE_LABELS[s]}
                </option>
              ))}
            </SelectField>
          </FieldGroup>
          <FieldGroup>
            <TextField label="Security" name="security_address" placeholder="Security address" />
            <TextField label="Borrower" name="borrower_entity" placeholder="Borrower entity" />
            <TextAreaField label="Notes" name="notes" placeholder="Anything worth remembering" />
          </FieldGroup>
          {error ? <p className="text-footnote px-4 text-red">{error}</p> : null}
        </form>
      )}
    </Sheet>
  );
}
