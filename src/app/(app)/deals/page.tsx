import { createClient } from "@/lib/supabase/server";
import { listDeals } from "@/lib/crm/deals";
import { listBrokers } from "@/lib/crm/brokers";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { AddDealSheet } from "@/components/deals/AddDealSheet";
import { DealBoard } from "@/components/deals/DealBoard";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const supabase = await createClient();
  // The board carries live deals (in their pipeline columns) and lost deals
  // (the terminal column). Settled deals live on the Loan Book, not here.
  const [live, lost, brokers] = await Promise.all([
    listDeals(supabase, { status: "live" }),
    listDeals(supabase, { status: "lost" }),
    listBrokers(supabase),
  ]);

  const boardDeals = [...live, ...lost];
  const brokerOptions = brokers.map((b) => ({ id: b.id, full_name: b.full_name }));

  return (
    <>
      <PageHeader title="Deals" trailing={<AddDealSheet brokers={brokerOptions} />} />

      {boardDeals.length === 0 ? (
        <EmptyState title="No deals yet" hint="Add a deal to start the pipeline." />
      ) : (
        <DealBoard deals={boardDeals} />
      )}
    </>
  );
}
