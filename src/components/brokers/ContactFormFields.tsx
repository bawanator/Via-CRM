"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import type { BrokerStage, ContactTypeRow } from "@/lib/database.types";
import { BROKER_STAGES, BROKER_STAGE_LABELS, DEFAULT_CONTACT_TYPE } from "@/lib/domain";
import { addContactTypeAction } from "@/app/(app)/brokers/actions";
import { FieldGroup, SelectField, TextAreaField, TextField } from "@/components/ui/Field";

export type ContactFormDefaults = {
  full_name?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  type?: string;
  location?: string | null;
  stage?: BrokerStage;
  source?: string | null;
  notes?: string | null;
};

// The create sheet's fields. First field is a TYPE select (defaulting to
// "Broker") with an inline "+ Add type…" affordance; the broker-only Stage
// field only shows when the selected type is "Broker". Values are read back
// with contactFormValues and parsed by contactInputSchema.
export function ContactFormFields({
  types,
  defaults = {},
}: {
  types: ContactTypeRow[];
  defaults?: ContactFormDefaults;
}) {
  const [typeList, setTypeList] = useState<ContactTypeRow[]>(types);
  const [type, setType] = useState<string>(
    defaults.type ?? (types.some((t) => t.name === DEFAULT_CONTACT_TYPE) ? DEFAULT_CONTACT_TYPE : (types[0]?.name ?? DEFAULT_CONTACT_TYPE)),
  );
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addPending, startAdd] = useTransition();

  function handleAddType() {
    const name = newType.trim();
    if (!name) {
      setAddError("Enter a type name");
      return;
    }
    startAdd(async () => {
      const res = await addContactTypeAction(name);
      if (res.ok) {
        setTypeList((prev) =>
          prev.some((t) => t.name === res.name)
            ? prev
            : [...prev, { name: res.name, sort: 100, created_at: "", created_by: null }],
        );
        setType(res.name);
        setNewType("");
        setAdding(false);
        setAddError(null);
      } else {
        setAddError(res.error);
      }
    });
  }

  const isBroker = type === DEFAULT_CONTACT_TYPE;

  return (
    <>
      <FieldGroup>
        {/* Type row with an inline add-type affordance. */}
        <div className="flex min-h-11 items-center gap-4 px-4 py-1.5">
          <span className="text-body w-24 shrink-0 text-label">Type</span>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="text-body min-h-8 min-w-0 flex-1 appearance-none rounded-md bg-transparent text-right text-label focus:outline-none focus-visible:outline-2 focus-visible:outline-blue"
            >
              {typeList.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setAddError(null);
                setAdding((v) => !v);
              }}
              className="text-footnote pressable shrink-0 rounded-lg font-medium text-blue"
            >
              + Add type…
            </button>
          </div>
        </div>
        {adding ? (
          <div className="flex min-h-11 items-center gap-2 px-4 py-1.5">
            <input
              autoFocus
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddType();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setAdding(false);
                }
              }}
              placeholder="New type name"
              aria-label="New type name"
              className="text-body min-h-8 min-w-0 flex-1 rounded-md bg-fill-2 px-2 text-label placeholder:text-label-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-blue"
            />
            <button
              type="button"
              onClick={handleAddType}
              disabled={addPending}
              className="text-footnote pressable min-h-11 shrink-0 rounded-lg font-semibold text-blue disabled:opacity-40"
            >
              {addPending ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setAddError(null);
              }}
              className="text-footnote pressable min-h-11 shrink-0 rounded-lg text-label-2"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </FieldGroup>
      {addError ? <p className="text-footnote -mt-3 mb-4 px-4 text-red">{addError}</p> : null}

      <FieldGroup>
        <TextField label="Name" name="full_name" required placeholder="Full name" defaultValue={defaults.full_name ?? ""} />
        <TextField label="Company" name="company" placeholder="Company" defaultValue={defaults.company ?? ""} />
        <TextField
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          placeholder="name@company.com"
          defaultValue={defaults.email ?? ""}
        />
        <TextField label="Phone" name="phone" type="tel" inputMode="tel" placeholder="04…" defaultValue={defaults.phone ?? ""} />
        <TextField
          label="LinkedIn"
          name="linkedin_url"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          placeholder="https://linkedin.com/in/…"
          defaultValue={defaults.linkedin_url ?? ""}
        />
        <TextField label="Location" name="location" placeholder="City, e.g. Melbourne" defaultValue={defaults.location ?? ""} />
        {isBroker ? (
          <SelectField label="Stage" name="stage" defaultValue={defaults.stage ?? "introduced"}>
            {BROKER_STAGES.map((s) => (
              <option key={s} value={s}>
                {BROKER_STAGE_LABELS[s]}
              </option>
            ))}
          </SelectField>
        ) : null}
        <TextField label="Source" name="source" placeholder="How you met" defaultValue={defaults.source ?? ""} />
      </FieldGroup>
      <FieldGroup>
        <TextAreaField label="Notes" name="notes" placeholder="What's important to them" defaultValue={defaults.notes ?? ""} />
      </FieldGroup>
    </>
  );
}

// Reads the contact form back into a plain object for the server action.
// Empty strings are normalised to null by the Zod schemas; `stage` is only
// present in the DOM for Broker-type contacts, so it is omitted otherwise
// (an empty enum value would fail parsing).
export function contactFormValues(form: HTMLFormElement) {
  const fd = new FormData(form);
  const get = (key: string) => {
    const v = fd.get(key);
    return typeof v === "string" ? v : "";
  };
  const stage = get("stage");
  const type = get("type");
  return {
    type: type || undefined,
    full_name: get("full_name"),
    company: get("company"),
    email: get("email"),
    phone: get("phone"),
    linkedin_url: get("linkedin_url"),
    location: get("location"),
    source: get("source"),
    notes: get("notes"),
    ...(stage ? { stage } : {}),
  };
}

// Standard right-side sheet header submit button.
export function SheetSubmitButton({ formId, pending, children }: { formId: string; pending: boolean; children: ReactNode }) {
  return (
    <button
      form={formId}
      type="submit"
      disabled={pending}
      className="text-body pressable min-h-11 rounded-lg px-1 font-semibold text-blue disabled:opacity-40"
    >
      {children}
    </button>
  );
}
