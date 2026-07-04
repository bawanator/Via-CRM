"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import {
  addKeyDateAction,
  completeKeyDateAction,
  deleteKeyDateAction,
  updateKeyDateAction,
} from "@/app/(app)/deals/actions";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { GroupedSection } from "@/components/ui/GroupedList";
import { Sheet } from "@/components/ui/Sheet";
import { DateField, FieldGroup, TextField } from "@/components/ui/Field";
import { daysBetween, todayISO } from "@/lib/dates";
import { formatDate, relativeDays } from "@/lib/format";
import type { KeyDateRow } from "@/lib/database.types";

function dueTone(keyDate: KeyDateRow): BadgeTone {
  const diff = daysBetween(todayISO(), keyDate.due_date);
  if (diff < 0) return "red";
  if (diff <= keyDate.remind_days_before) return "orange";
  return "gray";
}

// Dates + reminders on a deal — the entire settled-loan management system.
export function KeyDatesSection({ dealId, keyDates }: { dealId: string; keyDates: KeyDateRow[] }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<KeyDateRow | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(keyDate: KeyDateRow) {
    setRowError(null);
    startTransition(async () => {
      const res = await completeKeyDateAction(dealId, keyDate.id, !keyDate.completed);
      if (!res.ok) setRowError(res.error);
    });
  }

  return (
    <GroupedSection header="Key Dates">
      {keyDates.map((kd) => (
        <div key={kd.id} className="flex min-h-11 items-center gap-3 py-1.5 pl-2 pr-4">
          <button
            type="button"
            aria-label={kd.completed ? `Mark ${kd.label} not completed` : `Mark ${kd.label} completed`}
            onClick={() => toggle(kd)}
            disabled={pending}
            className="pressable flex h-11 w-11 shrink-0 items-center justify-center"
          >
            {kd.completed ? (
              <span className="flex h-5.5 w-5.5 items-center justify-center rounded-full bg-blue">
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden>
                  <path d="m2.5 6.5 2.3 2.3 4.7-5.6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : (
              <span className="h-5.5 w-5.5 rounded-full border-[1.5px] border-label-3" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setEditing(kd)}
            className="pressable min-w-0 flex-1 py-1 text-left"
          >
            <p className={`text-body ${kd.completed ? "text-label-3 line-through" : "text-label"}`}>{kd.label}</p>
            <p className="text-footnote text-label-2">due {formatDate(kd.due_date)}</p>
          </button>
          {kd.completed ? null : <Badge tone={dueTone(kd)}>{relativeDays(kd.due_date)}</Badge>}
        </div>
      ))}
      {rowError ? <p className="text-footnote px-4 py-2 text-red">{rowError}</p> : null}
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="text-body pressable flex min-h-11 w-full items-center px-4 py-2.5 text-left text-blue"
      >
        Add Key Date
      </button>

      <AddKeyDateSheet dealId={dealId} open={adding} onOpenChange={setAdding} />
      <EditKeyDateSheet
        dealId={dealId}
        keyDate={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </GroupedSection>
  );
}

function AddKeyDateSheet({
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const payload = {
      deal_id: dealId,
      label: String(fd.get("label") ?? ""),
      due_date: String(fd.get("due_date") ?? ""),
      remind_days_before: Number(fd.get("remind_days_before") ?? 7),
    };
    setError(null);
    startTransition(async () => {
      const res = await addKeyDateAction(payload);
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
      title="Add Key Date"
      action={
        <Button type="submit" form="add-key-date-form" disabled={pending} className="font-semibold">
          Add
        </Button>
      }
    >
      <form id="add-key-date-form" onSubmit={handleSubmit}>
        <FieldGroup footer="You'll see it on Today this many days before it's due.">
          <TextField label="Label" name="label" required placeholder="First interest payment due" autoFocus />
          <DateField label="Due" name="due_date" required />
          <TextField label="Remind" name="remind_days_before" inputMode="numeric" defaultValue="7" required />
        </FieldGroup>
        {error ? <p className="text-footnote px-4 text-red">{error}</p> : null}
      </form>
    </Sheet>
  );
}

function EditKeyDateSheet({
  dealId,
  keyDate,
  onOpenChange,
}: {
  dealId: string;
  keyDate: KeyDateRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function close() {
    setError(null);
    setConfirmingDelete(false);
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!keyDate) return;
    const fd = new FormData(event.currentTarget);
    const payload = {
      label: String(fd.get("label") ?? ""),
      due_date: String(fd.get("due_date") ?? ""),
      remind_days_before: Number(fd.get("remind_days_before") ?? 7),
    };
    setError(null);
    startTransition(async () => {
      const res = await updateKeyDateAction(dealId, keyDate.id, payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      close();
    });
  }

  function handleDelete() {
    if (!keyDate) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteKeyDateAction(dealId, keyDate.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      close();
    });
  }

  return (
    <Sheet
      open={keyDate !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="Edit Key Date"
      action={
        <Button type="submit" form="edit-key-date-form" disabled={pending} className="font-semibold">
          Save
        </Button>
      }
    >
      {keyDate ? (
        <form id="edit-key-date-form" onSubmit={handleSubmit} key={keyDate.id}>
          <FieldGroup>
            <TextField label="Label" name="label" required defaultValue={keyDate.label} />
            <DateField label="Due" name="due_date" required defaultValue={keyDate.due_date} />
            <TextField
              label="Remind"
              name="remind_days_before"
              inputMode="numeric"
              required
              defaultValue={String(keyDate.remind_days_before)}
            />
          </FieldGroup>
          <div className="overflow-hidden rounded-xl bg-card">
            {confirmingDelete ? (
              <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-1.5">
                <span className="text-body text-label">Delete this key date?</span>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="plain" onClick={() => setConfirmingDelete(false)} disabled={pending}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={pending}
                    className="font-semibold"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={pending}
                className="text-body pressable flex min-h-11 w-full items-center px-4 py-2.5 text-red disabled:opacity-40"
              >
                Delete Key Date
              </button>
            )}
          </div>
          {error ? <p className="text-footnote mt-3 px-4 text-red">{error}</p> : null}
        </form>
      ) : null}
    </Sheet>
  );
}
