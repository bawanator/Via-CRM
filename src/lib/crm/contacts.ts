import type {
  BrokerStage,
  BrokerStatsRow,
  ContactInsert,
  ContactRow,
  ContactUpdate,
  DealRow,
  InteractionRow,
} from "@/lib/database.types";
import { COLD_AFTER_DAYS, DEFAULT_CONTACT_TYPE } from "@/lib/domain";
import { addDaysISO, todayISO } from "@/lib/dates";
import { assertOk, isUuid, orIlikePattern, type Db } from "@/lib/crm/db";

// A broker is a contact of type "Broker". The table is `contacts`; broker_stats
// (unchanged name) still keys on broker_id = the contact's id.
// Company is a linked record — `company` here is the embedded {id, name}.
export type CompanyRef = { id: string; name: string } | null;

export type ContactWithStats = ContactRow & {
  company: CompanyRef;
  live_deal_count: number;
  total_deals_submitted: number;
  last_deal_outcome: BrokerStatsRow["last_deal_outcome"];
};

export type ContactDetail = ContactWithStats & {
  interactions: InteractionRow[];
  deals: DealRow[];
};

export type ContactFilter = {
  stage?: BrokerStage; // meaningful only for Broker-type contacts
  type?: string; // references contact_types.name
  location?: string;
  companyId?: string;
  overdueOnly?: boolean;
  coldOnly?: boolean;
  coldAfterDays?: number;
  search?: string; // ilike over full_name / email (company matches via searchAll)
};

const CONTACT_WITH_COMPANY = "*, company:companies(id, name)";

type ContactJoined = ContactRow & { company: CompanyRef };

async function attachStats(db: Db, contacts: ContactJoined[]): Promise<ContactWithStats[]> {
  if (contacts.length === 0) return [];
  const ids = contacts.map((c) => c.id);
  const { data, error } = await db.from("broker_stats").select("*").in("broker_id", ids);
  const stats = assertOk(data, error, "Loading contact stats");
  const byId = new Map(stats.map((s) => [s.broker_id, s]));
  return contacts.map((c) => {
    const s = byId.get(c.id);
    return {
      ...c,
      live_deal_count: s?.live_deal_count ?? 0,
      total_deals_submitted: s?.total_deals_submitted ?? 0,
      last_deal_outcome: s?.last_deal_outcome ?? null,
    };
  });
}

export async function listContacts(db: Db, filter: ContactFilter = {}): Promise<ContactWithStats[]> {
  let query = db.from("contacts").select(CONTACT_WITH_COMPANY).order("full_name");
  if (filter.type) query = query.eq("type", filter.type);
  if (filter.stage) query = query.eq("stage", filter.stage);
  if (filter.location) query = query.eq("location", filter.location);
  if (filter.companyId) query = query.eq("company_id", filter.companyId);
  if (filter.overdueOnly) query = query.lte("next_action_date", todayISO());
  if (filter.coldOnly) {
    const cutoff = addDaysISO(todayISO(), -(filter.coldAfterDays ?? COLD_AFTER_DAYS));
    query = query.or(`last_contact_date.lte.${cutoff},last_contact_date.is.null`);
  }
  const term = filter.search?.trim();
  if (term) {
    const pattern = orIlikePattern(term);
    query = query.or(`full_name.ilike.${pattern},email.ilike.${pattern}`);
  }
  const { data, error } = await query.returns<ContactJoined[]>();
  return attachStats(db, assertOk(data, error, "Listing contacts"));
}

// Convenience: brokers are contacts filtered to the Broker type. Callers that
// want the old broker list keep working; pass extra filters as needed.
export async function listBrokers(
  db: Db,
  filter: Omit<ContactFilter, "type"> = {},
): Promise<ContactWithStats[]> {
  return listContacts(db, { ...filter, type: DEFAULT_CONTACT_TYPE });
}

// Just {id, full_name} for pickers and "@" mentions — no company join and no
// broker_stats round trip (which listBrokers/listContacts always pay). Used on
// hot paths (deal broker dropdown, Today/Tasks mention menus) where the stats
// are never shown, so this is materially cheaper per page load.
export type BrokerOptionRow = { id: string; full_name: string };
export async function listBrokerOptions(db: Db): Promise<BrokerOptionRow[]> {
  const { data, error } = await db
    .from("contacts")
    .select("id, full_name")
    .eq("type", DEFAULT_CONTACT_TYPE)
    .order("full_name");
  return assertOk(data, error, "Listing broker options");
}

