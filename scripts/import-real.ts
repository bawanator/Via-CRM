// One-off cutover: wipe demo data and import the real Attio book
// (people + company domains + deals) with dedupe and type inference.
//
//   npx tsx scripts/import-real.ts --dir <dir-with-csvs> [--wipe] [--dry-run]
//
// Data-quality rules (documented because they ARE the import):
//   * Rows with company "Placeholder" / @placeholder.com emails are Attio
//     enrichment junk — duplicates of real rows. Skipped.
//   * Harry's own rows (4 aliases) are skipped — the CRM tracks other people.
//   * Dedupe: by email first; then by normalised name, preferring rows WITH
//     an email (email-less duplicates of the same human are dropped).
//   * Blank names become prettified email local parts ("jono.yacoub" → "Jono Yacoub").
//   * Mojibake from the export (Ã­, â) is repaired.
//   * Contact type inference: "Valuer at" → Valuer; legal firms → Solicitor;
//     "Guarantor" → Guarantor; coworking/vendor/random-freemail → Other;
//     known borrower-side people → Borrower; funder-side → Other; the rest
//     (the actual origination network) → Broker at stage "introduced".
//   * Deals: Attio stages map Lead→scenario, Indicative Terms→term_sheet,
//     Final Term Sheet→term_sheet, In progress→credit, Pre-settlement→docs;
//     Lost → status lost with reason "unknown" (honest — Attio recorded none).
//   * Deal→broker links come from Attio's associated-deal column plus the
//     name-prefix conventions in the deal titles; unmatchable deals attach to
//     an "Unassigned (imported)" contact and say so in their notes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { config } from "dotenv";
import { createAdminClient } from "../src/lib/supabase/admin";
import { createContact } from "../src/lib/crm/contacts";
import { createCompany } from "../src/lib/crm/companies";
import { createDeal } from "../src/lib/crm/deals";
import { addGuarantor } from "../src/lib/crm/guarantors";
import { addContactType, listContactTypes } from "../src/lib/crm/contactTypes";
import { contactInputSchema } from "../src/lib/schemas";
import type { DealLossReason, DealPipelineStage, DealProduct, DealStatus } from "../src/lib/database.types";


config({ path: ".env.local" });
config();

// Transient network failures (fetch failed) shouldn't kill a 300-row import;
// each write retries a few times before giving up.
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!/fetch failed|ECONNRESET|ETIMEDOUT|socket|network/i.test(msg)) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      console.warn(`retrying ${label} (${i + 1}/${attempts - 1})…`);
    }
  }
  throw lastErr;
}

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const WIPE = args.includes("--wipe");
const dirIdx = args.indexOf("--dir");
const DIR = dirIdx >= 0 ? args[dirIdx + 1] : ".";

// Known junk: a typo'd-domain duplicate of Kim Woodward (kim@woodwardfinance.com.au).
const JUNK_EMAILS = new Set(["kim@woodwardfinanxe.com.au"]);

const SELF_EMAILS = new Set([
  "harry@viaprivate.com.au",
  "harry.bawa@viacapital.com.au",
  "harry.bawa@hey.com",
  "hbawa@flnt.io",
]);

const LEGAL_COMPANIES = ["jhk legal", "era legal", "kain lawyers", "envision legal", "bransgroves", "clayton utz"];

const VENDOR_COMPANIES = new Set(
  [
    "WeWork", "The Commons", "Regus", "The Great Room", "The Work Project", "IWG plc",
    "MAIL BOXES ETC", "Stellar Staffing", "Velocity", "Equifax", "SQM Research", "Dealpath",
    "The GPT Group", "EG", "ID Quantique", "Hunter St. Hospitality", "The Pillars",
    "Commonwealth Bank of Australia", "Loculyze", "Reveal", "FLNT", "Avani Solutions",
    "TDQS Pty", "Haben", "Tricorian Life", "Car Wash", "Blackman Bicycles",
  ].map((c) => c.toLowerCase()),
);

