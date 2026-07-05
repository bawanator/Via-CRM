"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { ContactTypeRow } from "@/lib/database.types";
import { formatDate } from "@/lib/format";
import { updateContactFieldAction } from "@/app/(app)/brokers/actions";
import { GroupedSection } from "@/components/ui/GroupedList";
import { InlineDate } from "@/components/common/InlineDate";
import { InlineSelect } from "@/components/common/InlineSelect";
import { InlineText } from "@/components/common/InlineText";
import { InlineTextarea } from "@/components/common/InlineTextarea";
import type { InlineSave } from "@/components/common/useInlineEdit";

export type ContactDetails = {
  id: string;
  type: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  location: string | null;
  source: string | null;
  next_action: string | null;
  next_action_date: string | null;
  last_contact_date: string | null;
  notes: string | null;
};

// Click-to-edit contact details (#17). Every field commits through
// updateContactFieldAction; on success we refresh so the server-rendered
// value (and any type-dependent sections) update.
export function ContactDetailFields({ contact, types }: { contact: ContactDetails; types: ContactTypeRow[] }) {
  const router = useRouter();

  const save = (field: string): InlineSave => async (value: string) => {
    const res = await updateContactFieldAction(contact.id, field, value);
    if (res.ok) router.refresh();
    return res;
  };

  return (
    <>
      <GroupedSection header="Details">
        <FieldRow label="Type">
          <InlineSelect
            value={contact.type}
            options={types.map((t) => ({ value: t.name, label: t.name }))}
            onSave={save("type")}
            ariaLabel="Contact type"
          />
        </FieldRow>
        <FieldRow label="Company">
          <InlineText value={contact.company} onSave={save("company")} placeholder="Add company" ariaLabel="Company" />
        </FieldRow>
        <FieldRow label="Email">
          <InlineText value={contact.email} onSave={save("email")} type="email" placeholder="Add email" ariaLabel="Email" />
        </FieldRow>
        <FieldRow label="Phone">
          <InlineText value={contact.phone} onSave={save("phone")} type="tel" placeholder="Add phone" ariaLabel="Phone" />
        </FieldRow>
        <FieldRow label="LinkedIn">
          <InlineText
            value={contact.linkedin_url}
            onSave={save("linkedin_url")}
            type="url"
            placeholder="Add LinkedIn URL"
            ariaLabel="LinkedIn URL"
          />
        </FieldRow>
        <FieldRow label="Location">
          <InlineText value={contact.location} onSave={save("location")} placeholder="Add city" ariaLabel="Location" />
        </FieldRow>
        <FieldRow label="Source">
          <InlineText value={contact.source} onSave={save("source")} placeholder="How you met" ariaLabel="Source" />
        </FieldRow>
        <FieldRow label="Next Action">
          <InlineText
            value={contact.next_action}
            onSave={save("next_action")}
            placeholder="Add a next action"
            ariaLabel="Next action"
          />
        </FieldRow>
        <FieldRow label="Due">
          <InlineDate value={contact.next_action_date} onSave={save("next_action_date")} ariaLabel="Next action date" />
        </FieldRow>
        {/* Last contact is trigger-maintained (set when an interaction is logged). */}
        <div className="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5">
          <span className="text-body shrink-0 text-label">Last Contact</span>
          <span className="text-body min-w-0 flex-1 truncate text-right text-label-2">
            {formatDate(contact.last_contact_date)}
          </span>
        </div>
      </GroupedSection>

      <GroupedSection header="Notes">
        <div className="px-4 py-2.5">
          <InlineTextarea value={contact.notes} onSave={save("notes")} rows={6} placeholder="No notes yet." ariaLabel="Notes" />
        </div>
      </GroupedSection>
    </>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-4 px-4 py-1">
      <span className="text-body w-24 shrink-0 text-label">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
