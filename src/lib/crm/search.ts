import { assertOk, orIlikePattern, type Db } from "@/lib/crm/db";

export type SearchResult = {
  kind: "broker" | "deal";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

// Global cmd-K search: simple ilike across contacts and deals. No search
// infrastructure — two indexed queries are plenty at this scale. The .or()
// value escaping lives in orIlikePattern (see db.ts).
export async function searchAll(db: Db, q: string, limit = 8): Promise<SearchResult[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const pattern = orIlikePattern(term);

  const [brokersRes, dealsRes] = await Promise.all([
    db
      .from("contacts")
      .select("id, full_name, company")
      .or(`full_name.ilike.${pattern},company.ilike.${pattern},email.ilike.${pattern}`)
      .limit(limit),
    db
      .from("deals")
      .select("id, name, security_address, status")
      .or(`name.ilike.${pattern},security_address.ilike.${pattern},borrower_entity.ilike.${pattern}`)
      .limit(limit),
  ]);

  const brokers = assertOk(brokersRes.data, brokersRes.error, "Searching brokers");
  const deals = assertOk(dealsRes.data, dealsRes.error, "Searching deals");

  return [
    ...brokers.map(
      (b): SearchResult => ({
        kind: "broker",
        id: b.id,
        title: b.full_name,
        subtitle: b.company,
        href: `/brokers/${b.id}`,
      }),
    ),
    ...deals.map(
      (d): SearchResult => ({
        kind: "deal",
        id: d.id,
        title: d.name,
        subtitle: d.status === "settled" ? "Loan Book" : d.security_address,
        href: `/deals/${d.id}`,
      }),
    ),
  ];
}
