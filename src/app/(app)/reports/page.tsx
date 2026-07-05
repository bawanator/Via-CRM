import { createClient } from "@/lib/supabase/server";
import { listBrokers } from "@/lib/crm/brokers";
import { listSavedReports } from "@/lib/crm/savedReports";
import type { SavedReportRow } from "@/lib/database.types";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PinnedReports } from "@/components/reports/PinnedReports";
import { ReportBuilderSheet } from "@/components/reports/ReportBuilderSheet";
import { ReportControls } from "@/components/reports/ReportControls";
import { ReportError, ReportTable } from "@/components/reports/ReportTable";
import { coerceStoredSpec, describeSpec } from "@/components/reports/spec";
import { runSavedReport, type RanReport } from "@/components/reports/runSaved";

export const dynamic = "force-dynamic";

type BrokerOption = { id: string; full_name: string };

function ReportCard({
  report,
  ran,
  brokers,
  pinnedCount,
}: {
  report: SavedReportRow;
  ran: RanReport;
  brokers: BrokerOption[];
  pinnedCount: number;
}) {
  const stored = coerceStoredSpec(report.spec);
  const subtitle = stored ? describeSpec(stored) : "";

  return (
    <section className="mb-5">
      <header className="mb-1.5 px-1">
        <h3 className="text-headline text-label">{report.name}</h3>
        {subtitle ? <p className="text-footnote text-label-2">{subtitle}</p> : null}
      </header>
      {ran.ok ? <ReportTable result={ran.result} /> : <ReportError message={ran.error} />}
      <ReportControls
        report={{ id: report.id, name: report.name, spec: report.spec, pinned: report.pinned }}
        brokers={brokers}
        pinnedCount={pinnedCount}
      />
    </section>
  );
}

export default async function ReportsPage() {
  const supabase = await createClient();
  const [saved, brokers] = await Promise.all([listSavedReports(supabase), listBrokers(supabase)]);
  const brokerOptions: BrokerOption[] = brokers.map((b) => ({ id: b.id, full_name: b.full_name }));

  const ran = await Promise.all(
    saved.map(async (report) => ({ report, ran: await runSavedReport(supabase, report) })),
  );
  const pinnedCount = saved.filter((r) => r.pinned).length;

  return (
    <>
      <PageHeader
        title="Reports"
        trailing={
          <ReportBuilderSheet brokers={brokerOptions} trigger={<Button variant="tinted">New Report</Button>} />
        }
      />

      <div className="card mb-6 rounded-xl bg-card px-4 py-3">
        <p className="text-subheadline text-label-2">
          Reports are counts and conversions — deals submitted, live pipeline, outcomes, stage progression and
          activity. They&rsquo;re also available to Claude over MCP (<span className="font-medium">run_report</span> and{" "}
          <span className="font-medium">save_report</span>), so you can ask a question in plain English and pin the good
          answers here. Pinned reports (up to 3) show as the headline numbers above.
        </p>
      </div>

      <PinnedReports />

      {saved.length === 0 ? (
        <EmptyState
          title="No saved reports yet"
          hint="Build one with New Report, or ask Claude a question and save it."
        />
      ) : (
        <div>
          <h2 className="text-footnote mb-2 px-1 uppercase tracking-wide text-label-2">All reports</h2>
          {ran.map(({ report, ran: result }) => (
            <ReportCard
              key={report.id}
              report={report}
              ran={result}
              brokers={brokerOptions}
              pinnedCount={pinnedCount}
            />
          ))}
        </div>
      )}
    </>
  );
}
