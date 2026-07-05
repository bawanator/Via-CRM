import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContact, type ContactDetail } from "@/lib/crm/contacts";
import { listContactTypes } from "@/lib/crm/contactTypes";
import { listDriveLinks } from "@/lib/crm/driveLinks";
import { listTasks } from "@/lib/crm/tasks";
import type { ContactTypeRow, DriveLinkRow } from "@/lib/database.types";
import { BROKER_STAGE_LABELS, DEAL_STATUS_LABELS, PRODUCT_LABELS } from "@/lib/domain";
import { formatAmount } from "@/lib/format";
import { Badge, BROKER_STAGE_TONE, DEAL_STATUS_TONE } from "@/components/ui/Badge";
import { GroupedSection, LinkRow, Row } from "@/components/ui/GroupedList";
import { StageControl } from "@/components/brokers/StageControl";
import { ContactDetailFields } from "@/components/brokers/ContactDetailFields";
import { ContactTasksSection } from "@/components/brokers/ContactTasksSection";
import { InteractionsSection } from "@/components/brokers/InteractionsSection";
import { DriveLinksSection } from "@/components/brokers/DriveLinksSection";
import type { TaskItem } from "@/components/tasks/types";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [contact, driveLinks, types, taskRows]: [
    ContactDetail | null,
    DriveLinkRow[],
    ContactTypeRow[],
    Awaited<ReturnType<typeof listTasks>>,
  ] = await Promise.all([
    getContact(supabase, id),
    listDriveLinks(supabase, "contact", id),
    listContactTypes(supabase),
    listTasks(supabase, { contactId: id }),
  ]);
  if (!contact) notFound();

  const isBroker = contact.type === "Broker";
  const tasks: TaskItem[] = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    completed: t.completed,
    subtitle: t.deal?.name ?? null,
  }));

  return (
    <>
      <header className="mb-6 pt-2">
        <div className="min-w-0">
          <h1 className="text-title-1 text-label">{contact.full_name}</h1>
          {contact.company ? <p className="text-subheadline text-label-2">{contact.company}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="blue">{contact.type}</Badge>
            {isBroker ? (
              <Badge tone={BROKER_STAGE_TONE[contact.stage]}>{BROKER_STAGE_LABELS[contact.stage]}</Badge>
            ) : null}
          </div>
        </div>
      </header>

      {isBroker ? <StageControl contactId={contact.id} stage={contact.stage} /> : null}

      <ContactDetailFields contact={contact} types={types} />

      {isBroker ? (
        <GroupedSection header="Deals">
          {contact.deals.length === 0 ? (
            <Row>
              <p className="text-footnote text-label-3">No deals yet.</p>
            </Row>
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
        </GroupedSection>
      ) : null}

      <ContactTasksSection contactId={contact.id} tasks={tasks} />

      <InteractionsSection
        brokerId={contact.id}
        brokerEmail={contact.email}
        interactions={contact.interactions}
        deals={contact.deals.map((d) => ({ id: d.id, name: d.name }))}
      />

      <DriveLinksSection contactId={contact.id} links={driveLinks} />

      <GroupedSection>
        <LinkRow href={`/audit?table=contacts&record=${contact.id}`}>
          <span className="text-body text-label">Change History</span>
        </LinkRow>
      </GroupedSection>
    </>
  );
}
