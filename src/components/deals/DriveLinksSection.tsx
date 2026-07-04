"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { addDriveLinkAction, deleteDriveLinkAction } from "@/app/(app)/deals/actions";
import { Button } from "@/components/ui/Button";
import { GroupedSection } from "@/components/ui/GroupedList";
import { Sheet } from "@/components/ui/Sheet";
import { FieldGroup, TextField } from "@/components/ui/Field";
import { ArrowUpRightIcon } from "@/components/ui/icons";
import type { DriveLinkRow } from "@/lib/database.types";

// Link-only by design: the CRM points at Drive, it never manages files.
export function DriveLinksSection({ dealId, links }: { dealId: string; links: DriveLinkRow[] }) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete(linkId: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteDriveLinkAction(dealId, linkId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRemoving(null);
    });
  }

  return (
    <GroupedSection header="Drive Links">
      {links.map((link) => (
        <div key={link.id} className="flex min-h-11 items-center gap-3 py-1.5 pl-4 pr-2">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="pressable flex min-w-0 flex-1 items-center gap-1.5 py-1 text-blue"
          >
            <span className="text-body truncate">{link.label}</span>
            <ArrowUpRightIcon className="h-4 w-4 shrink-0" />
          </a>
          {removing === link.id ? (
            <div className="flex items-center gap-1">
              <Button type="button" variant="plain" onClick={() => setRemoving(null)} disabled={pending}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => handleDelete(link.id)}
                disabled={pending}
                className="font-semibold"
              >
                Remove
              </Button>
            </div>
          ) : (
            <button
              type="button"
              aria-label={`Remove ${link.label}`}
              onClick={() => setRemoving(link.id)}
              className="text-footnote pressable min-h-11 px-2 text-red"
            >
              Remove
            </button>
          )}
        </div>
      ))}
      {error ? <p className="text-footnote px-4 py-2 text-red">{error}</p> : null}
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="text-body pressable flex min-h-11 w-full items-center px-4 py-2.5 text-left text-blue"
      >
        Add Drive Link
      </button>

      <AddDriveLinkSheet dealId={dealId} open={adding} onOpenChange={setAdding} />
    </GroupedSection>
  );
}

function AddDriveLinkSheet({
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
      parent_type: "deal" as const,
      parent_id: dealId,
      label: String(fd.get("label") ?? ""),
      url: String(fd.get("url") ?? ""),
    };
    setError(null);
    startTransition(async () => {
      const res = await addDriveLinkAction(payload);
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
      title="Add Drive Link"
      action={
        <Button type="submit" form="add-drive-link-form" disabled={pending} className="font-semibold">
          Add
        </Button>
      }
    >
      <form id="add-drive-link-form" onSubmit={handleSubmit}>
        <FieldGroup>
          <TextField label="Label" name="label" required placeholder="Credit memo" autoFocus />
          <TextField label="URL" name="url" type="url" required placeholder="https://drive.google.com/…" />
        </FieldGroup>
        {error ? <p className="text-footnote px-4 text-red">{error}</p> : null}
      </form>
    </Sheet>
  );
}
