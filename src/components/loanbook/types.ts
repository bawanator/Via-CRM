import type { DealFunder } from "@/lib/database.types";
import type { BadgeTone } from "@/components/ui/Badge";

// A fully server-computed loan-register row. All date maths (countdown, key-date
// urgency) is done once on the server so the client filter/render stays pure —
// no client-side "today" and therefore no hydration drift. NEVER carries a real
// funder name: `funder` is the enum, rendered only via FUNDER_LABELS (1/2/3).
export type LoanBookItem = {
  id: string;
  name: string;
  securityAddress: string | null;
  brokerName: string | null;
  borrowerEntity: string | null;
  borrowerContactName: string | null;
  borrowerEmail: string | null;
  borrowerPhone: string | null;
  funder: DealFunder | null;
  settlementDate: string | null;
  loanTermMonths: number | null;
  maturityDate: string | null;
  daysToMaturity: number | null; // null when no maturity date; drives the ≤90d filter
  countdownText: string;
  countdownTone: BadgeTone;
  nextKeyDate: { label: string; dueDate: string; overdue: boolean } | null;
  guarantorCount: number;
};
