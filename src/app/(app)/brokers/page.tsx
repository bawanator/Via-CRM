import { createClient } from "@/lib/supabase/server";
import { listContacts } from "@/lib/crm/contacts";
import { listContactTypes } from "@/lib/crm/contactTypes";
import { PageHeader } from "@/components/ui/PageHeader";
import { AddContactButton } from "@/components/brokers/AddContactButton";
import { ContactsBoard } from "@/components/brokers/ContactsBoard";

export const dynamic = "force-dynamic";

export default async function BrokersPage() {
  const supabase = await createClient();
  // Load every contact so the List view can show all types; the Kanban filters
  // to Broker-type contacts client-side.
  const [contacts, types] = await Promise.all([listContacts(supabase), listContactTypes(supabase)]);

  return (
    <>
      <PageHeader title="Brokers" trailing={<AddContactButton types={types} />} />
      <ContactsBoard contacts={contacts} types={types} />
    </>
  );
}
