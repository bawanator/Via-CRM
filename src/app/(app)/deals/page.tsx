import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listDeals, type DealWithBroker } from "@/lib/crm/deals";
import { listBrokers } from "@/lib/crm/brokers";
import { FUNDER_LABELS, PIPELINE_STAGE_LABELS, PIPELINE_STAGES, PRODUCT_LABELS } from "@/lib/domain";
import { formatAmount } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { AddDealSheet } from "@/components/deals/AddDealSheet";

export const dynamic = "force-dynamic";

function DealCard({ deal }: { deal: DealWithBroker }) {
  const amountLine = [
    deal.loan_amount != null ? formatAmount(deal.loan_amount) : null,
    deal.product ? PRODUCT_LABELS[deal.product] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={`/deals/${deal.id}`} className="pressable block rounded-xl bg-card p-3">
      <p className="text-headline text-label">{deal.name}</p>
      {deal.broker ? <p className="text-footnote mt-0.5 text-label-2">{deal.broker.full_name}</p> : null}
      {amountLine ? <p className="text-footnote text-label-2">{amountLine}</p> : null}
      {deal.funder ? (
        <div className="mt-1.5">
          <Badge>{FUNDER_LABELS[deal.funder]}</Badge>
        </div>
      ) : null}
    </Link>
  );
}

export default async function DealsPage() {
  const supabase = await createClient();
  const [deals, brokers] = await Promise.all([
    listDeals(supabase, { status: "live" }),
    listBrokers(supabase),
  ]);

  const brokerOptions = brokers.map((b) => ({ id: b.id, full_name: b.full_name }));

  return (
    <>
      <PageHeader title="Deals" trailing={<AddDealSheet brokers={brokerOptions} />} />

      {deals.length === 0 ? (
        <EmptyState title="No live deals" hint="Add a deal to start the pipeline." />
      ) : (
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:overflow-visible md:px-0">
          {PIPELINE_STAGES.map((stage) => {
            const column = deals.filter((d) => d.pipeline_stage === stage);
            return (
              <section
                key={stage}
                aria-label={PIPELINE_STAGE_LABELS[stage]}
                className="w-[80vw] max-w-72 shrink-0 snap-center md:w-auto md:min-w-0 md:max-w-none md:flex-1"
              >
                <header className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className="text-footnote uppercase tracking-wide text-label-2">
                    {PIPELINE_STAGE_LABELS[stage]}
                  </h2>
                  <span className="text-footnote text-label-3">{column.length}</span>
                </header>
                <div className="flex flex-col gap-2">
                  {column.map((deal) => (
                    <DealCard key={deal.id} deal={deal} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
