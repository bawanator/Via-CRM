import type { AuditLogRow } from "@/lib/database.types";
import { assertOk, type Db } from "@/lib/crm/db";

export const AUDITED_TABLES = [
  "contacts",
  "companies",
  "deals",
  "tasks",
  "guarantors",
  "key_dates",
  "drive_links",
  "interactions",
] as const;

export type AuditFilter = {
  tableName?: string;
  recordId?: string;
  limit?: number;
  before?: string; // changed_at cursor for paging
  beforeId?: string; // id tiebreak — one transaction stamps many rows with the same changed_at
};

export async function listAuditLog(db: Db, filter: AuditFilter = {}): Promise<AuditLogRow[]> {
  let query = db
    .from("audit_log")
    .select("*")
    .order("changed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(filter.limit ?? 100);
  if (filter.tableName) query = query.eq("table_name", filter.tableName);
  if (filter.recordId) query = query.eq("record_id", filter.recordId);
  if (filter.before) {
    // Keyset pagination on (changed_at, id): a plain lt(changed_at) would skip
    // rows sharing the boundary timestamp (e.g. a whole import transaction).
    if (filter.beforeId) {
      query = query.or(
        `changed_at.lt."${filter.before}",and(changed_at.eq."${filter.before}",id.lt."${filter.beforeId}")`,
      );
    } else {
      query = query.lt("changed_at", filter.before);
    }
  }
  const { data, error } = await query;
  return assertOk(data, error, "Loading audit log");
}

// Field-level diff for the audit UI: which keys changed, from what, to what.
// Row-meta noise (updated_at/updated_by) is excluded so diffs show substance.
const NOISE_KEYS = new Set(["updated_at", "updated_by", "created_at", "created_by"]);

// Human label for an audited record, derived from its row snapshot (prefer the
// post-change state). Which column names a record depends on the table.
export function auditRecordLabel(entry: Pick<AuditLogRow, "table_name" | "before" | "after">): string | null {
  const row = (entry.after ?? entry.before ?? {}) as Record<string, unknown>;
  const pick = (key: string): string | null => {
    const v = row[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  switch (entry.table_name) {
    case "contacts":
    case "guarantors":
      return pick("full_name");
    case "companies":
    case "deals":
      return pick("name");
    case "tasks":
      return pick("title");
    case "key_dates":
    case "drive_links":
      return pick("label");
    case "interactions":
      return pick("summary");
    default:
      return null;
  }
}

export type FieldChange = { field: string; before: unknown; after: unknown };

export function diffAuditEntry(entry: Pick<AuditLogRow, "before" | "after">): FieldChange[] {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: FieldChange[] = [];
  for (const key of keys) {
    if (NOISE_KEYS.has(key)) continue;
    const b = before[key] ?? null;
    const a = after[key] ?? null;
    if (JSON.stringify(b) !== JSON.stringify(a)) changes.push({ field: key, before: b, after: a });
  }
  return changes;
}
