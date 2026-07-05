"use client";

import { InlineText } from "@/components/common/InlineText";
import { updateCompanyAction } from "@/app/(app)/companies/actions";
import type { CompanyRow } from "@/lib/database.types";

// Identity header for the org record: the name and its domain · location
// caption are plain editable text (click to edit), Attio-style — no form.
export function CompanyHeader({ company }: { company: Pick<CompanyRow, "id" | "name" | "domain" | "location"> }) {
  const save = (fields: Record<string, string>) => updateCompanyAction(company.id, fields);

  return (
    <header className="mb-6 pt-2">
      <InlineText
        value={company.name}
        onSave={(v) => save({ name: v })}
        ariaLabel="Company name"
        placeholder="Company name"
        // InlineText renders text-body; promote it to title scale for the
        // identity header without forking the primitive. Text utilities only —
        // the type scale itself stays owned by the global tokens.
        className="[&>button]:text-title-1 [&>button]:font-semibold [&>input]:text-title-1 [&>input]:font-semibold"
      />
      <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5">
        <InlineText
          value={company.domain}
          // The schema lowercases and validates the domain before it is stored.
          onSave={(v) => save({ domain: v })}
          ariaLabel="Company domain"
          placeholder="domain.com"
          className="min-w-0 [&>button]:min-h-8 [&>button]:text-subheadline [&>button_span]:text-label-2 [&>input]:min-h-8 [&>input]:text-subheadline"
        />
        <span className="text-subheadline text-label-3" aria-hidden>
          ·
        </span>
        <InlineText
          value={company.location}
          onSave={(v) => save({ location: v })}
          ariaLabel="Company location"
          placeholder="Location"
          className="min-w-0 [&>button]:min-h-8 [&>button]:text-subheadline [&>button_span]:text-label-2 [&>input]:min-h-8 [&>input]:text-subheadline"
        />
      </div>
    </header>
  );
}
