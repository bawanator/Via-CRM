import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBroker, type BrokerDetail } from "@/lib/crm/brokers";
import { listDriveLinks } from "@/lib/crm/driveLinks";
import type { DriveLinkRow } from "@/lib/database.types";
import { BROKER_STAGE_LABELS, DEAL_STATUS_LABELS, PRODUCT_LABELS } from "@/lib/domain";
import { formatAmount, formatDate } from "@/lib/format";
import { daysBetween, todayISO } from "@/lib/dates";
import { Badge, BROKER_STAGE_TONE, DEAL_STATUS_TONE } from "@/components/ui/Badge";
import { DetailRow, GroupedSection, LinkRow, Row } from "@/components/ui/GroupedList";
import { EditBrokerButton } from "@/components/brokers/EditBrokerButton";
import { StageControl } from "@/components/brokers/StageControl";
import { NotesSection } from "@/components/brokers/NotesSection";
import { InteractionsSection } from "@/components/brokers/InteractionsSection";
import { DriveLinksSection } from "@/components/brokers/DriveLinksSection";

export const dynamic = "force-dynamic";

export default async function BrokerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [broker, driveLinks]: [BrokerDetail | null, DriveLinkRow[]] = await Promise.all([
    getBroker(supabase, id),
    listDriveLinks(supabase, "broker", id),
  ]);
  if (!broker) notFound();

  const overdue = broker.next_action_date != null && daysBetween(todayISO(), broker.next_action_date) < 0;

  return (
    <>
      <header className="mb-6 pt-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-title-1 text-label">{broker.full_name}</h1>
            {broker.company ? <p className="text-subheadline text-label-2">{broker.company}</p> : null}
            <div className="mt-2">
              <Badge tone={BROKER_STAGE_TONE[broker.stage]}>{BROKER_STAGE_LABELS[broker.stage]}</Badge>
            </div>
          </div>
          <EditBrokerButton broker={broker} />
        </div>
      </header>

      <StageControl brokerId={broker.id} stage={broker.stage} />

      <GroupedSection header="Details">
        <DetailRow label="Company" value={broker.company ?? "—"} />
        <ContactRow label="Email" value={broker.email} href={broker.email ? `mailto:${broker.email}` : null} />
        <ContactRow label="Phone" value={broker.phone} href={broker.phone ? `tel:${broker.phone}` : null} />
        <ContactRow label="LinkedIn" value={broker.linkedin_url ? "View profile" : null} href={broker.linkedin_url} external />
        <DetailRow label="Source" value={broker.source ?? "—"} />
        <DetailRow label="Last Contact" value={formatDate(broker.last_contact_date)} />
        <div className="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5">
          <span className="text-body shrink-0 text-label">Next Action</span>
          <span className={`text-body min-w-0 flex-1 truncate text-right ${overdue ? "text-red" : "text-label-2"}`}>
            {broker.next_action || broker.next_action_date
              ? [broker.next_action, broker.next_action_date ? formatDate(broker.next_action_date) : null]
                  .filter(Boolean)
                  .join(" · ")
              : "—"}
          </span>
        </div>
      </GroupedSection>

      <GroupedSection header="Deals">
        {broker.deals.length === 0 ? (
          <Row>
            <p className="text-footnote text-label-3">No deals yet.</p>
          </Row>
        ) : (
          broker.deals.map((deal) => (
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
      </GroupedSection>

      <NotesSection brokerId={broker.id} notes={broker.notes} />

      <InteractionsSection
        brokerId={broker.id}
        brokerEmail={broker.email}
        interactions={broker.interactions}
        deals={broker.deals.map((d) => ({ id: d.id, name: d.name }))}
      />

      <DriveLinksSection brokerId={broker.id} links={driveLinks} />

      <GroupedSection>
        <LinkRow href={`/audit?table=brokers&record=${broker.id}`}>
          <span className="text-body text-label">Change History</span>
        </LinkRow>
      </GroupedSection>
    </>
  );
}

// Label-left, tappable value-right row for mailto: / tel: / external links.
function ContactRow({
  label,
  value,
  href,
  external = false,
}: {
  label: string;
  value: string | null;
  href: string | null;
  external?: boolean;
}) {
  if (!value || !href) return <DetailRow label={label} value="—" />;
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="pressable flex min-h-11 items-center justify-between gap-4 px-4 py-2.5"
    >
      <span className="text-body shrink-0 text-label">{label}</span>
      <span className="text-body min-w-0 flex-1 truncate text-right text-blue">{value}</span>
    </a>
  );
}
