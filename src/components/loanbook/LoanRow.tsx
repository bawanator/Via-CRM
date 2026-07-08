import Link from "next/link";
import { FUNDER_LABELS } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { PhoneIcon, EnvelopeIcon, ArrowUpRightIcon } from "@/components/ui/icons";
import type { LoanBookItem } from "@/components/loanbook/types";

// Short "12 Aug" form for the key-date chip. Display only, deterministic.
function dayMonth(dateISO: string): string {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(
    new Date(dateISO + "T00:00:00"),
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-label-3">{label} </span>
      <span className="text-label-2">{value}</span>
    </span>
  );
}

// One settled loan as a rich register card. It is not a single tap-target
// (it carries call/email sub-links), so the deal record is reached via an
// explicit "View deal" link rather than wrapping the whole card.
export function LoanRow({ loan }: { loan: LoanBookItem }) {
  const guarantorLabel = `${loan.guarantorCount} guarantor${loan.guarantorCount === 1 ? "" : "s"}`;

  return (
    <div className="card rounded-xl bg-card p-4">
      {/* Deal + security address, maturity countdown on the right */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-headline text-label">{loan.name}</p>
          {loan.securityAddress ? (
            <p className="text-footnote truncate text-label-2">{loan.securityAddress}</p>
          ) : null}
        </div>
        <Badge tone={loan.countdownTone}>{loan.countdownText}</Badge>
      </div>

      {/* People: broker + borrower entity/contact with tap-to-call/email */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="micro-label !text-label-3">Broker</p>
          <p className="text-footnote truncate text-label">{loan.brokerName ?? "—"}</p>
        </div>
        <div className="min-w-0">
          <p className="micro-label !text-label-3">Borrower</p>
          <p className="text-footnote truncate text-label">{loan.borrowerEntity ?? "—"}</p>
          {loan.borrowerContactName ? (
            <p className="text-caption-1 truncate text-label-2">{loan.borrowerContactName}</p>
          ) : null}
          {loan.borrowerPhone || loan.borrowerEmail ? (
            <div className="mt-1 flex flex-wrap gap-2">
              {loan.borrowerPhone ? (
                <a
                  href={`tel:${loan.borrowerPhone}`}
                  className="text-caption-1 pressable inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-blue"
                >
                  <PhoneIcon className="h-3.5 w-3.5" />
                  Call
                </a>
              ) : null}
              {loan.borrowerEmail ? (
                <a
                  href={`mailto:${loan.borrowerEmail}`}
                  className="text-caption-1 pressable inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-blue"
                >
                  <EnvelopeIcon className="h-3.5 w-3.5" />
                  Email
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Facts: funder codename, settlement, term, maturity date, guarantors */}
      <div className="text-caption-1 mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {loan.funder ? <Fact label="Funder" value={FUNDER_LABELS[loan.funder]} /> : null}
        <Fact label="Settled" value={formatDate(loan.settlementDate)} />
        {loan.loanTermMonths != null ? <Fact label="Term" value={`${loan.loanTermMonths} mo`} /> : null}
        <Fact label="Matures" value={formatDate(loan.maturityDate)} />
        <span className="whitespace-nowrap text-label-2">{guarantorLabel}</span>
      </div>

      {/* Next key date chip + link into the deal record */}
      <div className="mt-3 flex items-center justify-between gap-3">
        {loan.nextKeyDate ? (
          <Badge tone={loan.nextKeyDate.overdue ? "red" : "orange"}>
            {loan.nextKeyDate.label} · {dayMonth(loan.nextKeyDate.dueDate)}
          </Badge>
        ) : (
          <span className="text-caption-1 text-label-3">No upcoming key dates</span>
        )}
        <Link
          href={`/deals/${loan.id}`}
          className="text-footnote pressable inline-flex shrink-0 items-center gap-0.5 font-medium text-blue"
        >
          View deal
          <ArrowUpRightIcon className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
