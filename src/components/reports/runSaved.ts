// Server-side glue: turn a saved_reports row into a rendered ReportResult,
// never throwing so one bad spec can't blank the whole /reports page. Imported
// only by server components (it pulls in runReport + the Supabase client type).

import type { Db } from "@/lib/crm/db";
import type { SavedReportRow } from "@/lib/database.types";
import { runReport, type ReportResult } from "@/lib/crm/reports";
import { coerceStoredSpec, toRunSpec } from "@/components/reports/spec";

export type RanReport =
  | { ok: true; result: ReportResult }
  | { ok: false; error: string };

export async function runSavedReport(db: Db, report: SavedReportRow): Promise<RanReport> {
  try {
    const stored = coerceStoredSpec(report.spec);
    if (!stored) return { ok: false, error: "This report's configuration is invalid." };
    const result = await runReport(db, toRunSpec(stored));
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to run report." };
  }
}
