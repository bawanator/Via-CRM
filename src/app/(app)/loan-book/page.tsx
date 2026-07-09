import { createClient } from "@/lib/supabase/server";
import { listLoanBook } from "@/lib/crm/deals";
import { daysBetween, todayISO } from "@/lib/dates";
import { maturityCountdown } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoanBookList } from "@/components/loanbook/LoanBookList";
import type { LoanBookItem } from "@/components/loanbook/types";

export const dynamic = "force-dynamic";

// LOAN BOOK — a settled-loan register for a private lender, not a ledger.
// Fields chosen (and why): the day-to-day job against a settled book is
// monitoring maturities and staying able to reach the people on each loan —
// there is deliberately NO financial maths here (no balances/interest).
//   - deal name + security address ...... which loan, secured against what.
//   - broker ............................ who introduced it / relationship owner.
//   - borrower entity + contact + phone/email (tap to call/email) ... the party
//     you actually chase for renewals, payments and discharge.
//   - funder as codename only (1/2/3) ... never a real funder name, anywhere.
//   - settlement date, term, maturity + countdown badge (red overdue,
//     orange ≤60d, else neutral) ....... the core "when does this roll off" view.
//   - next upcoming/overdue key date chip ... insurance renewal, interest date,
//     etc. — the next thing to action on the loan.
//   - guarantor count ................... how many people stand behind it.
//   - "View deal" link into the record.
// A client filter narrows to loans maturing within 90 days (overdue included).

export default async function LoanBookPage() {
  const supabase = await createClient();
  const loans = await listLoanBook(supabase);
  const today = todayISO();

  // Guarantor counts in one query (no per-deal round trips). Read-only, so no
  // crm mutation path needed; kept here as there is no cross-deal count helper.
  const ids = loans.map((l) => l.id);
  const guarantorCounts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data, error } = await supabase.from("guarantors").select("deal_id").in("deal_id", ids);
    if (error) throw new Error(`Counting guarantors: ${error.message}`);
    for (const row of data ?? []) {
      guarantorCounts[row.deal_id] = (guarantorCounts[row.deal_id] ?? 0) + 1;
    }
  }

  const items: LoanBookItem[] = loans.map((loan) => {
    const countdown = maturityCountdown(loan.maturity_date);
    const countdownTone = countdown.overdue ? "red" : countdown.soon ? "orange" : "gray";
    const next = loan.key_dates[0] ?? null; // already incomplete + soonest-first
    return {
      id: loan.id,
      name: loan.name,
      securityAddress: loan.securities.map((sec) => sec.address).join(" · ") || null,
      brokerName: loan.broker?.full_name ?? null,
      borrowerEntity: loan.borrower_entity,
      borrowerContactName: loan.borrower_contact_name,
      borrowerEmail: loan.borrower_contact_email,
      borrowerPhone: loan.borrower_contact_phone,
      funder: loan.funder,
      settlementDate: loan.settlement_date,
      loanTermMonths: loan.loan_term_months,
      maturityDate: loan.maturity_date,
      daysToMaturity: loan.maturity_date ? daysBetween(today, loan.maturity_date) : null,
      countdownText: countdown.text,
      countdownTone,
      nextKeyDate: next
        ? { label: next.label, dueDate: next.due_date, overdue: daysBetween(today, next.due_date) <= 0 }
        : null,
      guarantorCount: guarantorCounts[loan.id] ?? 0,
    };
  });

  return (
    <>
      <PageHeader title="Loan Book">
        <p className="text-footnote text-label-2">Settled loans by maturity</p>
      </PageHeader>

      {items.length === 0 ? (
        <EmptyState title="No settled loans yet" hint="Settled deals appear here, ordered by maturity." />
      ) : (
        <LoanBookList loans={items} />
      )}
    </>
  );
}
