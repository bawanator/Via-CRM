import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContact, type ContactDetail } from "@/lib/crm/contacts";
import { listContactTypes } from "@/lib/crm/contactTypes";
import { listDriveLinks } from "@/lib/crm/driveLinks";
import { listTasks } from "@/lib/crm/tasks";
import type { ContactTypeRow, DriveLinkRow } from "@/lib/database.types";
import type { TaskItem } from "@/components/tasks/types";
import { ContactProfile } from "@/components/brokers/ContactProfile";
import { BackButton } from "@/components/common/BackButton";

export const dynamic = "force-dynamic";

// The contact record page. All rendering lives in ContactProfile (client) —
// the Attio-style tabbed profile. getContact loads interactions (limit 200);
// per-tab lists and counts are derived from that one payload.
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [contact, driveLinks, types, taskRows]: [
    ContactDetail | null,
    DriveLinkRow[],
    ContactTypeRow[],
    Awaited<ReturnType<typeof listTasks>>,
  ] = await Promise.all([
    getContact(supabase, id),
    listDriveLinks(supabase, "contact", id),
    listContactTypes(supabase),
    listTasks(supabase, { contactId: id }),
  ]);
  if (!contact) notFound();

  const tasks: TaskItem[] = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    completed: t.completed,
    completed_at: t.completed_at,
    subtitle: t.deal?.name ?? null,
  }));

  return (
    <div>
      <BackButton fallback="/brokers" />
      <ContactProfile contact={contact} types={types} tasks={tasks} driveLinks={driveLinks} />
    </div>
  );
}
