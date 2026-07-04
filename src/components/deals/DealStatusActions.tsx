"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { settleDealAction, updateDealAction } from "@/app/(app)/deals/actions";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { DateField, FieldGroup, TextField } from "@/components/ui/Field";
import { computeMaturityDate, todayISO } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { DEAL_STATUS_LABELS } from "@/lib/domain";
import type { DealStatus } from "@/lib/database.types";

type Outcome = "withdrawn" | "declined" | "fell_over";

const OUTCOMES: { status: Outcome; label: string; destructive: boolean }[] = [
  { status: "withdrawn", label: "Mark Withdrawn", destructive: false },
  { status: "declined", label: "Mark Declined", destructive: false },
  { status: "fell_over", label: "Mark Fell Over", destructive: true },
];

function ActionRow({
  label,
  destructive = false,
  confirming,
  pending,
  onTap,
  onConfirm,
  onCancel,
}: {
  label: string;
  destructive?: boolean;
  confirming: boolean;
  pending: boolean;
  onTap: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (confirming) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-1.5">
        <span className="text-body text-label">{label}?</span>
        <div className="flex items-center gap-1">
          <Button variant="plain" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "plain"}
            onClick={onConfirm}
            disabled={pending}
            className="font-semibold"
          >
            Confirm
          </Button>
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={pending}
      className={`text-body pressable flex min-h-11 w-full items-center px-4 py-2.5 text-left disabled:opacity-40 ${
        destructive ? "text-red" : "text-blue"
      }`}
    >
      {label}
    </button>
  );
}

// Explicit status controls for the deal record. Live deals can settle or be
// marked withdrawn/declined/fell over; closed outcomes can reopen as live.
export function DealStatusActions({ dealId, status }: { dealId: string; status: DealStatus }) {
  const [confirming, setConfirming] = useState<Outcome | "live" | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function changeStatus(next: DealStatus) {
    setError(null);
    startTransition(async () => {
      const res = await updateDealAction(dealId, { status: next });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirming(null);
    });
  }

  if (status !== "live") {
    return (
      <>
        <ActionRow
          label="Reopen as Live"
          confirming={confirming === "live"}
          pending={pending}
          onTap={() => setConfirming("live")}
          onConfirm={() => changeStatus("live")}
          onCancel={() => setConfirming(null)}
        />
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
      {OUTCOMES.map((o) => (
        <ActionRow
          key={o.status}
          label={o.label}
          destructive={o.destructive}
          confirming={confirming === o.status}
          pending={pending}
          onTap={() => setConfirming(o.status)}
          onConfirm={() => changeStatus(o.status)}
          onCancel={() => setConfirming(null)}
        />
      ))}
      {error ? <p className="text-footnote px-4 pb-2.5 text-red">{error}</p> : null}
      <SettleSheet dealId={dealId} open={settleOpen} onOpenChange={setSettleOpen} />
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
      : "Maturity is settlement date plus the loan term.";

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
