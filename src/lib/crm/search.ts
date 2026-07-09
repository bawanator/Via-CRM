import { assertOk, orIlikePattern, type Db } from "@/lib/crm/db";

export type SearchResult = {
  kind: "contact" | "company" | "deal";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

// Global cmd-K search: simple ilike across contacts, companies and deals.
// No search infrastructure — three indexed queries are plenty at this scale.
// The .or() value escaping lives in orIlikePattern (see db.ts).
export async function searchAll(db: Db, q: string, limit = 8): Promise<SearchResult[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const pattern = orIlikePattern(term);

  const [contactsRes, companiesRes, dealsRes, securitiesRes] = await Promise.all([
    db
      .from("contacts")
      .select("id, full_name, type, company:companies(name)")
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(limit)
      .returns<{ id: string; full_name: string; type: string; company: { name: string } | null }[]>(),
    db
      .from("companies")
      .select("id, name, location")
      .or(`name.ilike.${pattern},domain.ilike.${pattern}`)
      .limit(limit),
    db
      .from("deals")
      .select("id, name, status")
      .or(`name.ilike.${pattern},borrower_entity.ilike.${pattern}`)
      .limit(limit),
    // Securities live in their own table now — match addresses and surface
    // the owning deal.
    db
      .from("deal_securities")
      .select("address, deal:deals(id, name, status)")
      .ilike("address", `%${term}%`)
      .limit(limit)
      .returns<{ address: string; deal: { id: string; name: string; status: string } | null }[]>(),
  ]);

  const contacts = assertOk(contactsRes.data, contactsRes.error, "Searching contacts");
  const companies = assertOk(companiesRes.data, companiesRes.error, "Searching companies");
  const deals = assertOk(dealsRes.data, dealsRes.error, "Searching deals");
  const securityHits = assertOk(securitiesRes.data, securitiesRes.error, "Searching securities");
  // Merge address matches in behind name matches, deduped by deal id.
  const seenDeals = new Set(deals.map((d) => d.id));
  const dealResults = [
    ...deals.map((d) => ({ id: d.id, name: d.name, status: d.status, subtitle: d.status === "settled" ? "Loan Book" : null })),
    ...securityHits.flatMap((s) =>
      s.deal && !seenDeals.has(s.deal.id)
        ? [{ id: s.deal.id, name: s.deal.name, status: s.deal.status, subtitle: s.address }]
        : [],
    ),
  ].slice(0, limit);

  return [
    ...contacts.map(
      (c): SearchResult => ({
        kind: "contact",
        id: c.id,
        title: c.full_name,
        subtitle: c.company?.name ?? c.type,
        href: `/brokers/${c.id}`,
      }),
    ),
    ...companies.map(
      (co): SearchResult => ({
        kind: "company",
        id: co.id,
        title: co.name,
        subtitle: co.location,
        href: `/companies/${co.id}`,
      }),
    ),
    ...dealResults.map(
      (d): SearchResult => ({
        kind: "deal",
        id: d.id,
        title: d.name,
        subtitle: d.subtitle ?? (d.status === "settled" ? "Loan Book" : null),
        href: `/deals/${d.id}`,
      }),
    ),
  ];
}
