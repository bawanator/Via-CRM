import Link from "next/link";
import { APP_TIMEZONE } from "@/lib/dates";

// The Supabase "Primary Database" moment: a dotted-grid canvas with one
// floating card of live facts — loan book size, next maturity, pipeline
// pulse. Counts and dates only.
export function OverviewPanel({
  settledLoans,
  liveDeals,
  openTasks,
  coldContacts,
  nextMaturity,
}: {
  settledLoans: number;
  liveDeals: number;
  openTasks: number;
  coldContacts: number;
  nextMaturity: { deal_id: string; name: string; maturity_date: string } | null;
}) {
  const maturityLabel = nextMaturity
    ? new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: APP_TIMEZONE,
      }).format(new Date(nextMaturity.maturity_date + "T00:00:00"))
    : null;

  return (
    <section className="mb-5">
      <div className="dotted-canvas flex min-h-56 items-center justify-center rounded-xl border border-separator p-6 md:justify-end md:p-10">
        <Link
          href="/loan-book"
          className="card pressable block w-full max-w-xs rounded-xl bg-card"
        >
          <div className="flex items-center gap-3 px-4 pt-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/20">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
              <img src="/icons/logo-mark.svg" alt="" className="h-4 w-auto" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-headline block text-label">Loan Book</span>
              <span className="text-footnote block text-label-2">
                {settledLoans} settled {settledLoans === 1 ? "loan" : "loans"} · Sydney
              </span>
            </span>
            <span aria-hidden>🇦🇺</span>
          </div>

          <div className="px-4 py-3">
            <span className="micro-label block">Next maturity</span>
            {nextMaturity ? (
              <span className="text-body block truncate text-label">
                {maturityLabel} <span className="text-label-2">— {nextMaturity.name}</span>
              </span>
            ) : (
              <span className="text-body block text-label-2">None upcoming</span>
            )}
          </div>

          <div className="flex items-center gap-4 border-t-[0.5px] border-separator px-4 py-2.5">
            {[
              ["Live", liveDeals],
              ["Tasks", openTasks],
              ["Cold", coldContacts],
            ].map(([label, n]) => (
              <span key={label} className="text-footnote text-label-2">
                <span className="font-medium text-label">{label}</span> {n}
              </span>
            ))}
          </div>
        </Link>
      </div>
    </section>
  );
}
