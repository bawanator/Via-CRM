"use client";

import { useRouter } from "next/navigation";
import { AUDITED_TABLES } from "@/lib/crm/audit";
import { Badge } from "@/components/ui/Badge";
import { SelectField } from "@/components/ui/Field";

// Filter state lives in the URL so filtered views are shareable and the
// server page stays the single source of truth. Changing any filter drops
// the `before` paging cursor (it is deliberately never re-included here).

const ACTION_OPTIONS = ["insert", "update", "delete"] as const;
const SOURCE_OPTIONS = ["ui", "mcp", "import", "system"] as const;

type Props = {
  table: string;
  action: string;
  source: string;
  record: string | null;
};

export function AuditFilters({ table, action, source, record }: Props) {
  const router = useRouter();

  function apply(next: Partial<Props>) {
    const merged = { table, action, source, record, ...next };
    const params = new URLSearchParams();
    if (merged.table) params.set("table", merged.table);
    if (merged.action) params.set("action", merged.action);
    if (merged.source) params.set("source", merged.source);
    if (merged.record) params.set("record", merged.record);
    const qs = params.toString();
    router.replace(qs ? `/audit?${qs}` : "/audit", { scroll: false });
  }

  return (
    <div className="mb-6">
      <div className="hairline-rows overflow-hidden rounded-xl bg-card">
        <SelectField label="Table" value={table} onChange={(e) => apply({ table: e.target.value })}>
          <option value="">All</option>
          {AUDITED_TABLES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </SelectField>
        <SelectField label="Action" value={action} onChange={(e) => apply({ action: e.target.value })}>
          <option value="">All</option>
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </SelectField>
        <SelectField label="Source" value={source} onChange={(e) => apply({ source: e.target.value })}>
          <option value="">All</option>
          {SOURCE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
      </div>
      {record ? (
        <button
          type="button"
          onClick={() => apply({ record: null })}
          aria-label="Clear the single-record filter"
          className="pressable mt-1 inline-flex min-h-11 items-center rounded-lg px-1"
        >
          <Badge tone="gray">Filtered to one record ×</Badge>
        </button>
      ) : null}
    </div>
  );
}
