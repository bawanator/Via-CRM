"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { changeDealBrokerAction, updateDealFieldAction } from "@/app/(app)/deals/actions";
import { GroupedSection } from "@/components/ui/GroupedList";
import { ArrowUpRightIcon } from "@/components/ui/icons";
import { InlineSelect } from "@/components/common/InlineSelect";
import { InlineText } from "@/components/common/InlineText";
import { FUNDER_LABELS, FUNDERS, PRODUCT_LABELS, PRODUCTS } from "@/lib/domain";
import type { DealWithBroker } from "@/lib/crm/deals";

export type BrokerOption = { id: string; full_name: string };

// A label-left / editable-value-right row. The Inline* control fills the value
// column so the whole thing reads as a normal details row, not a form.
function InlineRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-4 px-4">
      <span className="text-body w-32 shrink-0 text-label">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// Every editable deal fact lives here — no Edit button anywhere. Funder is
// shown ONLY as its codename (1/2/3); the real name lives nowhere in the app.
export function DealDetailsSection({ deal, brokerOptions }: { deal: DealWithBroker; brokerOptions: BrokerOption[] }) {
  const save = (field: string) => (value: string) => updateDealFieldAction(deal.id, field, value);

  const productOptions = [
    { value: "", label: "None" },
    ...PRODUCTS.map((p) => ({ value: p, label: PRODUCT_LABELS[p] })),
  ];
  const funderOptions = [
    { value: "", label: "Not set" },
    ...FUNDERS.map((f) => ({ value: f, label: FUNDER_LABELS[f] })),
  ];

  return (
    <GroupedSection header="Details">
      {/* Broker is reassignable — pick from every Broker-type contact. */}
      <InlineRow label="Broker">
        <div className="flex items-center gap-1">
          <InlineSelect
            value={deal.broker?.id ?? null}
            options={brokerOptions.map((b) => ({ value: b.id, label: b.full_name }))}
            onSave={(value) => changeDealBrokerAction(deal.id, value)}
            ariaLabel="Broker"
            placeholder="Choose broker"
            className="min-w-0 flex-1"
          />
          {deal.broker ? (
            <Link
              href={`/brokers/${deal.broker.id}`}
              aria-label={`Open ${deal.broker.full_name}`}
              className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-blue"
            >
              <ArrowUpRightIcon className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </InlineRow>
      <InlineRow label="Borrower Entity">
        <InlineText value={deal.borrower_entity} onSave={save("borrower_entity")} ariaLabel="Borrower entity" />
      </InlineRow>
      <InlineRow label="Borrower Contact">
        <InlineText
          value={deal.borrower_contact_name}
          onSave={save("borrower_contact_name")}
          ariaLabel="Borrower contact"
        />
      </InlineRow>
      <InlineRow label="Contact Email">
        <InlineText
          type="email"
          value={deal.borrower_contact_email}
          onSave={save("borrower_contact_email")}
          ariaLabel="Borrower contact email"
        />
      </InlineRow>
      <InlineRow label="Contact Phone">
        <InlineText
          type="tel"
          value={deal.borrower_contact_phone}
          onSave={save("borrower_contact_phone")}
          ariaLabel="Borrower contact phone"
        />
      </InlineRow>
      <InlineRow label="Loan Amount">
        <InlineText
          value={deal.loan_amount != null ? String(deal.loan_amount) : null}
          onSave={save("loan_amount")}
          ariaLabel="Loan amount"
          placeholder="—"
        />
      </InlineRow>
      <InlineRow label="Gross LVR">
        <InlineText
          value={deal.gross_lvr != null ? `${deal.gross_lvr}%` : null}
          onSave={save("gross_lvr")}
          ariaLabel="Gross LVR"
          placeholder="—"
        />
      </InlineRow>
      <InlineRow label="Product">
        <InlineSelect value={deal.product} options={productOptions} onSave={save("product")} ariaLabel="Product" placeholder="None" />
      </InlineRow>
      <InlineRow label="Funder">
        <InlineSelect value={deal.funder} options={funderOptions} onSave={save("funder")} ariaLabel="Funder" placeholder="Not set" />
      </InlineRow>
    </GroupedSection>
  );
}
