import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDeal, type DealDetail } from "@/lib/crm/deals";
import { listInteractionsForDeal } from "@/lib/crm/interactions";
import { listTasks } from "@/lib/crm/tasks";
import { isUuid } from "@/lib/crm/db";
import { DEAL_STATUS_LABELS, INTERACTION_TYPE_LABELS, LOSS_REASON_LABELS } from "@/lib/domain";
import { formatDate, formatDateTime, maturityCountdown } from "@/lib/format";
import { Badge, DEAL_STATUS_TONE } from "@/components/ui/Badge";
import { DetailRow, GroupedSection, LinkRow, Row } from "@/components/ui/GroupedList";
import { ArrowUpRightIcon, BookIcon, EnvelopeIcon, PeopleIcon, PhoneIcon } from "@/components/ui/icons";
import { DealDetailsSection } from "@/components/deals/DealDetailsSection";
import { DealStatusActions } from "@/components/deals/DealStatusActions";
import { DealTasksSection } from "@/components/deals/DealTasksSection";
import { DealTitle } from "@/components/deals/DealTitle";
import { DriveLinksSection } from "@/components/deals/DriveLinksSection";
import { GuarantorsSection } from "@/components/deals/GuarantorsSection";
import { KeyDatesSection } from "@/components/deals/KeyDatesSection";
import { NotesSection } from "@/components/deals/NotesSection";
import { StagePicker } from "@/components/deals/StagePicker";
import { BackButton } from "@/components/common/BackButton";
import type { InteractionRow, InteractionType } from "@/lib/database.types";
import type { TaskItem } from "@/components/tasks/types";

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

  const [interactions, dealTasks] = await Promise.all([
    listInteractionsForDeal(supabase, id),
    listTasks(supabase, { dealId: id }),
  ]);
  const tasks: TaskItem[] = dealTasks.map((t) => ({
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    completed: t.completed,
    completed_at: t.completed_at,
  }));

  return (
    <>
      <BackButton fallback="/deals" />
      <header className="mb-5 pt-2">
        <DealTitle dealId={deal.id} name={deal.name} />
        <div className="mt-1.5">
          <Badge tone={DEAL_STATUS_TONE[deal.status]}>{DEAL_STATUS_LABELS[deal.status]}</Badge>
        </div>
      </header>

      {deal.status === "live" ? (
        <GroupedSection header="Pipeline Stage">
          <StagePicker dealId={deal.id} stage={deal.pipeline_stage} />
        </GroupedSection>
      ) : null}

      {deal.status === "settled" ? <LoanSection deal={deal} /> : null}

      {deal.status === "lost" ? (
        <GroupedSection header={DEAL_STATUS_LABELS.lost}>
          <DetailRow label="Reason" value={deal.loss_reason ? LOSS_REASON_LABELS[deal.loss_reason] : "—"} />
        </GroupedSection>
      ) : null}

      <GroupedSection header="Actions">
        <DealStatusActions dealId={deal.id} status={deal.status} />
      </GroupedSection>

      <DealDetailsSection deal={deal} />

      <GuarantorsSection dealId={deal.id} guarantors={deal.guarantors} />

      <KeyDatesSection dealId={deal.id} keyDates={deal.key_dates} />

      <DriveLinksSection dealId={deal.id} links={deal.drive_links} />

      <DealTasksSection dealId={deal.id} tasks={tasks} />

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
