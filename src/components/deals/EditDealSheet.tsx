"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { updateDealAction } from "@/app/(app)/deals/actions";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { FieldGroup, SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { FUNDER_LABELS, FUNDERS, PRODUCT_LABELS, PRODUCTS } from "@/lib/domain";
import type { DealRow } from "@/lib/database.types";

// Edits deal facts. Status and pipeline stage have dedicated controls on the
// record and are deliberately absent here.
export function EditDealSheet({ deal }: { deal: DealRow }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? ""),
      borrower_entity: String(fd.get("borrower_entity") ?? ""),
      borrower_contact_name: String(fd.get("borrower_contact_name") ?? ""),
      borrower_contact_email: String(fd.get("borrower_contact_email") ?? ""),
      borrower_contact_phone: String(fd.get("borrower_contact_phone") ?? ""),
      security_address: String(fd.get("security_address") ?? ""),
      loan_amount: String(fd.get("loan_amount") ?? ""),
      product: (fd.get("product") as string) || null,
      funder: (fd.get("funder") as string) || null,
      notes: String(fd.get("notes") ?? ""),
    };
    setError(null);
    startTransition(async () => {
      const res = await updateDealAction(deal.id, payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
      title="Edit Deal"
      trigger={<Button variant="plain">Edit</Button>}
      action={
        <Button type="submit" form="edit-deal-form" disabled={pending} className="font-semibold">
          Save
        </Button>
      }
    >
      <form id="edit-deal-form" onSubmit={handleSubmit}>
        <FieldGroup>
          <TextField label="Name" name="name" required defaultValue={deal.name} />
          <TextField
            label="Loan Amount"
            name="loan_amount"
            inputMode="decimal"
            defaultValue={deal.loan_amount != null ? String(deal.loan_amount) : ""}
          />
          <SelectField label="Product" name="product" defaultValue={deal.product ?? ""}>
            <option value="">None</option>
            {PRODUCTS.map((p) => (
              <option key={p} value={p}>
                {PRODUCT_LABELS[p]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Funder" name="funder" defaultValue={deal.funder ?? ""}>
            <option value="">None</option>
            {FUNDERS.map((f) => (
              <option key={f} value={f}>
                {FUNDER_LABELS[f]}
              </option>
            ))}
          </SelectField>
          <TextField label="Security" name="security_address" defaultValue={deal.security_address ?? ""} />
        </FieldGroup>
        <FieldGroup header="Borrower">
          <TextField label="Entity" name="borrower_entity" defaultValue={deal.borrower_entity ?? ""} />
          <TextField label="Contact" name="borrower_contact_name" defaultValue={deal.borrower_contact_name ?? ""} />
          <TextField
            label="Email"
            name="borrower_contact_email"
            type="email"
            defaultValue={deal.borrower_contact_email ?? ""}
          />
          <TextField
            label="Phone"
            name="borrower_contact_phone"
            type="tel"
            defaultValue={deal.borrower_contact_phone ?? ""}
          />
        </FieldGroup>
        <FieldGroup>
          <TextAreaField label="Notes" name="notes" defaultValue={deal.notes ?? ""} />
        </FieldGroup>
        {error ? <p className="text-footnote px-4 text-red">{error}</p> : null}
      </form>
    </Sheet>
  );
}
