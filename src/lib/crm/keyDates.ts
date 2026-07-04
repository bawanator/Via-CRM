import type { KeyDateInsert, KeyDateRow, KeyDateUpdate } from "@/lib/database.types";
import { addDaysISO, daysBetween, todayISO } from "@/lib/dates";
import { assertOk, type Db } from "@/lib/crm/db";

export type UpcomingKeyDate = KeyDateRow & {
  deal: { id: string; name: string; status: string } | null;
};

export async function addKeyDate(db: Db, input: KeyDateInsert): Promise<KeyDateRow> {
  const { data, error } = await db.from("key_dates").insert(input).select().single();
  return assertOk(data, error, "Adding key date");
}

export async function updateKeyDate(db: Db, id: string, input: KeyDateUpdate): Promise<KeyDateRow> {
  const { data, error } = await db.from("key_dates").update(input).eq("id", id).select().single();
  return assertOk(data, error, "Updating key date");
}

export async function completeKeyDate(db: Db, id: string, completed = true): Promise<KeyDateRow> {
  return updateKeyDate(db, id, { completed });
}

export async function deleteKeyDate(db: Db, id: string): Promise<void> {
  const { error } = await db.from("key_dates").delete().eq("id", id);
  if (error) throw new Error(`Deleting key date: ${error.message}`);
}

// Incomplete key dates that are overdue, due within `daysAhead` days, or
// inside their own remind_days_before window (whichever is more generous) —
// a date with a 30-day reminder must surface 30 days out, not at the global
// 14-day horizon.
export async function listUpcomingKeyDates(db: Db, daysAhead: number): Promise<UpcomingKeyDate[]> {
  const today = todayISO();
  const { data, error } = await db
    .from("key_dates")
    .select("*, deal:deals(id, name, status)")
    .eq("completed", false)
    .lte("due_date", addDaysISO(today, 400)) // sane outer bound; per-row filter below
    .order("due_date")
    .returns<UpcomingKeyDate[]>();
  const rows = assertOk(data, error, "Listing upcoming key dates");
  return rows.filter((k) => {
    const daysUntil = daysBetween(today, k.due_date);
    return daysUntil <= Math.max(daysAhead, k.remind_days_before);
  });
}
