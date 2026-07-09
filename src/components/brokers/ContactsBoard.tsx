"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { ContactWithStats } from "@/lib/crm/contacts";
import type { ContactTypeRow } from "@/lib/database.types";
import { BROKER_STAGES, BROKER_STAGE_LABELS, DEFAULT_CONTACT_TYPE } from "@/lib/domain";
import { Badge, BROKER_STAGE_TONE } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

type View = "kanban" | "list" | "referrers";
type Density = "comfortable" | "compact";

function matchesSearch(c: ContactWithStats, q: string): boolean {
  if (!q) return true;
  return [c.full_name, c.company?.name, c.location].some((v) => (v ?? "").toLowerCase().includes(q));
}

export function ContactsBoard({ contacts, types }: { contacts: ContactWithStats[]; types: ContactTypeRow[] }) {
  const [view, setView] = useState<View>("kanban");
  // Big lists default to compact rows; the choice then persists in state.
  const [density, setDensity] = useState<Density>(() => (contacts.length > 100 ? "compact" : "comfortable"));
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");

  const q = search.trim().toLowerCase();

  const locations = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) if (c.location) set.add(c.location);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [contacts]);

  if (contacts.length === 0) {
    return (
      <EmptyState
        title="No contacts yet"
        hint="Add your first contact — brokers, borrowers, solicitors and more."
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3">
        <div className="max-w-sm">
          <SegmentedControl<View>
            options={[
              { value: "kanban", label: "Kanban" },
              { value: "list", label: "List" },
              { value: "referrers", label: "Referrers" },
            ]}
            value={view}
            onChange={setView}
            ariaLabel="Contact view"
          />
        </div>

        {/* Search filters the loaded contacts instantly in both views. */}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, company, location"
          aria-label="Search contacts"
          className="text-body min-h-11 w-full rounded-xl bg-card px-4 text-label placeholder:text-label-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-blue sm:max-w-sm"
        />

        {view === "list" ? (
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect value={typeFilter} onChange={setTypeFilter} ariaLabel="Filter by type">
              <option value="all">All types</option>
              {types.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect value={locationFilter} onChange={setLocationFilter} ariaLabel="Filter by location">
              <option value="all">All locations</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </FilterSelect>
            <div className="ml-auto w-40">
              <SegmentedControl<Density>
                options={[
                  { value: "comfortable", label: "Comfortable" },
                  { value: "compact", label: "Compact" },
                ]}
                value={density}
                onChange={setDensity}
                ariaLabel="Row density"
              />
            </div>
          </div>
        ) : null}
      </div>

      {view === "kanban" ? (
        <Kanban contacts={contacts} q={q} />
      ) : view === "referrers" ? (
        // Everyone marked Referrer, regardless of the list filters.
        <List contacts={contacts} q={q} typeFilter="Referrer" locationFilter="all" density={density} />
      ) : (
        <List contacts={contacts} q={q} typeFilter={typeFilter} locationFilter={locationFilter} density={density} />
      )}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  ariaLabel,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="text-footnote min-h-11 rounded-xl bg-card px-3 font-medium text-label focus:outline-none focus-visible:outline-2 focus-visible:outline-blue"
    >
      {children}
    </select>
  );
}

// Kanban is Broker-type only by nature. Columns show title + count (no
// inline stage description — #19). Search still narrows the cards.
// On phones the columns become stage tiles + a list of the selected stage
// (same Supabase-style pattern as the deal board — no sideways swiping).
function Kanban({ contacts, q }: { contacts: ContactWithStats[]; q: string }) {
  const brokers = contacts.filter((c) => c.type === DEFAULT_CONTACT_TYPE && matchesSearch(c, q));
  const [selectedStage, setSelectedStage] = useState<(typeof BROKER_STAGES)[number]>(BROKER_STAGES[0]);
  const selectedItems = brokers.filter((b) => b.stage === selectedStage);

  return (
    <>
      {/* Phone: stage tiles + selected-stage list */}
      <div className="md:hidden">
        <div
          role="tablist"
          aria-label="Broker stage"
          className="card mb-3 grid grid-cols-4 gap-px overflow-hidden rounded-xl bg-separator"
        >
          {BROKER_STAGES.map((stage) => {
            const count = brokers.filter((b) => b.stage === stage).length;
            const selected = selectedStage === stage;
            return (
              <button
                key={stage}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setSelectedStage(stage)}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center transition-colors ${
                  selected ? "bg-fill-2" : "bg-card"
                }`}
              >
                <span className={`text-title-3 ${count === 0 ? "text-label-3" : "text-label"}`}>{count}</span>
                <span
                  className={`text-caption-1 leading-tight ${
                    selected ? "font-semibold text-label" : "text-label-2"
                  }`}
                >
                  {BROKER_STAGE_LABELS[stage]}
                </span>
              </button>
            );
          })}
        </div>

        {selectedItems.length === 0 ? (
          <p className="card dotted-canvas text-subheadline rounded-xl bg-card px-4 py-8 text-center text-label-3">
            No brokers in this stage.
          </p>
        ) : (
          <div className="card hairline-rows overflow-hidden rounded-xl bg-card">
            {selectedItems.map((b) => (
              <BrokerListRow key={b.id} broker={b} />
            ))}
          </div>
        )}
      </div>

      {/* Desktop: the full five-column board */}
      <div className="hidden gap-3 md:flex">
        {BROKER_STAGES.map((stage) => {
          const items = brokers.filter((b) => b.stage === stage);
          return (
            <section key={stage} className="min-w-0 flex-1">
              <header className="mb-2 flex items-center gap-2 px-1">
                <h2 className="micro-label">{BROKER_STAGE_LABELS[stage]}</h2>
                <Badge>{items.length}</Badge>
              </header>
              <div className="flex flex-col gap-2">
                {items.length === 0 ? (
                  <p className="text-footnote rounded-xl bg-card px-4 py-3 text-label-3">No brokers</p>
                ) : (
                  items.map((b) => <BrokerCard key={b.id} broker={b} />)
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

// Full-width tappable row for the phone stage list: name + live-deal chip,
// company · location beneath, chevron affordance.
function BrokerListRow({ broker }: { broker: ContactWithStats }) {
  const caption = [broker.company?.name, broker.location].filter(Boolean).join(" · ");
  return (
    <Link href={`/brokers/${broker.id}`} className="pressable flex items-center gap-3 px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-headline min-w-0 truncate text-label">{broker.full_name}</span>
          {broker.live_deal_count > 0 ? <Badge tone="blue">{broker.live_deal_count} live</Badge> : null}
        </span>
        {caption ? <span className="text-footnote block truncate text-label-2">{caption}</span> : null}
      </span>
      <svg className="h-3.5 w-3.5 shrink-0 text-label-3" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M5 2.5 9.5 7 5 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

// Compact card: one headline line (name + live-deal chip) and one caption line
// (company · location). Everything else lives on the record page.
function BrokerCard({ broker }: { broker: ContactWithStats }) {
  const caption = [broker.company?.name, broker.location].filter(Boolean).join(" · ");
  return (
    <Link href={`/brokers/${broker.id}`} className="pressable block min-h-11 rounded-xl bg-card px-3 py-2">
      <span className="flex items-center justify-between gap-2">
        <span className="text-headline min-w-0 truncate text-label">{broker.full_name}</span>
        {broker.live_deal_count > 0 ? <Badge tone="blue">{broker.live_deal_count} live</Badge> : null}
      </span>
      {caption ? <span className="text-footnote block truncate text-label-2">{caption}</span> : null}
    </Link>
  );
}

function List({
  contacts,
  q,
  typeFilter,
  locationFilter,
  density,
}: {
  contacts: ContactWithStats[];
  q: string;
  typeFilter: string;
  locationFilter: string;
  density: Density;
}) {
  const items = contacts.filter(
    (c) =>
      matchesSearch(c, q) &&
      (typeFilter === "all" || c.type === typeFilter) &&
      (locationFilter === "all" || c.location === locationFilter),
  );

  if (items.length === 0) {
    return (
      <div className="card rounded-xl bg-card px-4 py-3">
        <p className="text-footnote text-label-3">No contacts match these filters.</p>
      </div>
    );
  }

  return (
    <div className="card hairline-rows overflow-hidden rounded-xl bg-card">
      {items.map((c) => (
        <ContactListRow key={c.id} contact={c} density={density} />
      ))}
    </div>
  );
}

// Sparse rows: name, a "company · type · location" caption, and one stage/type
// chip. Compact density collapses the caption onto the same line.
function ContactListRow({ contact, density }: { contact: ContactWithStats; density: Density }) {
  const isBroker = contact.type === DEFAULT_CONTACT_TYPE;
  const badge = isBroker ? (
    <Badge tone={BROKER_STAGE_TONE[contact.stage]}>{BROKER_STAGE_LABELS[contact.stage]}</Badge>
  ) : (
    <Badge tone="gray">{contact.type}</Badge>
  );
  const caption = [contact.company?.name, contact.type, contact.location].filter(Boolean).join(" · ");

  if (density === "compact") {
    return (
      <Link href={`/brokers/${contact.id}`} className="pressable flex min-h-9 items-center gap-3 px-4 py-1">
        <span className="text-body min-w-0 flex-1 truncate text-label">{contact.full_name}</span>
        {caption ? (
          <span className="text-footnote hidden min-w-0 max-w-[45%] truncate text-label-3 sm:block">{caption}</span>
        ) : null}
        {badge}
      </Link>
    );
  }

  return (
    <Link href={`/brokers/${contact.id}`} className="pressable flex min-h-11 items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-body truncate text-label">{contact.full_name}</p>
        {caption ? <p className="text-footnote truncate text-label-2">{caption}</p> : null}
      </div>
      {badge}
    </Link>
  );
}
