import { createClient } from "@/lib/supabase/server";
import { listLoanBook } from "@/lib/crm/deals";
import { FUNDER_LABELS } from "@/lib/domain";
import { formatDate, maturityCountdown } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { GroupedSection, LinkRow } from "@/components/ui/GroupedList";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

// Short "12 Aug" form for the next key date caption. Display only.
function formatDayMonth(dateISO: string): string {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(
    new Date(dateISO + "T00:00:00"),
  );
}

export default async function LoanBookPage() {
  const supabase = await createClient();
  const loans = await listLoanBook(supabase);

  return (
    <>
      <PageHeader title="Loan Book">
        <p className="text-footnote text-label-2">Settled loans by maturity</p>
      </PageHeader>

      {loans.length === 0 ? (
        <EmptyState title="No settled loans yet" hint="Settled deals appear here, ordered by maturity." />
      ) : (
        <GroupedSection>
          {loans.map((loan) => {
            const countdown = maturityCountdown(loan.maturity_date);
            const tone = countdown.overdue ? "red" : countdown.soon ? "orange" : "gray";
            const nextKeyDate = loan.key_dates[0];
            const brokerLine = [loan.broker?.full_name, loan.funder ? FUNDER_LABELS[loan.funder] : null]
              .filter(Boolean)
              .join(" · ");
            return (
              <LinkRow key={loan.id} href={`/deals/${loan.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-headline text-label">{loan.name}</p>
                    {brokerLine ? <p className="text-footnote text-label-2">{brokerLine}</p> : null}
                    <p className="text-footnote text-label-2">
                      Settled {formatDate(loan.settlement_date)}
                      {loan.loan_term_months != null ? ` · ${loan.loan_term_months} mo` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={tone}>{countdown.text}</Badge>
                    {nextKeyDate ? (
                      <span className="text-caption-1 text-label-2">
                        {nextKeyDate.label} · {formatDayMonth(nextKeyDate.due_date)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </LinkRow>
            );
          })}
        </GroupedSection>
      )}
    </>
  );
}
