"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { DriveLinkRow } from "@/lib/database.types";
import { addDriveLinkAction, deleteDriveLinkAction } from "@/app/(app)/brokers/actions";
import { Sheet } from "@/components/ui/Sheet";
import { FieldGroup, TextField } from "@/components/ui/Field";
import { ArrowUpRightIcon } from "@/components/ui/icons";
import { SectionHeader, SectionHeaderButton } from "@/components/brokers/SectionHeader";
import { SheetSubmitButton } from "@/components/brokers/ContactFormFields";

const FORM_ID = "add-drive-link-form";

export function DriveLinksSection({ contactId, links }: { contactId: string; links: DriveLinkRow[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (key: string) => {
      const v = fd.get(key);
      return typeof v === "string" ? v : "";
    };
    const input = { parent_type: "contact", parent_id: contactId, label: get("label"), url: get("url") };
    startTransition(async () => {
      const res = await addDriveLinkAction(input);
      if (res.ok) {
        setError(null);
        setOpen(false);
      } else {
        setError(res.error);
      }
    });
  }

  function handleRemove(id: string) {
    setError(null);
    setRemovingId(id);
    startTransition(async () => {
      const res = await deleteDriveLinkAction(id, contactId);
      if (!res.ok) setError(res.error);
      setRemovingId(null);
    });
  }

  return (
    <section className="mb-6">
      <SectionHeader title="Drive Links">
        <SectionHeaderButton
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          Add Link
        </SectionHeaderButton>
      </SectionHeader>

      <div className="hairline-rows overflow-hidden rounded-xl bg-card">
        {links.length === 0 ? (
          <div className="flex min-h-11 items-center px-4 py-2.5">
            <p className="text-footnote text-label-3">No links yet.</p>
          </div>
        ) : (
          links.map((link) => (
            <div key={link.id} className="flex min-h-11 items-center">
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="pressable flex min-h-11 min-w-0 flex-1 items-center gap-2 px-4 py-2.5"
              >
                <span className="text-body min-w-0 truncate text-label">{link.label}</span>
                <ArrowUpRightIcon className="h-4 w-4 shrink-0 text-label-3" />
              </a>
              <button
                type="button"
                onClick={() => handleRemove(link.id)}
                disabled={removingId === link.id}
                className="text-footnote pressable min-h-11 shrink-0 px-4 font-medium text-red disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
      {error ? <p className="text-footnote mt-1.5 px-4 text-red">{error}</p> : null}

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Add Link"
        action={
          <SheetSubmitButton formId={FORM_ID} pending={pending}>
            Add
          </SheetSubmitButton>
        }
      >
        <form id={FORM_ID} onSubmit={handleAdd}>
          <FieldGroup footer="Paste a Google Drive URL — files stay in Drive; the CRM only links to them.">
            <TextField label="Label" name="label" required placeholder="e.g. Accreditation pack" />
            <TextField
              label="URL"
              name="url"
              type="url"
              required
              inputMode="url"
              autoCapitalize="none"
              placeholder="https://drive.google.com/…"
            />
          </FieldGroup>
          {error ? <p className="text-footnote px-4 text-red">{error}</p> : null}
        </form>
      </Sheet>
    </section>
  );
}
