"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, BROKER_STAGE_TONE, DEAL_STATUS_TONE } from "@/components/ui/Badge";
import { GroupedSection, LinkRow, Row } from "@/components/ui/GroupedList";
import { InlineTextarea } from "@/components/common/InlineTextarea";
import { CompletedTasks } from "@/components/tasks/CompletedTasks";
import { TaskList } from "@/components/tasks/TaskList";
import type { TaskItem, ToggleTask } from "@/components/tasks/types";
import { toggleCompanyTaskAction, updateCompanyAction } from "@/app/(app)/companies/actions";
import type { CompanyDetail } from "@/lib/crm/companies";
import { BROKER_STAGE_LABELS, DEAL_STATUS_LABELS } from "@/lib/domain";
import { formatAmount, formatDateTime } from "@/lib/format";

type CompanyInteraction = CompanyDetail["interactions"][number];

const _TAB_KEYS = ["overview", "people", "emails", "calls", "notes", "tasks", "deals"] as const;
type TabKey = (typeof _TAB_KEYS)[number];

// The Attio-style org view: everything logged against anyone at this company,
// indexed org-wide. Quiet text tabs — the content carries the page.
export function CompanyTabs({
  company,
  people,
  interactions,
  deals,
  tasks,
}: {
  company: Pick<CompanyDetail, "id" | "notes">;
  people: CompanyDetail["people"];
  interactions: CompanyDetail["interactions"];
  deals: CompanyDetail["deals"];
  tasks: TaskItem[];
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  const openTasks = tasks.filter((t) => !t.completed);
  const doneTasks = tasks.filter((t) => t.completed);
  const onToggleTask: ToggleTask = (taskId, completed) => toggleCompanyTaskAction(company.id, taskId, completed);

  // getCompany returns interactions newest-first already; filters keep order.
  const emails = interactions.filter((i) => i.type === "email");
  const calls = interactions.filter((i) => i.type === "call");
  const noteEntries = interactions.filter((i) => i.type === "note");

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "people", label: "People", count: people.length },
    { key: "emails", label: "Emails", count: emails.length },
    { key: "calls", label: "Calls", count: calls.length },
    { key: "notes", label: "Notes", count: noteEntries.length },
    { key: "tasks", label: "Tasks", count: openTasks.length },
    { key: "deals", label: "Deals", count: deals.length },
  ];

  const saveNotes = (v: string) => updateCompanyAction(company.id, { notes: v });

  return (
    <>
      <div role="tablist" aria-label="Company sections" className="mb-5 flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`pressable text-subheadline flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 ${
                active ? "bg-fill font-semibold text-label" : "text-label-2"
              }`}
            >
              {t.label}
              {t.count !== undefined ? <span className="text-caption-1 text-label-3">{t.count}</span> : null}
            </button>
          );
        })}
      </div>

      {tab === "overview" ? (
        <OverviewTab company={company} people={people} interactions={interactions} onSaveNotes={saveNotes} />
      ) : null}
      {tab === "people" ? <PeopleTab people={people} /> : null}
      {tab === "emails" ? (
        <GroupedSection footer={emails.length > 0 ? "Every email logged against anyone at this company." : undefined}>
          {emails.length === 0 ? (
            <EmptyRow text="No emails indexed for this company yet." />
          ) : (
            emails.map((i) => <InteractionEntry key={i.id} interaction={i} />)
          )}
        </GroupedSection>
      ) : null}
      {tab === "calls" ? (
        <GroupedSection footer={callsFooter(calls)}>
          {calls.length === 0 ? (
            <EmptyRow text="No calls logged for this company yet." />
          ) : (
            calls.map((i) => <InteractionEntry key={i.id} interaction={i} />)
          )}
        </GroupedSection>
      ) : null}
      {tab === "notes" ? (
        <>
          <GroupedSection header="Company notes">
            <div className="px-4 py-2.5">
              <InlineTextarea
                value={company.notes}
                onSave={saveNotes}
                ariaLabel="Company notes"
                placeholder="Add a note about this company"
              />
            </div>
          </GroupedSection>
          <GroupedSection header="Logged notes">
            {noteEntries.length === 0 ? (
              <EmptyRow text="No notes logged against people here yet." />
            ) : (
              noteEntries.map((i) => <InteractionEntry key={i.id} interaction={i} />)
            )}
          </GroupedSection>
        </>
      ) : null}
      {tab === "tasks" ? (
        <section className="mb-5">
          <TaskList
            tasks={openTasks}
            onToggle={onToggleTask}
            footer="Tasks live on people and deals — add them from a person's page."
            empty={
              <GroupedSection footer="Tasks live on people and deals — add them from a person's page.">
                <EmptyRow text="No open tasks for anyone here." />
              </GroupedSection>
            }
          />
          <CompletedTasks tasks={doneTasks} onToggle={onToggleTask} />
        </section>
      ) : null}
      {tab === "deals" ? <DealsTab deals={deals} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function OverviewTab({
  company,
  people,
  interactions,
  onSaveNotes,
}: {
  company: Pick<CompanyDetail, "id" | "notes">;
  people: CompanyDetail["people"];
  interactions: CompanyDetail["interactions"];
  onSaveNotes: (v: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const recent = interactions.slice(0, 3);
  return (
    <>
      <GroupedSection>
        <Row>
          <span className="text-body text-label">People</span>
          <span className="text-body ml-auto text-label-2">
            {people.length === 1 ? "1 person" : `${people.length} people`}
          </span>
        </Row>
      </GroupedSection>

      <GroupedSection header="Recent activity">
        {recent.length === 0 ? (
          <EmptyRow text="Nothing logged yet." />
        ) : (
          recent.map((i) => <InteractionEntry key={i.id} interaction={i} showType />)
        )}
      </GroupedSection>

      <GroupedSection header="Notes">
        <div className="px-4 py-2.5">
          <InlineTextarea
            value={company.notes}
            onSave={onSaveNotes}
            ariaLabel="Company notes"
            placeholder="Add a note about this company"
          />
        </div>
      </GroupedSection>
    </>
  );
}

function PeopleTab({ people }: { people: CompanyDetail["people"] }) {
  return (
    <GroupedSection>
      {people.length === 0 ? (
        <EmptyRow text="No contacts linked to this company yet." />
      ) : (
        people.map((person) => (
          <LinkRow key={person.id} href={`/brokers/${person.id}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body truncate text-label">{person.full_name}</p>
                <p className="text-footnote truncate text-label-2">
                  {[person.type, person.email].filter(Boolean).join(" · ")}
                </p>
              </div>
              {person.type === "Broker" ? (
                <Badge tone={BROKER_STAGE_TONE[person.stage]}>{BROKER_STAGE_LABELS[person.stage]}</Badge>
              ) : null}
            </div>
          </LinkRow>
        ))
      )}
    </GroupedSection>
  );
}

