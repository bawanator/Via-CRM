// Pure Attio-import logic: CSV parsing, column heuristics, and the import
// plan (dedupe + stage resolution). No environment or database access here —
// everything is exported so tests can exercise it directly. The CLI wrapper
// lives in scripts/import-attio.ts.
import { parse } from "csv-parse/sync";
import type { BrokerInsert, BrokerStage } from "@/lib/database.types";
import { BROKER_STAGES } from "@/lib/domain";
import { brokerInputSchema } from "@/lib/schemas";

export type AttioPerson = {
  fullName: string;
  /** Lowercased primary email (first address when Attio joins several). */
  email: string | null;
  company: string | null;
  phone: string | null;
  linkedin: string | null;
  description: string | null;
  /** From an optional `stage` column in the People export. */
  stageOverride: BrokerStage | null;
};

export type ParseSkip = { row: number; reason: string };

export type PeopleParseResult = { people: AttioPerson[]; skipped: ParseSkip[] };

export type ImportPlan = {
  creates: BrokerInsert[];
  skips: { person: AttioPerson; reason: string }[];
};

const CSV_OPTIONS = {
  columns: true,
  skip_empty_lines: true,
  bom: true,
  relax_column_count: true,
} as const;

/** "Active Submitter" / "active-submitter" / " ACTIVE_SUBMITTER " → "active_submitter". */
export function normaliseStage(raw: string | null | undefined): BrokerStage | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (BROKER_STAGES as string[]).includes(value) ? (value as BrokerStage) : null;
}

// Attio exports "Email addresses" as a comma/space-joined list — take the
// first thing that looks like an address, lowercased.
function firstEmail(raw: string | undefined): string | null {
  if (!raw) return null;
  const token = raw.split(/[\s,;]+/).find((t) => t.includes("@"));
  return token ? token.trim().toLowerCase() : null;
}

