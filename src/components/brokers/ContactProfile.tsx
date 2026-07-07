"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { ContactDetail } from "@/lib/crm/contacts";
import type { ContactTypeRow, DriveLinkRow } from "@/lib/database.types";
import {
  BROKER_STAGE_LABELS,
  DEAL_STATUS_LABELS,
  DEFAULT_CONTACT_TYPE,
  PRODUCT_LABELS,
} from "@/lib/domain";
import { formatAmount, formatDate } from "@/lib/format";
import { updateContactFieldAction } from "@/app/(app)/brokers/actions";
import { Badge, BROKER_STAGE_TONE, DEAL_STATUS_TONE } from "@/components/ui/Badge";
import { GroupedSection, LinkRow } from "@/components/ui/GroupedList";
import { ArrowUpRightIcon } from "@/components/ui/icons";
import { InlineDate } from "@/components/common/InlineDate";
import { InlineSelect } from "@/components/common/InlineSelect";
import { InlineText } from "@/components/common/InlineText";
import { InlineTextarea } from "@/components/common/InlineTextarea";
import type { InlineSave } from "@/components/common/useInlineEdit";
import type { TaskItem } from "@/components/tasks/types";
import { StageControl } from "@/components/brokers/StageControl";
import { SectionHeader, SectionHeaderButton } from "@/components/brokers/SectionHeader";
import { EmptyCardRow, InteractionListRow } from "@/components/brokers/InteractionListRow";
import { ContactTasksSection } from "@/components/brokers/ContactTasksSection";
import { DeleteContactRow } from "@/components/brokers/DeleteContactRow";
import { DriveLinksSection } from "@/components/brokers/DriveLinksSection";
import { LogInteractionSheet } from "@/components/brokers/LogInteractionSheet";
import { EmailsTab } from "@/components/brokers/EmailsTab";
import { CallsTab } from "@/components/brokers/CallsTab";
import { NotesTab } from "@/components/brokers/NotesTab";

type Tab = "overview" | "emails" | "calls" | "notes" | "tasks" | "deals" | "files";