function DealsTab({ deals }: { deals: CompanyDetail["deals"] }) {
  return (
    <GroupedSection footer={deals.length > 0 ? "Deals introduced by this company's people." : undefined}>
      {deals.length === 0 ? (
        <EmptyRow text="No deals from this company yet." />
      ) : (
        deals.map((deal) => (
          <LinkRow key={deal.id} href={`/deals/${deal.id}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body truncate text-label">{deal.name}</p>
                <p className="text-footnote truncate text-label-2">
                  {[deal.broker?.full_name, formatAmount(deal.loan_amount)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Badge tone={DEAL_STATUS_TONE[deal.status]}>{DEAL_STATUS_LABELS[deal.status]}</Badge>
            </div>
          </LinkRow>
        ))
      )}
    </GroupedSection>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

// One logged interaction, attributed to the person it happened with — the
// whole point of the org view is seeing who at the company said what, when.
function InteractionEntry({ interaction, showType = false }: { interaction: CompanyInteraction; showType?: boolean }) {
  const typeLabel = showType ? interaction.type.charAt(0).toUpperCase() + interaction.type.slice(1) : null;
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-footnote min-w-0 truncate">
          {interaction.contact ? (
            <Link href={`/brokers/${interaction.contact.id}`} className="font-medium text-blue">
              {interaction.contact.full_name}
            </Link>
          ) : (
            <span className="text-label-3">Unknown contact</span>
          )}
          {typeLabel ? <span className="text-label-3"> · {typeLabel}</span> : null}
        </span>
        <span className="text-caption-1 shrink-0 text-label-3">{formatDateTime(interaction.occurred_at)}</span>
      </div>
      <p className="text-body mt-0.5 whitespace-pre-wrap break-words text-label">{interaction.summary}</p>
      {interaction.gmail_thread_id ? (
        <a
          href={`https://mail.google.com/mail/u/0/#all/${interaction.gmail_thread_id}`}
          target="_blank"
          rel="noreferrer"
          className="text-footnote mt-1 inline-block text-blue"
        >
          Open in Gmail ↗
        </a>
      ) : null}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <Row>
      <p className="text-footnote text-label-3">{text}</p>
    </Row>
  );
}

function callsFooter(calls: CompanyInteraction[]): string {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = calls.filter((c) => new Date(c.occurred_at).getTime() >= cutoff).length;
  return `${recent} ${recent === 1 ? "call" : "calls"} in the last 30 days`;
}
