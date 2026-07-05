"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoanRow } from "@/components/loanbook/LoanRow";
import type { LoanBookItem } from "@/components/loanbook/types";

type Filter = "all" | "soon";

// Loans arrive already ordered by maturity (soonest first) and fully computed.
// The only interactivity is an in-memory filter for "maturing ≤ 90 days" (which
// includes anything already overdue) — no refetch, just a client-side narrow.
export function LoanBookList({ loans }: { loans: LoanBookItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const soonCount = loans.filter((l) => l.daysToMaturity != null && l.daysToMaturity <= 90).length;
  const shown = filter === "soon" ? loans.filter((l) => l.daysToMaturity != null && l.daysToMaturity <= 90) : loans;

  return (
    <div>
      <div className="mb-4">
        <SegmentedControl<Filter>
          ariaLabel="Filter loans by maturity"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All (${loans.length})` },
            { value: "soon", label: `Maturing ≤ 90d (${soonCount})` },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState title="Nothing maturing soon" hint="No settled loans mature within 90 days." />
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((loan) => (
            <LoanRow key={loan.id} loan={loan} />
          ))}
        </div>
      )}
    </div>
  );
}
