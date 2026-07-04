"use client";

import type { ReactNode } from "react";
import type { BrokerStage } from "@/lib/database.types";
import { BROKER_STAGES, BROKER_STAGE_LABELS } from "@/lib/domain";
import { FieldGroup, SelectField, TextAreaField, TextField } from "@/components/ui/Field";

export type BrokerFormDefaults = {
  full_name?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  stage?: BrokerStage;
  source?: string | null;
  notes?: string | null;
};

// Shared between the create and edit sheets. Values are read back out with
// brokerFormValues and parsed by brokerInputSchema / brokerUpdateSchema.
export function BrokerFormFields({ defaults = {} }: { defaults?: BrokerFormDefaults }) {
  return (
    <>
      <FieldGroup>
        <TextField label="Name" name="full_name" required placeholder="Full name" defaultValue={defaults.full_name ?? ""} />
        <TextField label="Company" name="company" placeholder="Brokerage" defaultValue={defaults.company ?? ""} />
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
        <SelectField label="Stage" name="stage" defaultValue={defaults.stage ?? "introduced"}>
          {BROKER_STAGES.map((s) => (
            <option key={s} value={s}>
              {BROKER_STAGE_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <TextField label="Source" name="source" placeholder="How you met" defaultValue={defaults.source ?? ""} />
      </FieldGroup>
      <FieldGroup>
        <TextAreaField label="Notes" name="notes" placeholder="What's important to them" defaultValue={defaults.notes ?? ""} />
      </FieldGroup>
    </>
  );
}

// Reads the broker form back into a plain object for the server action.
// Empty strings are normalised to null by the Zod schemas.
export function brokerFormValues(form: HTMLFormElement) {
  const fd = new FormData(form);
  const get = (key: string) => {
    const v = fd.get(key);
    return typeof v === "string" ? v : "";
  };
  return {
    full_name: get("full_name"),
    company: get("company"),
    email: get("email"),
    phone: get("phone"),
    linkedin_url: get("linkedin_url"),
    stage: get("stage"),
    source: get("source"),
    notes: get("notes"),
    next_action: get("next_action"),
    next_action_date: get("next_action_date"),
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
