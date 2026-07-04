import type { AuditLogRow } from "@/lib/database.types";
import { assertOk, type Db } from "@/lib/crm/db";

export const AUDITED_TABLES = ["brokers", "deals", "key_dates", "drive_links", "interactions"] as const;

export type AuditFilter = {
  tableName?: string;
  recordId?: string;
  limit?: number;
  before?: string; // changed_at cursor for paging
};

export async function listAuditLog(db: Db, filter: AuditFilter = {}): Promise<AuditLogRow[]> {
  let query = db
    .from("audit_log")
    .select("*")
    .order("changed_at", { ascending: false })
    .limit(filter.limit ?? 100);
  if (filter.tableName) query = query.eq("table_name", filter.tableName);
  if (filter.recordId) query = query.eq("record_id", filter.recordId);
  if (filter.before) query = query.lt("changed_at", filter.before);
  const { data, error } = await query;
  return assertOk(data, error, "Loading audit log");
}

// Field-level diff for the audit UI: which keys changed, from what, to what.
// Row-meta noise (updated_at/updated_by) is excluded so diffs show substance.
const NOISE_KEYS = new Set(["updated_at", "updated_by", "created_at", "created_by"]);

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
