"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { loseDealAction, reopenDealAction, settleDealAction } from "@/app/(app)/deals/actions";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { DateField, FieldGroup, TextField } from "@/components/ui/Field";
import { computeMaturityDate, todayISO } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { DEAL_STATUS_LABELS, LOSS_REASON_LABELS, LOSS_REASONS } from "@/lib/domain";
import type { DealLossReason, DealStatus } from "@/lib/database.types";

// Explicit status controls for the deal record. Live deals can settle or be
// marked closed/lost (with a required reason); settled/lost deals can reopen.
export function DealStatusActions({ dealId, status }: { dealId: string; status: DealStatus }) {
  const [settleOpen, setSettleOpen] = useState(false);
  const [loseOpen, setLoseOpen] = useState(false);
  const [reopenConfirm, setReopenConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reopen() {
    setError(null);
    startTransition(async () => {
      const res = await reopenDealAction(dealId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setReopenConfirm(false);
    });
  }

  if (status !== "live") {
    return (
      <>
        {reopenConfirm ? (
          <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-1.5">
            <span className="text-body text-label">Reopen as live?</span>
            <div className="flex items-center gap-1">
              <Button variant="plain" onClick={() => setReopenConfirm(false)} disabled={pending}>
                Cancel
              </Button>
              <Button variant="plain" onClick={reopen} disabled={pending} className="font-semibold">
                Reopen
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setReopenConfirm(true)}
            disabled={pending}
            className="text-body pressable flex min-h-11 w-full items-center px-4 py-2.5 text-left text-blue disabled:opacity-40"
          >
            Reopen as Live
          </button>
        )}
        {error ? <p className="text-footnote px-4 pb-2.5 text-red">{error}</p> : null}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setSettleOpen(true)}
        className="text-body pressable flex min-h-11 w-full items-center px-4 py-2.5 text-left text-blue"
      >
        Mark Settled…
      </button>
      <button
        type="button"
        onClick={() => setLoseOpen(true)}
        className="text-body pressable flex min-h-11 w-full items-center px-4 py-2.5 text-left text-red"
      >
        Mark Closed / Lost…
      </button>
      {error ? <p className="text-footnote px-4 pb-2.5 text-red">{error}</p> : null}
      <SettleSheet dealId={dealId} open={settleOpen} onOpenChange={setSettleOpen} />
      <LoseSheet dealId={dealId} open={loseOpen} onOpenChange={setLoseOpen} />
    </>
  );
}

function SettleSheet({
  dealId,
  open,
  onOpenChange,
}: {
  dealId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [date, setDate] = useState(() => todayISO());
  const [months, setMonths] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const term = Number(months);
  const validTerm = Number.isInteger(term) && term > 0;
  const preview =
    /^\d{4}-\d{2}-\d{2}$/.test(date) && validTerm
      ? `Maturity: ${formatDate(computeMaturityDate(date, term))}`
      : "Maturity is the settlement date plus the loan term.";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await settleDealAction(dealId, {
        settlement_date: date,
        loan_term_months: validTerm ? term : Number.NaN,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setError(null);
      }}
      title={`Mark ${DEAL_STATUS_LABELS.settled}`}
      action={
        <Button type="submit" form="settle-deal-form" disabled={pending || !validTerm} className="font-semibold">
          Settle
        </Button>
      }
    >
      <form id="settle-deal-form" onSubmit={handleSubmit}>
        <FieldGroup footer={preview}>
          <DateField label="Settlement" value={date} required onChange={(e) => setDate(e.target.value)} />
          <TextField
            label="Term (months)"
            inputMode="numeric"
            placeholder="18"
            required
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          />
        </FieldGroup>
        {error ? <p className="text-footnote px-4 text-red">{error}</p> : null}
      </form>
    </Sheet>
  );
}

function LoseSheet({
  dealId,
  open,
  onOpenChange,
}: {
  dealId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(reason: DealLossReason) {
    setError(null);
    startTransition(async () => {
      const res = await loseDealAction(dealId, { loss_reason: reason });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setError(null);
      }}
      title="Closed / Lost"
    >
      <p className="text-footnote mb-3 px-1 text-label-2">Why did this deal close? Pick a reason.</p>
      <div className="card hairline-rows overflow-hidden rounded-xl bg-card">
        {LOSS_REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            onClick={() => choose(reason)}
            disabled={pending}
            className="text-body pressable flex min-h-11 w-full items-center px-4 py-2.5 text-left text-label disabled:opacity-40"
          >
            {LOSS_REASON_LABELS[reason]}
          </button>
        ))}
      </div>
      {error ? <p className="text-footnote mt-3 px-4 text-red">{error}</p> : null}
    </Sheet>
  );
}
