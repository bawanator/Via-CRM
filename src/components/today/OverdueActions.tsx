import { GroupedSection, LinkRow } from "@/components/ui/GroupedList";
import { Badge } from "@/components/ui/Badge";
import type { BrokerWithStats } from "@/lib/crm/brokers";
import { relativeDays } from "@/lib/format";

export function OverdueActions({ brokers, today }: { brokers: BrokerWithStats[]; today: string }) {
  if (brokers.length === 0) return null;
  return (
    <GroupedSection header="Overdue Next Actions">
      {brokers.map((b) => (
        <LinkRow key={b.id} href={`/brokers/${b.id}`}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-body text-label">{b.full_name}</p>
              {b.next_action ? <p className="text-footnote truncate text-label-2">{b.next_action}</p> : null}
            </div>
            <Badge tone="red">{b.next_action_date ? relativeDays(b.next_action_date, today) : "overdue"}</Badge>
          </div>
        </LinkRow>
      ))}
    </GroupedSection>
  );
}
