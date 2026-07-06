import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompany } from "@/lib/crm/companies";
import { listTasks } from "@/lib/crm/tasks";
import type { TaskItem } from "@/components/tasks/types";
import { GroupedSection, LinkRow } from "@/components/ui/GroupedList";
import { CompanyHeader } from "@/components/companies/CompanyHeader";
import { CompanyTabs } from "@/components/companies/CompanyTabs";

export const dynamic = "force-dynamic";

// The Attio-style org record: who works here, plus every email, call and note
// logged against anyone at the company — indexed org-wide, not per person.
export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const company = await getCompany(supabase, id);
  if (!company) notFound();

  // Tasks against anyone at this company — the org page is another lens.
  const taskRows = await listTasks(supabase, { contactIds: company.people.map((p) => p.id) });
  const tasks: TaskItem[] = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    completed: t.completed,
    completed_at: t.completed_at,
    subtitle: t.contact?.full_name ?? null,
  }));

  return (
    <>
      <CompanyHeader
        company={{ id: company.id, name: company.name, domain: company.domain, location: company.location }}
      />

      <CompanyTabs
        company={{ id: company.id, notes: company.notes }}
        people={company.people}
        interactions={company.interactions}
        deals={company.deals}
        tasks={tasks}
      />

      <GroupedSection>
        <LinkRow href={`/audit?table=companies&record=${company.id}`}>
          <span className="text-body text-label">Change History</span>
        </LinkRow>
      </GroupedSection>
    </>
  );
}
