import type { SavedReportInsert, SavedReportRow, SavedReportUpdate } from "@/lib/database.types";
import { assertOk, type Db } from "@/lib/crm/db";

// At most 3 reports can be pinned to the dashboard at once.
export const MAX_PINNED_REPORTS = 3;

export async function listSavedReports(db: Db): Promise<SavedReportRow[]> {
  const { data, error } = await db.from("saved_reports").select("*").order("sort").order("name");
  return assertOk(data, error, "Listing saved reports");
}

export async function listPinnedReports(db: Db): Promise<SavedReportRow[]> {
  const { data, error } = await db
    .from("saved_reports")
    .select("*")
    .eq("pinned", true)
    .order("sort")
    .order("name")
    .limit(MAX_PINNED_REPORTS);
  return assertOk(data, error, "Listing pinned reports");
}

export async function createSavedReport(db: Db, input: SavedReportInsert): Promise<SavedReportRow> {
  const { data, error } = await db.from("saved_reports").insert(input).select().single();
  return assertOk(data, error, "Creating saved report");
}

export async function updateSavedReport(db: Db, id: string, input: SavedReportUpdate): Promise<SavedReportRow> {
  const { data, error } = await db.from("saved_reports").update(input).eq("id", id).select().single();
  return assertOk(data, error, "Updating saved report");
}

export async function deleteSavedReport(db: Db, id: string): Promise<void> {
  const { error } = await db.from("saved_reports").delete().eq("id", id);
  if (error) throw new Error(`Deleting saved report: ${error.message}`);
}

// Pin/unpin a report, enforcing the max-3-pinned rule (counting other reports
// so re-pinning an already-pinned one is always allowed).
export async function setPinned(db: Db, id: string, pinned: boolean): Promise<SavedReportRow> {
  if (pinned) {
    const { count, error } = await db
      .from("saved_reports")
      .select("id", { count: "exact", head: true })
      .eq("pinned", true)
      .neq("id", id);
    if (error) throw new Error(`Counting pinned reports: ${error.message}`);
    if ((count ?? 0) >= MAX_PINNED_REPORTS) {
      throw new Error(`At most ${MAX_PINNED_REPORTS} reports can be pinned. Unpin one first.`);
    }
  }
  return updateSavedReport(db, id, { pinned });
}
