import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { whatsDue } from "@/lib/crm/today";
import { emailsSentToday, overviewStats } from "@/lib/crm/overview";
import { listBrokers } from "@/lib/crm/contacts";
import { APP_TIMEZONE } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { BookIcon, CalendarIcon, CheckCircleIcon, DealsIcon, PeopleIcon } from "@/components/ui/icons";
import { OverviewPanel } from "@/components/today/OverviewPanel";
import { TodayTasks } from "@/components/today/TodayTasks";
import { PipelineStrip } from "@/components/today/PipelineStrip";
import { OverdueActions } from "@/components/today/OverdueActions";
import { KeyDatesSection } from "@/components/today/KeyDatesSection";
import { GoneCold } from "@/components/today/GoneCold";
import type { TaskItem } from "@/components/tasks/types";

export const dynamic = "force-dynamic";

// Streams in after first paint: the emails-sent count needs two Google round
// trips (token refresh + Gmail query), which must never block the page. The
// card renders immediately with the task count; this sub-line follows.
async function TasksCompletedCard({ count }: { count: number }) {
  const supabase = await createClient();
  const sentToday = await emailsSentToday(supabase);
  return (
    <StatCard
      label="Tasks completed"
      value={count}
      sub={sentToday === null ? "today" : `+ ${sentToday} ${sentToday === 1 ? "email" : "emails"} sent today`}
      icon={CheckCircleIcon}
      href="/tasks"
    />
  );
}

export default async function TodayPage() {
  const supabase = await createClient();
  const [data, stats, brokers] = await Promise.all([
    whatsDue(supabase),
    overviewStats(supabase),
    listBrokers(supabase),
  ]);
  const mentionOptions = brokers.map((b) => ({ id: b.id, full_name: b.full_name }));

  const longDate = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: APP_TIMEZONE,
  }).format(new Date());

  const liveDeals = Object.values(data.liveDealsByStage).reduce((a, b) => a + b, 0);
  const monthName = new Intl.DateTimeFormat("en-AU", { month: "long", timeZone: APP_TIMEZONE }).format(new Date());
  const maturityShort = stats.nextMaturity
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: APP_TIMEZONE }).format(
        new Date(stats.nextMaturity.maturity_date + "T00:00:00"),
      )
    : "—";

  // Shape open tasks for the presentational TaskList, and build a parallel
  // id → href map so a task linked to a contact/deal can deep-link.
  const taskItems: TaskItem[] = data.openTasks.map((t) => ({
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    completed: t.completed,
    subtitle: t.deal?.name ?? t.contact?.full_name ?? null,
  }));
  const taskHrefs: Record<string, string> = {};
  for (const t of data.openTasks) {
    if (t.deal) taskHrefs[t.id] = `/deals/${t.deal.id}`;
    else if (t.contact) taskHrefs[t.id] = `/brokers/${t.contact.id}`;
  }

  // "All clear" = nothing pressing today: no open tasks, no overdue next
  // actions, no upcoming key dates. (Gone Cold is a standing informational
  // list and renders separately below whenever there are cold contacts.)
  const allClear =
    data.openTasks.length === 0 && data.overdueActions.length === 0 && data.upcomingKeyDates.length === 0;

  return (
    <div>
      <PageHeader title="Vía OS">
        <p className="text-footnote text-label-2">{longDate}</p>
      </PageHeader>

      {/* The live pipeline leads the page; stat cards follow. */}
      <PipelineStrip counts={data.liveDealsByStage} />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Suspense
          fallback={
            <StatCard label="Tasks completed" value={stats.tasksCompletedToday} sub="today" icon={CheckCircleIcon} href="/tasks" />
          }
        >
          <TasksCompletedCard count={stats.tasksCompletedToday} />
        </Suspense>
        <StatCard
          label="Deals this month"
          value={stats.dealsThisMonth}
          sub={`came in ${monthName}`}
          icon={DealsIcon}
          href="/deals"
        />
        <StatCard
          label="Loan book"
          value={stats.settledLoans}
          sub={stats.settledLoans === 1 ? "settled loan" : "settled loans"}
          icon={BookIcon}
          href="/loan-book"
        />
        <StatCard
          label="Next maturity"
          value={maturityShort}
          sub={stats.nextMaturity?.name ?? "none upcoming"}
          icon={CalendarIcon}
          href={stats.nextMaturity ? `/deals/${stats.nextMaturity.deal_id}` : "/loan-book"}
        />
        <StatCard
          label="Contacts"
          value={stats.totalContacts}
          sub={`${data.coldBrokers.length} gone cold`}
          icon={PeopleIcon}
          href="/brokers"
        />
      </div>

      <OverviewPanel
        settledLoans={stats.settledLoans}
        liveDeals={liveDeals}
        openTasks={data.openTasks.length}
        coldContacts={data.coldBrokers.length}
        nextMaturity={stats.nextMaturity}
      />

      <TodayTasks
        tasks={taskItems}
        hrefById={taskHrefs}
        totalOpen={data.totalOpenTasks}
        mentionOptions={mentionOptions}
      />

      <OverdueActions brokers={data.overdueActions} today={data.today} />
      <KeyDatesSection keyDates={data.upcomingKeyDates} today={data.today} />

      {allClear ? (
        <EmptyState title="All clear" hint="No tasks, overdue actions, or upcoming key dates." />
      ) : null}

      <GoneCold brokers={data.coldBrokers} today={data.today} />
    </div>
  );
}
