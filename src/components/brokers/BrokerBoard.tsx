"use client";

import Link from "next/link";
import { useState } from "react";
import type { BrokerWithStats } from "@/lib/crm/brokers";
import { BROKER_STAGES, BROKER_STAGE_HELP, BROKER_STAGE_LABELS } from "@/lib/domain";
import { relativeDays } from "@/lib/format";
import { Badge, BROKER_STAGE_TONE } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { GroupedSection, LinkRow } from "@/components/ui/GroupedList";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

type View = "kanban" | "list";

export function BrokerBoard({ brokers }: { brokers: BrokerWithStats[] }) {
  const [view, setView] = useState<View>("kanban");

  if (brokers.length === 0) {
    return (
      <EmptyState
        title="No brokers yet"
        hint="Add your first broker to start building the referral pipeline."
      />
    );
  }

  return (
    <div>
      <div className="mb-4 max-w-xs">
        <SegmentedControl<View>
          options={[
            { value: "kanban", label: "Kanban" },
            { value: "list", label: "List" },
          ]}
          value={view}
          onChange={setView}
          ariaLabel="Broker view"
        />
      </div>
      {view === "kanban" ? <Kanban brokers={brokers} /> : <List brokers={brokers} />}
    </div>
  );
}

function Kanban({ brokers }: { brokers: BrokerWithStats[] }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:snap-none md:px-0">
      {BROKER_STAGES.map((stage) => {
        const items = brokers.filter((b) => b.stage === stage);
        return (
          <section key={stage} className="w-[80vw] max-w-72 shrink-0 snap-center md:w-auto md:min-w-0 md:max-w-none md:flex-1">
            <header className="mb-2 px-1">
              <div className="flex items-center gap-2">
                <h2 className="text-headline text-label">{BROKER_STAGE_LABELS[stage]}</h2>
                <Badge>{items.length}</Badge>
              </div>
              <p className="text-caption-1 mt-0.5 text-label-3">{BROKER_STAGE_HELP[stage]}</p>
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
  );
}

function BrokerCard({ broker }: { broker: BrokerWithStats }) {
  return (
    <Link href={`/brokers/${broker.id}`} className="pressable block min-h-11 rounded-xl bg-card px-4 py-3">
      <p className="text-headline text-label">{broker.full_name}</p>
      {broker.company ? <p className="text-footnote text-label-2">{broker.company}</p> : null}
      <p className="text-footnote mt-1">
        {broker.live_deal_count > 0 ? (
          <span className="font-medium text-blue">{broker.live_deal_count} live</span>
        ) : (
          <span className="text-label-3">
            {broker.last_contact_date ? relativeDays(broker.last_contact_date) : "no contact logged"}
          </span>
        )}
        {broker.total_deals_submitted > 0 ? (
          <span className="text-label-3"> · {broker.total_deals_submitted} total</span>
        ) : null}
      </p>
    </Link>
  );
}

function List({ brokers }: { brokers: BrokerWithStats[] }) {
  // listBrokers already sorts by full_name.
  return (
    <GroupedSection>
      {brokers.map((b) => (
        <LinkRow key={b.id} href={`/brokers/${b.id}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-body truncate text-label">{b.full_name}</p>
              {b.company ? <p className="text-footnote truncate text-label-2">{b.company}</p> : null}
            </div>
            <Badge tone={BROKER_STAGE_TONE[b.stage]}>{BROKER_STAGE_LABELS[b.stage]}</Badge>
          </div>
        </LinkRow>
      ))}
    </GroupedSection>
  );
}
