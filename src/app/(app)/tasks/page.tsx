import { createClient } from "@/lib/supabase/server";
import { listTasks, type TaskWithRefs } from "@/lib/crm/tasks";
import { todayISO } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { TasksView, type TaskGroup } from "@/components/tasks/TasksView";
import type { TaskItem } from "@/components/tasks/types";

export const dynamic = "force-dynamic";

// Completed history shown on this page (reporting still sees everything).
const COMPLETED_CAP = 100;

function toItem(t: TaskWithRefs): TaskItem {
  return {
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    completed: t.completed,
    completed_at: t.completed_at,
    subtitle: t.deal?.name ?? t.contact?.full_name ?? null,
  };
}

export default async function TasksPage() {
  const supabase = await createClient();
  const all = await listTasks(supabase);
  const today = todayISO();

  const open = all.filter((t) => !t.completed);
  const completed = all
    .filter((t) => t.completed)
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, COMPLETED_CAP);

  const groups: TaskGroup[] = [
    { header: "Overdue", tasks: open.filter((t) => t.due_date != null && t.due_date < today).map(toItem) },
    { header: "Today", tasks: open.filter((t) => t.due_date === today).map(toItem) },
    { header: "Upcoming", tasks: open.filter((t) => t.due_date != null && t.due_date > today).map(toItem) },
    { header: "No date", tasks: open.filter((t) => t.due_date == null).map(toItem) },
  ];

  const hrefById: Record<string, string> = {};
  for (const t of all) {
    if (t.deal) hrefById[t.id] = `/deals/${t.deal.id}`;
    else if (t.contact) hrefById[t.id] = `/brokers/${t.contact.id}`;
  }

  return (
    <div>
      <PageHeader title="Tasks">
        <p className="text-footnote text-label-2">
          {open.length} open · synced with Google Tasks
        </p>
      </PageHeader>
      <TasksView groups={groups} completed={completed.map(toItem)} hrefById={hrefById} />
    </div>
  );
}
