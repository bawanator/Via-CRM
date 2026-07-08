import { createClient } from "@/lib/supabase/server";
import { listPinnedReports } from "@/lib/crm/savedReports";
import type { SavedReportRow } from "@/lib/database.types";
import { coerceStoredSpec, describeSpec } from "@/components/reports/spec";
import { runSavedReport, type RanReport } from "@/components/reports/runSaved";

// Headline numbers: the pinned reports (≤3) as number tiles. Self-fetching so it
// can be dropped into any server page (e.g. /reports or Today) as <PinnedReports/>.
export async function PinnedReports() {
  const supabase = await createClient();
  const pinned = await listPinnedReports(supabase);
  if (pinned.length === 0) return null;

  const tiles = await Promise.all(
    pinned.map(async (report) => ({ report, ran: await runSavedReport(supabase, report) })),
  );

  return (
    <section className="mb-6">
      <h2 className="micro-label mb-1.5 px-1">Pinned</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(({ report, ran }) => (
          <PinnedTile key={report.id} report={report} ran={ran} />
        ))}
      </div>
    </section>
  );
}

function PinnedTile({ report, ran }: { report: SavedReportRow; ran: RanReport }) {
  const stored = coerceStoredSpec(report.spec);
  const subtitle = stored ? describeSpec(stored) : "";

  return (
    <div className="card flex flex-col gap-1 rounded-xl bg-card px-4 py-3.5">
      <p className="micro-label truncate">{report.name}</p>
      {!ran.ok ? (
        <p className="text-subheadline mt-1 text-label-3">{ran.error}</p>
      ) : (
        <>
          <p className="text-large-title tabular-nums text-label">{ran.result.total}</p>
          {subtitle ? <p className="text-footnote truncate text-label-3">{subtitle}</p> : null}
          {ran.result.rows.length > 1 ? (
            <div className="mt-2 flex flex-col gap-1">
              {ran.result.rows.slice(0, 3).map((row, i) => (
                <div key={`${row.label}-${i}`} className="flex items-center justify-between gap-3">
                  <span className="text-footnote min-w-0 flex-1 truncate text-label-2">{row.label}</span>
                  <span className="text-footnote shrink-0 tabular-nums text-label-2">{row.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
