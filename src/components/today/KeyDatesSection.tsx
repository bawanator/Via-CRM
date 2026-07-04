import { GroupedSection, LinkRow } from "@/components/ui/GroupedList";
import { Badge } from "@/components/ui/Badge";
import type { UpcomingKeyDate } from "@/lib/crm/keyDates";
import { daysBetween } from "@/lib/dates";
import { relativeDays } from "@/lib/format";

export function KeyDatesSection({ keyDates, today }: { keyDates: UpcomingKeyDate[]; today: string }) {
  if (keyDates.length === 0) return null;
  return (
    <GroupedSection header="Key Dates">
      {keyDates.map((k) => {
        const dueOrOverdue = daysBetween(today, k.due_date) <= 0;
        return (
          <LinkRow key={k.id} href={`/deals/${k.deal?.id ?? k.deal_id}`}>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-body truncate text-label">{k.label}</p>
                {k.deal ? <p className="text-footnote truncate text-label-2">{k.deal.name}</p> : null}
              </div>
              <Badge tone={dueOrOverdue ? "red" : "orange"}>{relativeDays(k.due_date, today)}</Badge>
            </div>
          </LinkRow>
        );
      })}
    </GroupedSection>
  );
}
