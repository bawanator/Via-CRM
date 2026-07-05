"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { createBrokerQuickAction, createDealAction, promoteBrokerAction } from "@/app/(app)/deals/actions";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { FieldGroup, SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import {
  BROKER_STAGE_LABELS,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGES,
  PRODUCT_LABELS,
  PRODUCTS,
} from "@/lib/domain";
import type { BrokerStage } from "@/lib/database.types";

const NEW_BROKER = "__new_broker__";

type Broker = { id: string; full_name: string };
type Suggestion = { brokerId: string; brokerName: string; to: BrokerStage; reason: string };
type Mode = "deal" | "newBroker";

// Funder is intentionally NOT on the create form — it's set later on the record
// (and only ever shown as a codename). The deal fields are kept mounted while
// the nested "new broker" mini-form is open, so nothing typed is lost.
export function AddDealSheet({ brokers }: { brokers: Broker[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("deal");
  const [brokerList, setBrokerList] = useState<Broker[]>(brokers);
  const [brokerId, setBrokerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [brokerError, setBrokerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [suggestion, setSuggestion] = useState<(Suggestion & { dealId: string }) | null>(null);

  function resetAll() {
    setMode("deal");
    setBrokerId("");
    setError(null);
    setBrokerError(null);
    setSuggestion(null);
    setBrokerList(brokers);
  }

  function finish(dealId: string) {
    setOpen(false);
    resetAll();
    router.push(`/deals/${dealId}`);
  }

  function handleDealSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!brokerId) {
      setError("Select a broker.");
      return;
    }
    const fd = new FormData(event.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? ""),
      broker_id: brokerId,
      loan_amount: String(fd.get("loan_amount") ?? ""),
      product: (fd.get("product") as string) || null,
      pipeline_stage: String(fd.get("pipeline_stage") ?? "scenario"),
      security_address: String(fd.get("security_address") ?? ""),
      borrower_entity: String(fd.get("borrower_entity") ?? ""),
      borrower_contact_name: String(fd.get("borrower_contact_name") ?? ""),
      borrower_contact_email: String(fd.get("borrower_contact_email") ?? ""),
      borrower_contact_phone: String(fd.get("borrower_contact_phone") ?? ""),
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

  function handleBrokerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const payload = {
      full_name: String(fd.get("full_name") ?? ""),
      company: String(fd.get("company") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      location: String(fd.get("location") ?? ""),
    };
    setBrokerError(null);
    startTransition(async () => {
      const res = await createBrokerQuickAction(payload);
      if (!res.ok) {
        setBrokerError(res.error);
        return;
      }
      setBrokerList((cur) =>
        [...cur, res.broker].sort((a, b) => a.full_name.localeCompare(b.full_name)),
      );
      setBrokerId(res.broker.id);
      setMode("deal");
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

  const title = suggestion ? "Promote Broker?" : mode === "newBroker" ? "New Broker" : "New Deal";
  const action = suggestion ? null : mode === "newBroker" ? (
    <Button type="submit" form="quick-broker-form" disabled={pending} className="font-semibold">
      Create
    </Button>
  ) : (
    <Button type="submit" form="add-deal-form" disabled={pending} className="font-semibold">
      Add
    </Button>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // The deal already exists by the time the promotion prompt shows;
        // dismissing then should still land on the new record.
        if (!next && suggestion) {
          finish(suggestion.dealId);
          return;
        }
        setOpen(next);
        if (!next) resetAll();
      }}
      title={title}
      trigger={<Button variant="tinted">Add Deal</Button>}
      action={action}
    >
      {suggestion ? (
        <div className="flex flex-col items-center gap-1 px-2 py-4 text-center">
          <p className="text-headline text-label">
            Move {suggestion.brokerName} to {BROKER_STAGE_LABELS[suggestion.to]}?
          </p>
          <p className="text-footnote text-label-2">
            {suggestion.reason}. The stage is never changed automatically.
          </p>
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
        <>
          <div className={mode === "deal" ? "" : "hidden"}>
            <form id="add-deal-form" onSubmit={handleDealSubmit}>
              <FieldGroup>
                <TextField label="Name" name="name" required placeholder="44 Chesterfield Road Epping" autoFocus />
                <SelectField
                  label="Broker"
                  value={brokerId}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === NEW_BROKER) {
                      setBrokerError(null);
                      setMode("newBroker");
                      return;
                    }
                    setBrokerId(v);
                  }}
                >
                  <option value="" disabled>
                    Select broker
                  </option>
                  {brokerList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.full_name}
                    </option>
                  ))}
                  <option value={NEW_BROKER}>+ New broker…</option>
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
                <SelectField label="Stage" name="pipeline_stage" defaultValue="scenario">
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {PIPELINE_STAGE_LABELS[s]}
                    </option>
                  ))}
                </SelectField>
                <TextField label="Security" name="security_address" placeholder="Security address" />
              </FieldGroup>
              <FieldGroup header="Borrower">
                <TextField label="Entity" name="borrower_entity" placeholder="Borrower entity" />
                <TextField label="Contact" name="borrower_contact_name" placeholder="Contact name" />
                <TextField label="Email" name="borrower_contact_email" type="email" placeholder="name@company.com" />
                <TextField label="Phone" name="borrower_contact_phone" type="tel" placeholder="04…" />
              </FieldGroup>
              <FieldGroup>
                <TextAreaField label="Notes" name="notes" placeholder="Anything worth remembering" />
              </FieldGroup>
              {error ? <p className="text-footnote px-4 text-red">{error}</p> : null}
            </form>
          </div>

          {mode === "newBroker" ? (
            <form id="quick-broker-form" onSubmit={handleBrokerSubmit}>
              <FieldGroup footer="Creates a Broker-type contact and selects it on the deal.">
                <TextField label="Name" name="full_name" required placeholder="Full name" autoFocus />
                <TextField label="Company" name="company" placeholder="Brokerage" />
                <TextField
                  label="Email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  placeholder="name@company.com"
                />
                <TextField label="Phone" name="phone" type="tel" inputMode="tel" placeholder="04…" />
                <TextField label="Location" name="location" placeholder="Melbourne" />
              </FieldGroup>
              {brokerError ? <p className="text-footnote px-4 text-red">{brokerError}</p> : null}
              <div className="px-4 pt-1">
                <Button
                  type="button"
                  variant="plain"
                  onClick={() => {
                    setBrokerError(null);
                    setMode("deal");
                  }}
                  disabled={pending}
                >
                  ← Back to deal
                </Button>
              </div>
            </form>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