// Funder-side organisations: contacts stay, but never typed Broker.
const FUNDER_SIDE = new Set(
  ["first federal", "harbour credit partners", "vest", "ipartners", "labassa capital",
   "rixon capital", "blue crane capital", "barwon investment partners", "omega investments",
   "harlalka family office", "orde financial", "brighten", "athena home loans", "finstro"],
);

const BORROWER_EMAILS = new Set([
  "michaeljduque@outlook.com", "jacky.lau.2504@gmail.com", "david@harlia.com.au",
  "hadur@m2spacegroup.com.au", "navdeep@m2spacegroup.com.au",
]);

const DEAL_BROKER_EMAIL: Record<string, string> = {
  "KP - Childcare centre - Micheal Duque": "michaeljduque@outlook.com",
  "Richard - Online - 1.2m": "richard@fintrack.com.au",
  "Mornè - The Range - $1m": "morne.lombard@avant.org.au",
  "Billy- 2RM-  North Kellyville": "billy.tsoukalas@thelagroup.com.au",
  "Jane - Truck driver $70k": "jane@goforbroker.com.au",
  "James Scobie deal -unknown": "james@walmercastlefinance.com.au",
  "Billy Tsoukalas - Colby deal $1m": "billy.tsoukalas@thelagroup.com.au",
  "Melanie Peter - Pub": "melanie@rococofinance.com.au",
  "Melanie Peter - Bridging": "melanie@rococofinance.com.au",
  "Jono Y - $2.3m Bridging": "jonathan.yacoub@avant.org.au",
  "Anuj - Marsden Park 2RM": "anuj@harbourmortgages.com.au",
  "Mark - SA": "mark@sicuro.net.au",
  "Officer - Land subdivision and civil works": "hadur@m2spacegroup.com.au",
  "Equity release - Carwash purchase 2RM": "nick@thelendinglab.com.au",
  "Marsden Park": "david@harlia.com.au",
  "Willoughby - Equity Release": "izzy@simplicity.net.au",
  "H K Century Pty Ltd": "jacky.lau.2504@gmail.com",
};

const STAGE_MAP: Record<string, DealPipelineStage> = {
  Lead: "scenario",
  "Indicative Terms": "term_sheet",
  "Final Term Sheet": "term_sheet",
  "In progress": "term_sheet",
  "Pre-settlement": "docs",
};

function fixMojibake(s: string): string {
  return s.replace(/Ã­/g, "í").replace(/Ã¨/g, "è").replace(/â/g, "—").replace(/Â/g, "");
}

function prettifyLocal(email: string): string {
  const local = email.split("@")[0];
  return local
    .split(/[._\-]+/)
    .filter(Boolean)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ")
    .replace(/\d+$/, "")
    .trim();
}

function inferProduct(dealName: string): DealProduct {
  const n = dealName.toLowerCase();
  if (n.includes("bridging") || n.includes("bridge")) return "bridging";
  if (n.includes("equity release")) return "equity_release";
  if (n.includes("purchase")) return "purchase";
  if (n.includes("residual")) return "residual_stock";
  return "other";
}

type PersonRow = Record<string, string>;

function inferType(row: { name: string; email: string | null; company: string | null; desc: string }): string {
  const desc = row.desc.toLowerCase();
  const company = (row.company ?? "").toLowerCase();
  if (desc.includes("valuer at")) return "Valuer";
  if (desc.startsWith("guarantor") || desc.includes("guarantor -")) return "Guarantor";
  if (LEGAL_COMPANIES.some((l) => company.includes(l)) || company.includes("lawyer") || company.includes("legal"))
    return "Solicitor";
  if (row.email && BORROWER_EMAILS.has(row.email)) return "Borrower";
  if (VENDOR_COMPANIES.has(company)) return "Other";
  if (FUNDER_SIDE.has(company)) return "Other";
  // Group inboxes / non-people
  if (row.email && /^(hello|admin|accounts|info|we-au-|allegpg|allegfm|cvsonboarding|georgestreet|85castlereagh|1oconnell|macquariepark|sydney\.|209)/.test(row.email))
    return "Other";
  // No company + free-mail + no referral note → unknown correspondent.
  const freeMail = row.email ? /@(gmail|hotmail|outlook|icloud|yahoo|bigpond)\./.test(row.email) : false;
  if (!row.company && freeMail && !desc.includes("referred")) return "Other";
  return "Broker";
}

