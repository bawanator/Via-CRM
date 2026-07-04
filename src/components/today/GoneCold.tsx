import { GroupedSection, LinkRow } from "@/components/ui/GroupedList";
import { Badge } from "@/components/ui/Badge";
import type { BrokerWithStats } from "@/lib/crm/brokers";
import { daysBetween } from "@/lib/dates";

const MAX_ROWS = 8;

export function GoneCold({ brokers, today }: { brokers: BrokerWithStats[]; today: string }) {
  if (brokers.length === 0) return null;
  const shown = brokers.slice(0, MAX_ROWS);
  const truncated = brokers.length > MAX_ROWS;
  const footer = truncated
    ? `No contact in 30+ days. Showing ${MAX_ROWS} of ${brokers.length}.`
    : "No contact in 30+ days.";
  return (
    <GroupedSection header="Gone Cold" footer={footer}>
      {shown.map((b) => (
        <LinkRow key={b.id} href={`/brokers/${b.id}`}>
          <div className="flex items-center gap-3">
            <p className="text-body min-w-0 flex-1 truncate text-label">{b.full_name}</p>
            <Badge tone="gray">
              {b.last_contact_date ? `${daysBetween(b.last_contact_date, today)} days` : "never"}
            </Badge>
          </div>
        </LinkRow>
      ))}
    </GroupedSection>
  );
}
