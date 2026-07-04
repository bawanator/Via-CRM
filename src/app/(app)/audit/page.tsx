import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AUDITED_TABLES, listAuditLog } from "@/lib/crm/audit";
import { isUuid } from "@/lib/crm/db";
import type { AuditAction, AuditLogRow, ChangeSource } from "@/lib/database.types";
import { APP_TIMEZONE } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { AuditEntryRow } from "@/components/audit/AuditEntryRow";
import { AuditFilters } from "@/components/audit/AuditFilters";
import { EmptyState } from "@/components/ui/EmptyState";
import { GroupedSection } from "@/components/ui/GroupedList";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const ACTIONS: AuditAction[] = ["insert", "update", "delete"];
const SOURCES: ChangeSource[] = ["ui", "mcp", "import", "system"];

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  // Validate every query param before it touches a query; garbage is ignored.
  const tableParam = first(params.table);
  const table = tableParam && (AUDITED_TABLES as readonly string[]).includes(tableParam) ? tableParam : undefined;
  const action = ACTIONS.find((a) => a === first(params.action));
  const source = SOURCES.find((s) => s === first(params.source));
  const recordParam = first(params.record);
  const record = recordParam && isUuid(recordParam) ? recordParam : undefined;
  const beforeParam = first(params.before);
  const before = beforeParam && !Number.isNaN(Date.parse(beforeParam)) ? beforeParam : undefined;

  const supabase = await createClient();
  const raw = await listAuditLog(supabase, {
    tableName: table,
    recordId: record,
    limit: PAGE_SIZE,
    before,
  });

  // Action/source are filtered in code — fine at this scale, keeps the data
  // layer's cursor paging simple.
  const entries = raw.filter((e) => (!action || e.action === action) && (!source || e.source === source));

  // Group by calendar day in Sydney time; entries arrive newest-first, so the
  // Map's insertion order is already the display order.
  const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE });
  const groups = new Map<string, AuditLogRow[]>();
  for (const entry of entries) {
    const day = dayFormatter.format(new Date(entry.changed_at));
    const bucket = groups.get(day);
    if (bucket) bucket.push(entry);
    else groups.set(day, [entry]);
  }

  const hasMore = raw.length === PAGE_SIZE;
  let loadMoreHref: string | null = null;
  if (hasMore) {
    const next = new URLSearchParams();
    if (table) next.set("table", table);
    if (record) next.set("record", record);
    if (action) next.set("action", action);
    if (source) next.set("source", source);
    next.set("before", raw[raw.length - 1].changed_at);
    loadMoreHref = `/audit?${next.toString()}`;
  }

  const hasFilters = Boolean(table || record || action || source || before);

  return (
    <>
      <PageHeader title="Audit">
        <p className="text-footnote mt-1 text-label-2">Every change, who made it, and when.</p>
      </PageHeader>

      <AuditFilters table={table ?? ""} action={action ?? ""} source={source ?? ""} record={record ?? null} />

      {entries.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No changes match the current filters." : "No changes recorded yet."}
          hint={hasFilters ? undefined : "Changes to brokers, deals, key dates, links and interactions appear here."}
        />
      ) : (
        [...groups.entries()].map(([day, dayEntries]) => (
          <GroupedSection key={day} header={formatDate(day)}>
            {dayEntries.map((entry) => (
              <AuditEntryRow key={entry.id} entry={entry} />
            ))}
          </GroupedSection>
        ))
      )}

      {loadMoreHref ? (
        <div className="flex justify-center">
          <Link
            href={loadMoreHref}
            className="text-body pressable inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-blue"
          >
            Load More
          </Link>
        </div>
      ) : null}
    </>
  );
}