// Attio-style record profile: compact inline-editable identity header, a left
// contact-details column on xl screens, and quiet text tabs instead of one
// long scroll. All data comes preloaded from the server page; tabs only
// switch what's visible.
export function ContactProfile({
  contact,
  types,
  tasks,
  driveLinks,
}: {
  contact: ContactDetail;
  types: ContactTypeRow[];
  tasks: TaskItem[];
  driveLinks: DriveLinkRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [logOpen, setLogOpen] = useState(false);

  const isBroker = contact.type === DEFAULT_CONTACT_TYPE;
  const emails = contact.interactions.filter((i) => i.type === "email");
  const calls = contact.interactions.filter((i) => i.type === "call");
  const noteItems = contact.interactions.filter((i) => i.type === "note");
  // Meetings, calls and notes make up "activity"; emails have their own tab.
  const activity = contact.interactions.filter((i) => i.type !== "email");
  const dealOptions = contact.deals.map((d) => ({ id: d.id, name: d.name }));

  const save = (field: string): InlineSave => async (value: string) => {
    const res = await updateContactFieldAction(contact.id, field, value);
    if (res.ok) router.refresh();
    return res;
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "emails", label: "Emails", count: emails.length },
    { key: "calls", label: "Calls", count: calls.length },
    { key: "notes", label: "Notes", count: noteItems.length },
    { key: "tasks", label: "Tasks", count: tasks.length },
    ...(isBroker ? [{ key: "deals" as Tab, label: "Deals", count: contact.deals.length }] : []),
    { key: "files", label: "Files", count: driveLinks.length },
  ];

  return (
    <>
      {/* Identity header — name and company edit in place; the arrow opens the
          company record. Saving a company name find-or-creates the record. */}
      <header className="mb-4 pt-2">
        <div className="max-w-md">
          <InlineText value={contact.full_name} onSave={save("full_name")} ariaLabel="Name" />
        </div>
        <div className="flex max-w-md items-center gap-1">
          <InlineText
            value={contact.company?.name ?? null}
            onSave={save("company_name")}
            placeholder="Add company"
            ariaLabel="Company"
            className="min-w-0 flex-1"
          />
          {contact.company ? (
            <Link
              href={`/companies/${contact.company.id}`}
              aria-label={`Open ${contact.company.name}`}
              className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-blue"
            >
              <ArrowUpRightIcon className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone="blue">{contact.type}</Badge>
          {isBroker ? (
            <Badge tone={BROKER_STAGE_TONE[contact.stage]}>{BROKER_STAGE_LABELS[contact.stage]}</Badge>
          ) : null}
        </div>
      </header>

      <div className="xl:flex xl:items-start xl:gap-8">
        {/* Contact details: stacked card on small screens, left column on xl. */}
        <aside className="xl:w-80 xl:shrink-0">
          <GroupedSection header="Contact">
            <FieldRow label="Type">
              <InlineSelect
                value={contact.type}
                options={types.map((t) => ({ value: t.name, label: t.name }))}
                onSave={save("type")}
                ariaLabel="Contact type"
              />
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
          </GroupedSection>
        </aside>

        <div className="min-w-0 xl:flex-1">
          <TabBar tabs={tabs} active={tab} onChange={setTab} />

          {tab === "overview" ? (
            <>
              {isBroker ? <StageControl contactId={contact.id} stage={contact.stage} /> : null}

              <GroupedSection header="Highlights">
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
                <FieldRow label="Source">
                  <InlineText value={contact.source} onSave={save("source")} placeholder="How you met" ariaLabel="Source" />
                </FieldRow>
                {/* Last contact is trigger-maintained (set when an interaction is logged). */}
                <div className="flex min-h-11 items-center gap-4 px-4 py-1">
                  <span className="text-body w-24 shrink-0 text-label">Last Contact</span>
                  <span className="text-body min-w-0 flex-1 truncate text-label-2">
                    {formatDate(contact.last_contact_date)}
                  </span>
                </div>
              </GroupedSection>

              <GroupedSection header="About">
                <div className="px-4 py-2.5">
                  <InlineTextarea
                    value={contact.notes}
                    onSave={save("notes")}
                    rows={4}
                    placeholder="What's important to them"
                    ariaLabel="About"
                  />
                </div>
              </GroupedSection>

              <section className="mb-6">
                <SectionHeader title="Recent Emails">
                  {emails.length > 0 ? (
                    <SectionHeaderButton onClick={() => setTab("emails")}>View All</SectionHeaderButton>
                  ) : null}
                </SectionHeader>
                <div className="card hairline-rows overflow-hidden rounded-xl bg-card">
                  {emails.length === 0 ? (
                    <EmptyCardRow text="No emails synced yet." />
                  ) : (
                    emails.slice(0, 3).map((i) => <InteractionListRow key={i.id} interaction={i} showIcon={false} />)
                  )}
                </div>
              </section>

              <section className="mb-6">
                <SectionHeader title="Recent Activity">
                  <SectionHeaderButton
                    onClick={() => {
                      setLogOpen(true);
                    }}
                  >
                    Log
                  </SectionHeaderButton>
                </SectionHeader>
                <div className="card hairline-rows overflow-hidden rounded-xl bg-card">
                  {activity.length === 0 ? (
                    <EmptyCardRow text="No calls, meetings or notes yet." />
                  ) : (
                    activity.slice(0, 3).map((i) => <InteractionListRow key={i.id} interaction={i} />)
                  )}
                </div>
              </section>

              <GroupedSection>
                <LinkRow href={`/audit?table=contacts&record=${contact.id}`}>
                  <span className="text-body text-label">Change History</span>
                </LinkRow>
              </GroupedSection>

              <DeleteContactRow contactId={contact.id} />
            </>
          ) : null}

          {tab === "emails" ? <EmailsTab brokerId={contact.id} brokerEmail={contact.email} emails={emails} /> : null}

          {tab === "calls" ? <CallsTab brokerId={contact.id} calls={calls} deals={dealOptions} /> : null}

          {tab === "notes" ? <NotesTab brokerId={contact.id} notes={noteItems} /> : null}

          {tab === "tasks" ? <ContactTasksSection contactId={contact.id} tasks={tasks} /> : null}

          {tab === "deals" ? (
            <section className="mb-6">
              <SectionHeader title="Deals" />
              <div className="card hairline-rows overflow-hidden rounded-xl bg-card">
                {contact.deals.length === 0 ? (
                  <EmptyCardRow text="No deals yet." />
                ) : (
                  contact.deals.map((deal) => (
                    <LinkRow key={deal.id} href={`/deals/${deal.id}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-body truncate text-label">{deal.name}</p>
                          <p className="text-footnote truncate text-label-2">
                            {formatAmount(deal.loan_amount)}
                            {deal.product ? ` · ${PRODUCT_LABELS[deal.product]}` : ""}
                          </p>
                        </div>
                        <Badge tone={DEAL_STATUS_TONE[deal.status]}>{DEAL_STATUS_LABELS[deal.status]}</Badge>
                      </div>
                    </LinkRow>
                  ))
                )}
              </div>
            </section>
          ) : null}

          {tab === "files" ? <DriveLinksSection contactId={contact.id} links={driveLinks} /> : null}
        </div>
      </div>

      <LogInteractionSheet brokerId={contact.id} deals={dealOptions} open={logOpen} onOpenChange={setLogOpen} />
    </>
  );
}

// Quiet text tabs with counts — "Overview · Emails 12 · Calls 3 …".
function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: Tab; label: string; count?: number }[];
  active: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Contact record sections"
      className="mb-4 flex gap-1 overflow-x-auto border-b-[0.5px] border-separator"
    >
      {tabs.map((t) => {
        const selected = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.key)}
            className={`text-subheadline pressable -mb-px flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 transition-colors ${
              selected ? "border-blue font-medium text-label" : "border-transparent text-label-2 hover:text-label"
            }`}
          >
            {t.label}
            {t.count ? <span className="text-caption-1 text-label-3">{t.count}</span> : null}
          </button>
        );
      })}
    </div>
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
