import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompany } from "@/lib/crm/companies";
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
      />

      <GroupedSection>
        <LinkRow href={`/audit?table=companies&record=${company.id}`}>
          <span className="text-body text-label">Change History</span>
        </LinkRow>
      </GroupedSection>
    </>
  );
}