async function main() {
  const db = createAdminClient("import");

  // --- wipe demo data (saved reports + contact types + allowlist stay) ------
  if (WIPE && !DRY) {
    for (const table of ["tasks", "guarantors", "drive_links", "key_dates", "interactions", "deals", "contacts", "companies"] as const) {
      const { error } = await db.from(table).delete().gte("created_at", "1900-01-01");
      if (error) throw new Error(`Wiping ${table}: ${error.message}`);
    }
    console.log("Wiped: tasks, guarantors, drive_links, key_dates, interactions, deals, contacts, companies");
  }

  // --- parse people ----------------------------------------------------------
  const peopleRaw: PersonRow[] = parse(fixMojibake(readFileSync(join(DIR, "people.csv"), "utf8")), {
    columns: true, skip_empty_lines: true, bom: true, relax_column_count: true,
  });
  const domains: { name: string; domain: string }[] = parse(readFileSync(join(DIR, "company-domains.csv"), "utf8"), {
    columns: true, skip_empty_lines: true,
  });
  const dealsRaw: PersonRow[] = parse(fixMojibake(readFileSync(join(DIR, "deals.csv"), "utf8")), {
    columns: true, skip_empty_lines: true, bom: true, relax_column_count: true,
  });
  const domainByCompany = new Map(domains.map((d) => [d.name.toLowerCase(), d.domain.toLowerCase()]));

  type Person = {
    name: string; email: string | null; company: string | null; phone: string | null;
    location: string | null; desc: string; type: string; associatedDeal: string | null;
  };

  const people: Person[] = [];
  const skips: { name: string; reason: string }[] = [];
  for (const r of peopleRaw) {
    const rawName = (r["Name"] || r["Record"] || "").trim();
    const emailCell = (r["Email addresses"] || "").trim().toLowerCase();
    const email = emailCell ? emailCell.split(/[,\s]+/)[0] : null;
    const company = (r["Company > Name"] || "").trim() || null;
    if (company === "Placeholder" || (email && email.endsWith("@placeholder.com"))) {
      skips.push({ name: rawName || email || "?", reason: "placeholder junk" }); continue;
    }
    if (email && JUNK_EMAILS.has(email)) {
      skips.push({ name: rawName || email, reason: "junk (typo'd duplicate)" }); continue;
    }
    if ((email && SELF_EMAILS.has(email)) || rawName === "Harry Bawa") {
      skips.push({ name: rawName || email || "?", reason: "self" }); continue;
    }
    if (!rawName && !email) { skips.push({ name: "(blank)", reason: "no name or email" }); continue; }
    const name = rawName && !rawName.includes("@") ? rawName.replace(/\s+/g, " ").trim() : prettifyLocal(email!) || email!;
    const desc = (r["Description"] || "").trim();
    const person: Person = {
      name, email, company,
      phone: (r["Phone numbers"] || "").trim() || null,
      location: (r["Primary location > City"] || "").trim() || null,
      desc,
      type: "", // set below
      associatedDeal: (r["Associated deals > Deal name"] || "").trim() || null,
    };
    person.type = inferType({ name, email, company, desc });
    people.push(person);
  }

  // Dedupe: email first; then normalised name preferring rows with email.
  const byEmail = new Map<string, Person>();
  const noEmail: Person[] = [];
  for (const p of people) {
    if (p.email) {
      const existing = byEmail.get(p.email);
      if (!existing) byEmail.set(p.email, p);
      else {
        // keep the richer row
        const score = (x: Person) => (x.desc ? 2 : 0) + (x.company ? 1 : 0) + (x.phone ? 1 : 0);
        if (score(p) > score(existing)) byEmail.set(p.email, p);
        skips.push({ name: p.name, reason: `duplicate email ${p.email}` });
      }
    } else noEmail.push(p);
  }
  const namesSeen = new Set([...byEmail.values()].map((p) => p.name.toLowerCase()));
  const finalPeople = [...byEmail.values()];
  for (const p of noEmail) {
    if (namesSeen.has(p.name.toLowerCase())) { skips.push({ name: p.name, reason: "duplicate name (no email)" }); continue; }
    namesSeen.add(p.name.toLowerCase());
    finalPeople.push(p);
  }

  const typeCounts = new Map<string, number>();
  for (const p of finalPeople) typeCounts.set(p.type, (typeCounts.get(p.type) ?? 0) + 1);
  console.log(`\nPeople: ${finalPeople.length} to import, ${skips.length} skipped`);
  console.log("By type:", Object.fromEntries([...typeCounts.entries()].sort((a, b) => b[1] - a[1])));
  const skipTally = new Map<string, number>();
  for (const s of skips) skipTally.set(s.reason.split(" ")[0], (skipTally.get(s.reason.split(" ")[0]) ?? 0) + 1);
  console.log("Skips:", Object.fromEntries(skipTally));

  // --- deals plan -------------------------------------------------------------
  type PlannedDeal = {
    name: string; stage: DealPipelineStage; status: DealStatus; lossReason: DealLossReason | null;
    amount: number | null; product: DealProduct; brokerEmail: string | null;
  };
  const plannedDeals: PlannedDeal[] = dealsRaw.map((r) => {
    const name = (r["Record"] || "").trim();
    const attioStage = (r["Deal stage"] || "").trim();
    const lost = attioStage === "Lost";
    const brokerEmail =
      DEAL_BROKER_EMAIL[name] ??
      finalPeople.find((p) => p.associatedDeal && p.associatedDeal === name && p.email)?.email ??
      null;
    return {
      name,
      stage: lost ? "scenario" : STAGE_MAP[attioStage] ?? "scenario",
      status: lost ? "lost" : "live",
      lossReason: lost ? "unknown" : null,
      amount: r["Deal value"] ? Number(r["Deal value"]) : null,
      product: inferProduct(name),
      brokerEmail,
    };
  });
  const unassigned = plannedDeals.filter((d) => !d.brokerEmail);
  console.log(`\nDeals: ${plannedDeals.length} (${plannedDeals.filter((d) => d.status === "live").length} live, ${plannedDeals.filter((d) => d.status === "lost").length} lost); ${unassigned.length} without a matched broker: ${unassigned.map((d) => d.name).join(" | ") || "none"}`);

  if (DRY) {
    console.log("\nDry run — nothing written. Sample contacts:");
    console.table(finalPeople.slice(0, 12).map((p) => ({ name: p.name, type: p.type, email: p.email ?? "—", company: p.company ?? "—" })));
    return;
  }

  // --- write ------------------------------------------------------------------
  const existingTypes = new Set((await listContactTypes(db)).map((t) => t.name));
  if (!existingTypes.has("Guarantor")) await addContactType(db, "Guarantor", 70);

  // Companies (from people's company names, domain-enriched).
  const companyIds = new Map<string, string>();
  const companyNames = [...new Set(finalPeople.flatMap((p) => (p.company ? [p.company] : [])))];
  const { data: existingCompanies } = await db.from("companies").select("id, name");
  for (const c of existingCompanies ?? []) companyIds.set(c.name.toLowerCase(), c.id);
  let newCompanies = 0;
  for (const cname of companyNames) {
    if (companyIds.has(cname.toLowerCase())) continue;
    const created = await withRetry(`company ${cname}`, () =>
      createCompany(db, { name: cname, domain: domainByCompany.get(cname.toLowerCase()) ?? null }),
    );
    companyIds.set(cname.toLowerCase(), created.id);
    newCompanies++;
  }
  console.log(`Companies created: ${newCompanies} (existing: ${(existingCompanies ?? []).length})`);

  // Contacts.
  const contactIdByEmail = new Map<string, string>();
  const { data: existingContacts } = await db.from("contacts").select("id, full_name, email");
  const existingEmailSet = new Map((existingContacts ?? []).flatMap((c) => (c.email ? [[c.email, c.id] as const] : [])));
  const existingNameSet = new Set((existingContacts ?? []).map((c) => c.full_name.toLowerCase()));
  let contactCount = 0;
  for (const p of finalPeople) {
    if (p.email && existingEmailSet.has(p.email)) {
      contactIdByEmail.set(p.email, existingEmailSet.get(p.email)!);
      continue;
    }
    if (!p.email && existingNameSet.has(p.name.toLowerCase())) continue;
    const parsed = contactInputSchema.parse({
      full_name: p.name,
      email: p.email ?? "",
      phone: p.phone ?? "",
      location: p.location ?? "",
      notes: p.desc || "",
      type: p.type,
      source: "Attio import",
    });
    const { company_name: _cn, ...fields } = parsed;
    const row = await withRetry(`contact ${p.name}`, () =>
      createContact(db, {
        ...fields,
        company_id: p.company ? companyIds.get(p.company.toLowerCase()) ?? null : null,
      }),
    );
    if (p.email) contactIdByEmail.set(p.email, row.id);
    contactCount++;
  }
  console.log(`Contacts created: ${contactCount}`);

  // Fallback holder for deals with no matched broker.
  let unassignedId: string | null = null;
  if (unassigned.length > 0) {
    const holder = await createContact(db, {
      full_name: "Unassigned (imported)",
      type: "Other",
      source: "Attio import",
      notes: "Holds imported deals whose broker couldn't be matched — reassign from each deal.",
    });
    unassignedId = holder.id;
  }

  // Deals.
  let dealCount = 0;
  const dealIdByName = new Map<string, string>();
  const { data: existingDeals } = await db.from("deals").select("id, name");
  for (const ed of existingDeals ?? []) dealIdByName.set(ed.name, ed.id);
  for (const d of plannedDeals) {
    if (dealIdByName.has(d.name)) continue;
    const brokerId = (d.brokerEmail ? contactIdByEmail.get(d.brokerEmail) : null) ?? unassignedId;
    if (!brokerId) throw new Error(`No broker id for deal ${d.name}`);
    const row = await withRetry(`deal ${d.name}`, () => createDeal(db, {
      name: d.name,
      broker_id: brokerId,
      loan_amount: d.amount,
      product: d.product,
      pipeline_stage: d.stage,
      status: d.status,
      loss_reason: d.lossReason,
      notes: d.brokerEmail ? null : "Imported from Attio without a matched broker — reassign.",
    }));
    dealIdByName.set(d.name, row.id);
    dealCount++;
  }
  console.log(`Deals created: ${dealCount}`);

  // Guarantors on the Colby deal (from the Attio guarantor rows).
  const colby = dealIdByName.get("Billy Tsoukalas - Colby deal $1m");
  const { count: gCount } = colby
    ? await db.from("guarantors").select("id", { count: "exact", head: true }).eq("deal_id", colby)
    : { count: 1 };
  if (colby && (gCount ?? 0) === 0) {
    await addGuarantor(db, { deal_id: colby, full_name: "Dianne Ellen Blackman", phone: "+61438372893", email: "db171912@bigpond.net.au", notes: "Guarantor — Streetwise Nominees" });
    await addGuarantor(db, { deal_id: colby, full_name: "Graham Ernest Blackman", phone: "+61417761354", email: "accounts@blackmanbicycles.com.au", address: "Colebee", notes: "Guarantor — Streetwise Nominees Pty Ltd" });
    console.log("Guarantors attached to the Colby deal: 2");
  }

  console.log("\nImport complete.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
