"use client";

import { useState } from "react";
import { GroupedSection, LinkRow, Row } from "@/components/ui/GroupedList";
import type { CompanyWithCounts } from "@/lib/crm/companies";

// Sparse Attio-style org list with a client-side quick filter. The dataset is
// small (one company per firm we deal with), so filtering in memory is plenty.
export function CompanyList({ companies }: { companies: CompanyWithCounts[] }) {
  const [filter, setFilter] = useState("");

  const q = filter.trim().toLowerCase();
  const filtered = q ? companies.filter((c) => c.name.toLowerCase().includes(q)) : companies;

  return (
    <>
      <div className="mb-4">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name"
          aria-label="Filter companies by name"
          className="text-body min-h-11 w-full rounded-xl bg-card px-4 text-label placeholder:text-label-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-blue sm:max-w-sm"
        />
      </div>

      <GroupedSection footer="Companies are created automatically from your contacts and their email domains — nothing to add by hand.">
        {filtered.length === 0 ? (
          <Row>
            <p className="text-footnote text-label-3">
              {companies.length === 0 ? "No companies yet." : "No companies match."}
            </p>
          </Row>
        ) : (
          filtered.map((company) => (
            <LinkRow key={company.id} href={`/companies/${company.id}`}>
              <p className="text-headline truncate text-label">{company.name}</p>
              <p className="text-footnote truncate text-label-2">{companyCaption(company)}</p>
            </LinkRow>
          ))
        )}
      </GroupedSection>
    </>
  );
}

function companyCaption(company: CompanyWithCounts): string {
  const people = company.people_count === 1 ? "1 person" : `${company.people_count} people`;
  return [company.domain, company.location, people].filter(Boolean).join(" · ");
}
