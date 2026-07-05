import { createClient } from "@/lib/supabase/server";
import { listCompanies } from "@/lib/crm/companies";
import { PageHeader } from "@/components/ui/PageHeader";
import { CompanyList } from "@/components/companies/CompanyList";

export const dynamic = "force-dynamic";

// No create button on purpose: companies are auto-created from contacts and
// email domains (see ensureCompanyByName / ensureCompanyByDomain).
export default async function CompaniesPage() {
  const supabase = await createClient();
  const companies = await listCompanies(supabase);

  return (
    <>
      <PageHeader title="Companies" />
      <CompanyList companies={companies} />
    </>
  );
}