// Attio often exports LinkedIn as a bare "linkedin.com/in/…" — prefix a
// scheme so it survives URL validation.
function normaliseLinkedin(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`;
}

type PeopleColumns = {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  linkedin: string | null;
  description: string | null;
  stage: string | null;
};

// Heuristic header mapping (case-insensitive contains). Attio lets users
// rename attributes, so we match loosely rather than exactly.
export function detectPeopleColumns(headers: string[]): PeopleColumns {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const find = (pred: (h: string) => boolean): string | null => {
    const idx = lower.findIndex(pred);
    return idx === -1 ? null : headers[idx];
  };

  return {
    // Prefer an explicit single-name column; the generic "name" fallback must
    // not grab "First name" / "Last name" / "Company name" / "Surname".
    name:
      find((h) => h === "name" || h.includes("full name")) ??
      find((h) => h.includes("name") && !/(first|last|sur|company|organi[sz]|user|file)/.test(h)),
    firstName: find((h) => h.includes("first name")),
    lastName: find((h) => h.includes("last name") || h === "surname"),
    email: find((h) => h.includes("email") || h.includes("e-mail")),
    phone: find((h) => h.includes("phone") || h.includes("mobile")),
    company: find((h) => h.includes("company") || h.includes("organisation") || h.includes("organization")),
    linkedin: find((h) => h.includes("linkedin")),
    description: find((h) => h.includes("description") || h.includes("notes") || h.includes("about")),
    stage: find((h) => h === "stage" || h.includes("stage")),
  };
}

export function parsePeopleCsv(content: string): PeopleParseResult {
  const records = parse(content, CSV_OPTIONS) as Record<string, string | undefined>[];
  if (records.length === 0) return { people: [], skipped: [] };

  const cols = detectPeopleColumns(Object.keys(records[0]));
  const people: AttioPerson[] = [];
  const skipped: ParseSkip[] = [];

  records.forEach((rec, i) => {
    const rowNum = i + 2; // 1-based, +1 for the header row
    const get = (col: string | null): string => (col ? (rec[col] ?? "").trim() : "");

    let fullName = get(cols.name);
    if (!fullName) fullName = [get(cols.firstName), get(cols.lastName)].filter(Boolean).join(" ").trim();
    const email = firstEmail(cols.email ? rec[cols.email] : undefined);

    if (!fullName && !email) {
      skipped.push({ row: rowNum, reason: "no name or email" });
      return;
    }

    // Attio also joins multiple phone numbers; keep the first. (Split on
    // comma/semicolon only — phone numbers legitimately contain spaces.)
    const phoneRaw = get(cols.phone);
    const phone = phoneRaw ? phoneRaw.split(/[,;]/)[0].trim() || null : null;

    people.push({
      fullName: fullName || email!, // brokers.full_name is NOT NULL; fall back to the email
      email,
      company: get(cols.company) || null,
      phone,
      linkedin: normaliseLinkedin(cols.linkedin ? rec[cols.linkedin] : undefined),
      description: get(cols.description) || null,
      stageOverride: normaliseStage(cols.stage ? rec[cols.stage] : undefined),
    });
  });

  return { people, skipped };
}

// Two-column CSV: email,stage. A header row ("email,stage") is tolerated.
// Invalid stage values throw with the row number — a bad mapping file should
// stop the import, not silently default people to "introduced".
export function parseStageMapping(content: string): Map<string, BrokerStage> {
  const rows = parse(content, {
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  }) as string[][];

  const map = new Map<string, BrokerStage>();
  rows.forEach((cols, i) => {
    const rowNum = i + 1;
    const email = (cols[0] ?? "").trim().toLowerCase();
    const stageRaw = (cols[1] ?? "").trim();
    if (rowNum === 1 && email === "email") return; // header row
    if (!email) return;
    const stage = normaliseStage(stageRaw);
    if (!stage) {
      throw new Error(
        `Stage mapping row ${rowNum}: invalid stage "${stageRaw}" for ${email} — expected one of: ${BROKER_STAGES.join(", ")}`,
      );
    }
    map.set(email, stage);
  });
  return map;
}

// Attio Companies export → lookup used to backfill People rows whose
// "Company" cell is a record reference (record id) rather than a name.
// Heuristic: key by record id, name, and first domain; value is the display
// name (falling back to the domain when the export has no name column).
export function parseCompaniesCsv(content: string): Map<string, string> {
  const records = parse(content, CSV_OPTIONS) as Record<string, string | undefined>[];
  const map = new Map<string, string>();
  if (records.length === 0) return map;

  const headers = Object.keys(records[0]);
  const lower = headers.map((h) => h.trim().toLowerCase());
  const find = (pred: (h: string) => boolean): string | null => {
    const idx = lower.findIndex(pred);
    return idx === -1 ? null : headers[idx];
  };

  const idCol = find((h) => h.includes("record id") || h === "id");
  const nameCol = find((h) => h === "name" || (h.includes("name") && !/(first|last|domain|user|file)/.test(h)));
  const domainCol = find((h) => h.includes("domain"));

  for (const rec of records) {
    const name = nameCol ? (rec[nameCol] ?? "").trim() : "";
    const domain = domainCol ? ((rec[domainCol] ?? "").trim().split(/[\s,;]+/)[0] ?? "") : "";
    const display = name || domain;
    if (!display) continue;
    const id = idCol ? (rec[idCol] ?? "").trim() : "";
    if (id) map.set(id.toLowerCase(), display);
    if (name) map.set(name.toLowerCase(), display);
    if (domain) map.set(domain.toLowerCase(), display);
  }
  return map;
}

// Replace company record references with real names where the lookup knows
// them; anything unrecognised is left as-is (it may already be a name).
export function backfillCompanies(people: AttioPerson[], companies: Map<string, string>): AttioPerson[] {
  if (companies.size === 0) return people;
  return people.map((p) => {
    if (!p.company) return p;
    const mapped = companies.get(p.company.trim().toLowerCase());
    return mapped && mapped !== p.company ? { ...p, company: mapped } : p;
  });
}

// The dedupe rules that make the import idempotent — running it twice
// produces zero creates:
//   * email present & already in the DB          → skip "already imported"
//   * email absent & full name already in the DB → skip (no email to disambiguate)
//   * duplicate email within the CSV             → first wins, rest skip
//   * duplicate no-email name within the CSV     → first wins, rest skip
// Every candidate parses through brokerInputSchema (the app-wide write
// boundary); rows that fail validation are skipped with the reason, never
// inserted half-clean.
export function planImport(
  people: AttioPerson[],
  existing: { emails: Set<string>; names: Set<string> },
  stageMap: Map<string, BrokerStage>,
): ImportPlan {
  const creates: BrokerInsert[] = [];
  const skips: ImportPlan["skips"] = [];
  const seenEmails = new Set<string>();
  const seenNames = new Set<string>();

  for (const person of people) {
    const email = person.email;
    const nameKey = person.fullName.trim().toLowerCase();

    if (email) {
      if (existing.emails.has(email)) {
        skips.push({ person, reason: "already imported" });
        continue;
      }
      if (seenEmails.has(email)) {
        skips.push({ person, reason: "duplicate email in CSV (first occurrence wins)" });
        continue;
      }
    } else {
      if (existing.names.has(nameKey)) {
        skips.push({ person, reason: "name already exists (no email to disambiguate)" });
        continue;
      }
      if (seenNames.has(nameKey)) {
        skips.push({ person, reason: "duplicate name in CSV (no email to disambiguate)" });
        continue;
      }
    }

    const stage: BrokerStage =
      person.stageOverride ?? (email ? stageMap.get(email) : undefined) ?? "introduced";

    const parsed = brokerInputSchema.safeParse({
      full_name: person.fullName,
      company: person.company,
      email,
      phone: person.phone,
      linkedin_url: person.linkedin,
      stage,
      notes: person.description,
      source: "Attio import",
    });
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      skips.push({ person, reason: `failed validation: ${detail}` });
      continue;
    }

    const d = parsed.data;
    creates.push({
      full_name: d.full_name,
      company: d.company ?? null,
      email: d.email ?? null,
      phone: d.phone ?? null,
      linkedin_url: d.linkedin_url ?? null,
      stage: d.stage ?? "introduced",
      notes: d.notes ?? null,
      source: d.source ?? "Attio import",
    });
    if (email) seenEmails.add(email);
    else seenNames.add(nameKey);
  }

  return { creates, skips };
}
