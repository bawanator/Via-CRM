import type { ReportResult } from "@/lib/crm/reports";

// A report rendered as a plain count table: label on the left, count on the
// right, and a Total row when there's more than one line. Counts and
// conversions only — never a money sum.
export function ReportTable({ result }: { result: ReportResult }) {
  return (
    <div className="card hairline-rows overflow-hidden rounded-xl bg-card">
      {result.rows.length === 0 ? (
        <p className="text-subheadline px-4 py-6 text-center text-label-3">No data in this range.</p>
      ) : (
        result.rows.map((row, i) => (
          <div key={`${row.label}-${i}`} className="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5">
            <span className="text-body min-w-0 flex-1 truncate text-label">{row.label}</span>
            <span className="text-body shrink-0 tabular-nums text-label-2">{row.value}</span>
          </div>
        ))
      )}
      {result.rows.length > 1 ? (
        <div className="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5">
          <span className="text-body font-semibold text-label">Total</span>
          <span className="text-body shrink-0 font-semibold tabular-nums text-label">{result.total}</span>
        </div>
      ) : null}
    </div>
  );
}

// A muted inline error where a table would go — used when a saved spec fails.
export function ReportError({ message }: { message: string }) {
  return (
    <div className="card overflow-hidden rounded-xl bg-card">
      <p className="text-subheadline px-4 py-6 text-center text-label-3">{message}</p>
    </div>
  );
}