// Returns null when the contact doesn't exist; throws on real failures —
// callers must not turn a database outage into a 404.
export async function getContact(db: Db, id: string): Promise<ContactDetail | null> {
  const { data, error } = await db
    .from("contacts")
    .select(CONTACT_WITH_COMPANY)
    .eq("id", id)
    .maybeSingle<ContactJoined>();
  if (error) throw new Error(`Loading contact: ${error.message}`);
  if (!data) return null;
  const contact = data;

  // Emails and human-entered interactions are fetched SEPARATELY. A single
  // recency-capped query let a busy broker's synced email threads crowd every
  // note/call/meeting out of the window — notes "disappeared" from the record.
  // Emails are an index (capped, newest first); human entries load in full.
  const [withStats, emailsRes, humanRes, dealsRes] = await Promise.all([
    attachStats(db, [contact]),
    db
      .from("interactions")
      .select("*")
      .eq("broker_id", id)
      .eq("type", "email")
      .order("occurred_at", { ascending: false })
      .limit(100),
    db
      .from("interactions")
      .select("*")
      .eq("broker_id", id)
      .neq("type", "email")
      .order("occurred_at", { ascending: false })
      .limit(500),
    db.from("deals").select("*").eq("broker_id", id).order("created_at", { ascending: false }),
  ]);

  const emails = assertOk(emailsRes.data, emailsRes.error, "Loading email interactions");
  const human = assertOk(humanRes.data, humanRes.error, "Loading interactions");
  const interactions = [...emails, ...human].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

  return {
    ...withStats[0],
    interactions,
    deals: assertOk(dealsRes.data, dealsRes.error, "Loading contact deals"),
  };
}

// MCP convenience: accept a UUID or a (partial) name. Throws with candidate
// names when the match is ambiguous so Claude can disambiguate.
export async function resolveContactId(db: Db, idOrName: string): Promise<string> {
  if (isUuid(idOrName)) return idOrName;
  const { data, error } = await db
    .from("contacts")
    .select("id, full_name, company:companies(name)")
    .ilike("full_name", `%${idOrName}%`)
    .limit(10)
    .returns<{ id: string; full_name: string; company: { name: string } | null }[]>();
  const matches = assertOk(data, error, "Resolving contact");
  if (matches.length === 1) return matches[0].id;
  if (matches.length === 0) throw new Error(`No contact found matching "${idOrName}"`);
  const exact = matches.filter((m) => m.full_name.toLowerCase() === idOrName.toLowerCase());
  if (exact.length === 1) return exact[0].id;
  throw new Error(
    `Ambiguous contact "${idOrName}" — candidates: ${matches.map((m) => `${m.full_name}${m.company ? ` (${m.company.name})` : ""} [${m.id}]`).join(", ")}`,
  );
}

export async function createContact(db: Db, input: ContactInsert): Promise<ContactRow> {
  const { data, error } = await db.from("contacts").insert(input).select().single();
  return assertOk(data, error, "Creating contact");
}

export async function updateContact(db: Db, id: string, input: ContactUpdate): Promise<ContactRow> {
  const { data, error } = await db.from("contacts").update(input).eq("id", id).select().single();
  return assertOk(data, error, "Updating contact");
}

// Deleting a contact. Deals block the delete (the FK would reject it anyway —
// this pre-check turns that into a human message). Their drive links go first
// (no FK cascade across the polymorphic parent); interactions and tasks
// cascade via FK.
export async function deleteContact(db: Db, id: string): Promise<void> {
  const { count, error: countError } = await db
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("broker_id", id);
  if (countError) throw new Error(`Checking contact deals: ${countError.message}`);
  if (count != null && count > 0) {
    throw new Error(`This contact has ${count} deal${count === 1 ? "" : "s"} — delete or reassign them first`);
  }

  const { error: linksError } = await db
    .from("drive_links")
    .delete()
    .eq("parent_type", "contact")
    .eq("parent_id", id);
  if (linksError) throw new Error(`Deleting contact drive links: ${linksError.message}`);

  const { error } = await db.from("contacts").delete().eq("id", id);
  if (error) throw new Error(`Deleting contact: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Back-compat aliases — much existing code says "broker". A broker is a contact.
// ---------------------------------------------------------------------------

export type BrokerWithStats = ContactWithStats;
export type BrokerDetail = ContactDetail;

export const getBroker = getContact;
export const createBroker = createContact;
export const updateBroker = updateContact;
export const resolveBrokerId = resolveContactId;
