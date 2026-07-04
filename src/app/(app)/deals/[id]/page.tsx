import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDeal, type DealDetail } from "@/lib/crm/deals";
import { listInteractionsForDeal } from "@/lib/crm/interactions";
import { isUuid } from "@/lib/crm/db";
import {
  DEAL_STATUS_LABELS,
  FUNDER_LABELS,
  INTERACTION_TYPE_LABELS,
  PRODUCT_LABELS,
} from "@/lib/domain";
import { formatAmount, formatDate, formatDateTime, maturityCountdown } from "@/lib/format";
import { Badge, DEAL_STATUS_TONE } from "@/components/ui/Badge";
import { DetailRow, GroupedSection, LinkRow, Row } from "@/components/ui/GroupedList";
import { ArrowUpRightIcon, BookIcon, EnvelopeIcon, PeopleIcon, PhoneIcon } from "@/components/ui/icons";
import { DealStatusActions } from "@/components/deals/DealStatusActions";
import { DriveLinksSection } from "@/components/deals/DriveLinksSection";
import { EditDealSheet } from "@/components/deals/EditDealSheet";
import { KeyDatesSection } from "@/components/deals/KeyDatesSection";
import { NotesSection } from "@/components/deals/NotesSection";
import { StagePicker } from "@/components/deals/StagePicker";
import type { InteractionRow, InteractionType } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const INTERACTION_ICONS: Record<InteractionType, typeof EnvelopeIcon> = {
  email: EnvelopeIcon,
  call: PhoneIcon,
  meeting: PeopleIcon,
  note: BookIcon,
};

function InteractionItem({ interaction }: { interaction: InteractionRow }) {
  const Icon = INTERACTION_ICONS[interaction.type];
  return (
    <Row className="items-start">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-label-2" />
      <div className="min-w-0 flex-1">
        <p className="text-body text-label">{interaction.summary}</p>
        <p className="text-footnote text-label-2">
          {INTERACTION_TYPE_LABELS[interaction.type]} · {formatDateTime(interaction.occurred_at)}
        </p>
      </div>
      {interaction.gmail_thread_id ? (
        <a
          href={`https://mail.google.com/mail/u/0/#all/${interaction.gmail_thread_id}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in Gmail"
          className="pressable flex h-11 w-11 shrink-0 items-center justify-center text-blue"
        >
          <ArrowUpRightIcon className="h-5 w-5" />
        </a>
      ) : null}
    </Row>
  );
}

function LoanSection({ deal }: { deal: DealDetail }) {
  const countdown = maturityCountdown(deal.maturity_date);
  const tone = countdown.overdue ? "red" : countdown.soon ? "orange" : "gray";
  return (
    <GroupedSection header="Loan">
      <DetailRow label="Settlement" value={formatDate(deal.settlement_date)} />
      <DetailRow label="Term" value={deal.loan_term_months != null ? `${deal.loan_term_months} months` : "—"} />
      <DetailRow
        label="Maturity"
        value={
          <span className="inline-flex items-center gap-2">
            {formatDate(deal.maturity_date)}
            <Badge tone={tone}>{countdown.text}</Badge>
          </span>
        }
      />
    </GroupedSection>
  );
}

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const deal: DealDetail | null = await getDeal(supabase, id);
  if (!deal) notFound();
  const interactions = await listInteractionsForDeal(supabase, id);

  return (
    <>
      <header className="mb-5 pt-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-title-1 text-label">{deal.name}</h1>
            <div className="mt-1.5">
              <Badge tone={DEAL_STATUS_TONE[deal.status]}>{DEAL_STATUS_LABELS[deal.status]}</Badge>
            </div>
          </div>
          <EditDealSheet deal={deal} />
        </div>
      </header>

      {deal.status === "live" ? (
        <GroupedSection header="Pipeline Stage">
          <StagePicker dealId={deal.id} stage={deal.pipeline_stage} />
        </GroupedSection>
      ) : null}

      {deal.status === "settled" ? <LoanSection deal={deal} /> : null}

      {/* Settled deals keep the Actions group too: "Reopen as Live" is the
          correction path for a mis-settled deal. */}
      <GroupedSection header="Actions">
        <DealStatusActions dealId={deal.id} status={deal.status} />
      </GroupedSection>

      <GroupedSection header="Details">
        {deal.broker ? (
          <DetailRow label="Broker" value={deal.broker.full_name} href={`/brokers/${deal.broker.id}`} />
        ) : null}
        <DetailRow label="Borrower Entity" value={deal.borrower_entity ?? "—"} />
        <DetailRow label="Borrower Contact" value={deal.borrower_contact_name ?? "—"} />
        {deal.borrower_contact_email ? (
          <DetailRow
            label="Contact Email"
            value={
              <a href={`mailto:${deal.borrower_contact_email}`} className="text-blue">
                {deal.borrower_contact_email}
              </a>
            }
          />
        ) : null}
        {deal.borrower_contact_phone ? (
          <DetailRow
            label="Contact Phone"
            value={
              <a href={`tel:${deal.borrower_contact_phone}`} className="text-blue">
                {deal.borrower_contact_phone}
              </a>
            }
          />
        ) : null}
        <DetailRow label="Security Address" value={deal.security_address ?? "—"} />
        <DetailRow label="Loan Amount" value={formatAmount(deal.loan_amount)} />
        <DetailRow label="Product" value={deal.product ? PRODUCT_LABELS[deal.product] : "—"} />
        <DetailRow label="Funder" value={deal.funder ? FUNDER_LABELS[deal.funder] : "—"} />
      </GroupedSection>

      <KeyDatesSection dealId={deal.id} keyDates={deal.key_dates} />

      <DriveLinksSection dealId={deal.id} links={deal.drive_links} />

      <GroupedSection header="Interactions" footer="Interactions are logged from the broker record.">
        {interactions.length === 0 ? (
          <Row>
            <span className="text-body text-label-3">No interactions yet.</span>
          </Row>
        ) : (
          interactions.map((i) => <InteractionItem key={i.id} interaction={i} />)
        )}
      </GroupedSection>

      <NotesSection dealId={deal.id} notes={deal.notes} />

      <GroupedSection>
        <LinkRow href={`/audit?table=deals&record=${deal.id}`}>
          <span className="text-body text-label">Change History</span>
        </LinkRow>
      </GroupedSection>
    </>
  );
}
