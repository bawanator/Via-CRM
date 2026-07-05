"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import {
  addGuarantorAction,
  deleteGuarantorAction,
  updateGuarantorAction,
} from "@/app/(app)/deals/actions";
import { Button } from "@/components/ui/Button";
import { GroupedSection } from "@/components/ui/GroupedList";
import { Sheet } from "@/components/ui/Sheet";
import { DateField, FieldGroup, TextAreaField, TextField } from "@/components/ui/Field";
import { formatDate } from "@/lib/format";
import type { GuarantorRow } from "@/lib/database.types";

const MAX_GUARANTORS = 3;

export function GuarantorsSection({
  dealId,
  guarantors,
}: {
  dealId: string;
  guarantors: GuarantorRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<GuarantorRow | null>(null);
  const atCap = guarantors.length >= MAX_GUARANTORS;

  return (
    <GroupedSection
      header="Guarantors"
      footer={atCap ? "A deal can have at most three guarantors." : undefined}
    >
      {guarantors.map((g) => {
        const subtitle = [g.email, g.phone, g.date_of_birth ? `DOB ${formatDate(g.date_of_birth)}` : null]
          .filter(Boolean)
          .join(" · ");
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => setEditing(g)}
            className="pressable flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left"
          >
            <div className="min-w-0 flex-1">
              <p className="text-body truncate text-label">{g.full_name}</p>
              {subtitle ? <p className="text-footnote truncate text-label-2">{subtitle}</p> : null}
            </div>
            <svg className="h-3.5 w-3.5 shrink-0 text-label-3" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M5 2.5 9.5 7 5 11.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        );
      })}
      {guarantors.length === 0 ? (
        <div className="px-4 py-3">
          <p className="text-footnote text-label-3">No guarantors yet.</p>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setAdding(true)}
        disabled={atCap}
        className="text-body pressable flex min-h-11 w-full items-center px-4 py-2.5 text-left text-blue disabled:opacity-40"
      >
        Add Guarantor
      </button>

      <AddGuarantorSheet dealId={dealId} open={adding} onOpenChange={setAdding} />
      <EditGuarantorSheet
        dealId={dealId}
        guarantor={editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      />
    </GroupedSection>
  );
}

function guarantorPayload(fd: FormData) {
  return {
    full_name: String(fd.get("full_name") ?? ""),
    date_of_birth: String(fd.get("date_of_birth") ?? ""),
    email: String(fd.get("email") ?? ""),
    phone: String(fd.get("phone") ?? ""),
    address: String(fd.get("address") ?? ""),
    notes: String(fd.get("notes") ?? ""),
  };
}

function GuarantorFields({ guarantor }: { guarantor?: GuarantorRow }) {
  return (
    <>
      <FieldGroup>
        <TextField label="Name" name="full_name" required placeholder="Full name" defaultValue={guarantor?.full_name ?? ""} />
        <DateField label="DOB" name="date_of_birth" defaultValue={guarantor?.date_of_birth ?? ""} />
        <TextField
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          placeholder="name@email.com"
          defaultValue={guarantor?.email ?? ""}
        />
        <TextField label="Phone" name="phone" type="tel" inputMode="tel" placeholder="04…" defaultValue={guarantor?.phone ?? ""} />
        <TextField label="Address" name="address" placeholder="Residential address" defaultValue={guarantor?.address ?? ""} />
      </FieldGroup>
      <FieldGroup>
        <TextAreaField label="Notes" name="notes" placeholder="Anything worth noting" defaultValue={guarantor?.notes ?? ""} />
      </FieldGroup>
    </>
  );
}

function AddGuarantorSheet({
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
    setError(null);
    startTransition(async () => {
      const res = await addGuarantorAction({ deal_id: dealId, ...guarantorPayload(fd) });
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
      title="Add Guarantor"
      action={
        <Button type="submit" form="add-guarantor-form" disabled={pending} className="font-semibold">
          Add
        </Button>
      }
    >
      <form id="add-guarantor-form" onSubmit={handleSubmit}>
        <GuarantorFields />
        {error ? <p className="text-footnote px-4 text-red">{error}</p> : null}
      </form>
    </Sheet>
  );
}

function EditGuarantorSheet({
  dealId,
  guarantor,
  onOpenChange,
}: {
  dealId: string;
  guarantor: GuarantorRow | null;
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
    if (!guarantor) return;
    const fd = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await updateGuarantorAction(dealId, guarantor.id, guarantorPayload(fd));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      close();
    });
  }

  function handleDelete() {
    if (!guarantor) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteGuarantorAction(dealId, guarantor.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      close();
    });
  }

  return (
    <Sheet
      open={guarantor !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="Edit Guarantor"
      action={
        <Button type="submit" form="edit-guarantor-form" disabled={pending} className="font-semibold">
          Save
        </Button>
      }
    >
      {guarantor ? (
        <form id="edit-guarantor-form" onSubmit={handleSubmit} key={guarantor.id}>
          <GuarantorFields guarantor={guarantor} />
          <div className="overflow-hidden rounded-xl bg-card">
            {confirmingDelete ? (
              <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-1.5">
                <span className="text-body text-label">Remove this guarantor?</span>
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
                    Remove
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
                Remove Guarantor
              </button>
            )}
          </div>
          {error ? <p className="text-footnote mt-3 px-4 text-red">{error}</p> : null}
        </form>
      ) : null}
    </Sheet>
  );
}
