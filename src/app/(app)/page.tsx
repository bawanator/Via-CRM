import { createClient } from "@/lib/supabase/server";
import { whatsDue } from "@/lib/crm/today";
import { APP_TIMEZONE } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PipelineStrip } from "@/components/today/PipelineStrip";
import { OverdueActions } from "@/components/today/OverdueActions";
import { KeyDatesSection } from "@/components/today/KeyDatesSection";
import { GoneCold } from "@/components/today/GoneCold";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const supabase = await createClient();
  const data = await whatsDue(supabase);

  const longDate = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: APP_TIMEZONE,
  }).format(new Date());

  const allClear =
    data.overdueActions.length === 0 && data.upcomingKeyDates.length === 0 && data.coldBrokers.length === 0;

  return (
    <div>
      <PageHeader title="Today">
        <p className="text-footnote text-label-2">{longDate}</p>
      </PageHeader>

      <PipelineStrip counts={data.liveDealsByStage} />

      {allClear ? (
        <EmptyState title="All clear" hint="No overdue actions or upcoming key dates." />
      ) : (
        <>
          <OverdueActions brokers={data.overdueActions} today={data.today} />
          <KeyDatesSection keyDates={data.upcomingKeyDates} today={data.today} />
          <GoneCold brokers={data.coldBrokers} today={data.today} />
        </>
      )}
    </div>
  );
}
