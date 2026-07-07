import type { CompanyInsert, CompanyRow, CompanyUpdate, ContactRow, DealRow, InteractionRow } from "@/lib/database.types";
import { FREE_MAIL_DOMAINS } from "@/lib/domain";
import { assertOk, isUuid, type Db } from "@/lib/crm/db";

export type CompanyWithCounts = CompanyRow & {
  people_count: number;
};

export type CompanyDetail = CompanyRow & {
  people: ContactRow[];
  // Everything logged against anyone at the company — the Attio-style
  // org-level index (emails, calls, meetings, notes).
  interactions: (InteractionRow & { contact: { id: string; full_name: string } | null })[];
  deals: (DealRow & { broker: { id: string; full_name: string } | null })[];
};

export async function listCompanies(db: Db, filter: { search?: string } = {}): Promise<CompanyWithCounts[]> {
  let query = db
    .from("companies")
    .select("*, contacts(count)")
    .order("name");
  if (filter.search?.trim()) {
    query = query.ilike("name", `%${filter.search.trim().replace(/[\\%_]/g, "\\$&")}%`);
  }
  const { data, error } = await query.returns<(CompanyRow & { contacts: { count: number }[] })[]>();
  const rows = assertOk(data, error, "Listing companies");
  return rows.map(({ contacts, ...c }) => ({ ...c, people_count: contacts[0]?.count ?? 0 }));
}

// Returns null when missing; throws on real failures (outage ≠ 404).
export async function getCompany(db: Db, id: string): Promise<CompanyDetail | null> {
  const { data, error } = await db.from("companies").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Loading company: ${error.message}`);
  if (!data) return null;

  const { data: people, error: peopleError } = await db
    .from("contacts")
    .select("*")
    .eq("company_id", id)
    .order("full_name");
  const contacts = assertOk(people, peopleError, "Loading company people");

  const contactIds = contacts.map((c) => c.id);
  const [interactionsRes, dealsRes] = await Promise.all([
    contactIds.length
      ? db
          .from("interactions")
          .select("*, contact:contacts!interactions_broker_id_fkey(id, full_name)")
          .in("broker_id", contactIds)
          .order("occurred_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
    contactIds.length
      ? db
          .from("deals")
          .select("*, broker:contacts(id, full_name)")
          .in("broker_id", contactIds)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  return {
    ...data,
    people: contacts,
    interactions: assertOk(
      interactionsRes.data as CompanyDetail["interactions"] | null,
      interactionsRes.error,
      "Loading company interactions",
    ),
    deals: assertOk(dealsRes.data as CompanyDetail["deals"] | null, dealsRes.error, "Loading company deals"),
  };
}

export async function resolveCompanyId(db: Db, idOrName: string): Promise<string> {
  if (isUuid(idOrName)) return idOrName;
  const { data, error } = await db.from("companies").select("id, name").ilike("name", `%${idOrName}%`).limit(10);
  const matches = assertOk(data, error, "Resolving company");
  if (matches.length === 1) return matches[0].id;
  if (matches.length === 0) throw new Error(`No company found matching "${idOrName}"`);
  const exact = matches.filter((m) => m.name.toLowerCase() === idOrName.toLowerCase());
  if (exact.length === 1) return exact[0].id;
  throw new Error(
    `Ambiguous company "${idOrName}" — candidates: ${matches.map((m) => `${m.name} [${m.id}]`).join(", ")}`,
  );
}

export async function createCompany(db: Db, input: CompanyInsert): Promise<CompanyRow> {
  const { data, error } = await db.from("companies").insert(input).select().single();
  return assertOk(data, error, "Creating company");
}

export async function updateCompany(db: Db, id: string, input: CompanyUpdate): Promise<CompanyRow> {
  const { data, error } = await db.from("companies").update(input).eq("id", id).select().single();
  return assertOk(data, error, "Updating company");
}

// Deleting a company never deletes people — they are unlinked (company_id
// cleared) first, then the org record itself is removed.
export async function deleteCompany(db: Db, id: string): Promise<void> {
  const { error: unlinkError } = await db.from("contacts").update({ company_id: null }).eq("company_id", id);
  if (unlinkError) throw new Error(`Unlinking company people: ${unlinkError.message}`);

  const { error } = await db.from("companies").delete().eq("id", id);
  if (error) throw new Error(`Deleting company: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Auto-create / auto-link — companies are never hand-maintained.
// ---------------------------------------------------------------------------

// Resolve a typed company NAME to a record id, creating the record on first
// sight. Case-insensitive; returns null for empty input.
export async function ensureCompanyByName(
  db: Db,
  name: string | null | undefined,
  meta: { created_by?: string | null } = {},
): Promise<string | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const { data, error } = await db.from("companies").select("id").ilike("name", trimmed).limit(1).maybeSingle();
  if (error) throw new Error(`Looking up company: ${error.message}`);
  if (data) return data.id;

  const created = await createCompany(db, { name: trimmed, created_by: meta.created_by ?? null });
  return created.id;
}

export function domainOfEmail(email: string | null | undefined): string | null {
  const at = email?.lastIndexOf("@") ?? -1;
  if (!email || at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain || FREE_MAIL_DOMAINS.has(domain)) return null;
  return domain;
}

// Human-ish company name from a domain: "flourishfinance.com.au" → "Flourishfinance".
function nameFromDomain(domain: string): string {
  const label = domain.split(".")[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Find-or-create a company from an email domain (used by the Gmail sync when
// it discovers new people). Free-mail domains never create companies.
export async function ensureCompanyByDomain(
  db: Db,
  email: string | null | undefined,
  meta: { created_by?: string | null } = {},
): Promise<string | null> {
  const domain = domainOfEmail(email);
  if (!domain) return null;

  const { data, error } = await db.from("companies").select("id").eq("domain", domain).maybeSingle();
  if (error) throw new Error(`Looking up company by domain: ${error.message}`);
  if (data) return data.id;

  // A company created earlier by name may not have its domain recorded yet —
  // attach the domain rather than duplicating the record.
  const guess = nameFromDomain(domain);
  const { data: byName, error: nameError } = await db
    .from("companies")
    .select("id, domain")
    .ilike("name", guess)
    .limit(1)
    .maybeSingle();
  if (nameError) throw new Error(`Looking up company by name: ${nameError.message}`);
  if (byName) {
    if (!byName.domain) await updateCompany(db, byName.id, { domain });
    return byName.id;
  }

  const created = await createCompany(db, { name: guess, domain, created_by: meta.created_by ?? null });
  return created.id;
}
