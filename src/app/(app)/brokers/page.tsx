import { createClient } from "@/lib/supabase/server";
import { listBrokers } from "@/lib/crm/brokers";
import { PageHeader } from "@/components/ui/PageHeader";
import { AddBrokerButton } from "@/components/brokers/AddBrokerButton";
import { BrokerBoard } from "@/components/brokers/BrokerBoard";

export const dynamic = "force-dynamic";

export default async function BrokersPage() {
  const supabase = await createClient();
  const brokers = await listBrokers(supabase);

  return (
    <>
      <PageHeader title="Brokers" trailing={<AddBrokerButton />} />
      <BrokerBoard brokers={brokers} />
    </>
  );
}
