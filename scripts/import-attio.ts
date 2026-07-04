// One-time Attio → Vía OS broker import.
//
//   npm run import:attio -- --people people.csv [--companies companies.csv]
//                           [--stage-mapping stages.csv] [--dry-run]
//
// Reads the Attio People CSV export, dedupes against existing brokers (by
// email, falling back to full name when a row has no email), and inserts the
// rest with source = "Attio import". Idempotent: running it twice creates
// nothing new. Writes go through the service-role client declared with change
// source "import", so every inserted row lands in audit_log with
// source = 'import' automatically.
//
// All parsing/dedupe logic is pure and lives in scripts/attio.ts.
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BrokerStage } from "@/lib/database.types";
import type { Db } from "@/lib/crm/db";
import {
  backfillCompanies,
  parseCompaniesCsv,
  parsePeopleCsv,
  parseStageMapping,
  planImport,
  type ImportPlan,
  type ParseSkip,
} from "./attio";

config({ path: ".env.local" });
config();

const USAGE = `Usage:
  npm run import:attio -- --people <people.csv> [options]

Options:
  --people <path>         Attio People CSV export (required)
  --companies <path>      Attio Companies CSV export; backfills company names
                          when the People export references companies by record id
  --stage-mapping <path>  Two-column CSV (email,stage) assigning broker stages.
                          Stages: introduced | engaged | active_submitter | prime
  --dry-run               Print what would be created/skipped; write nothing
  -h, --help              Show this help`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type CliOptions = {
  people?: string;
  companies?: string;
  stageMapping?: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === "--people" || arg === "--companies" || arg === "--stage-mapping") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) fail(`Missing value for ${arg}\n\n${USAGE}`);
      if (arg === "--people") opts.people = value;
      else if (arg === "--companies") opts.companies = value;
      else opts.stageMapping = value;
      i++;
    } else {
      fail(`Unknown argument: ${arg}\n\n${USAGE}`);
    }
  }
  return opts;
}

function readFileOrFail(path: string, label: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return fail(`Cannot read ${label} file: ${path}`);
  }
}

type ExistingBroker = { id: string; full_name: string; email: string | null };

async function fetchExistingBrokers(db: Db): Promise<ExistingBroker[]> {
  const rows: ExistingBroker[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("brokers")
      .select("id, full_name, email")
      .range(from, from + pageSize - 1);
    if (error) fail(`Fetching existing brokers: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function printSummary(created: number, plan: ImportPlan, parseSkips: ParseSkip[]) {
  const tally = new Map<string, number>();
  const bump = (reason: string) => tally.set(reason, (tally.get(reason) ?? 0) + 1);
  // Collapse "failed validation: …detail…" into one bucket for the tally.
  for (const s of plan.skips) bump(s.reason.split(":")[0]);
  for (const s of parseSkips) bump(s.reason);

  const skippedTotal = plan.skips.length + parseSkips.length;
  console.log(`\nSummary: created ${created}, skipped ${skippedTotal}.`);
  for (const [reason, n] of tally) console.log(`  - ${reason}: ${n}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.people) fail(`Missing required --people <path.csv>\n\n${USAGE}`);

  // --- Parse inputs (all pure; any failure exits before touching the DB) ---
  let parsed;
  try {
    parsed = parsePeopleCsv(readFileOrFail(opts.people, "people"));
  } catch (err) {
    return fail(`Failed to parse people CSV: ${errorMessage(err)}`);
  }
  for (const s of parsed.skipped) console.warn(`People CSV row ${s.row}: skipped (${s.reason})`);

  let people = parsed.people;
  if (opts.companies) {
    try {
      const companies = parseCompaniesCsv(readFileOrFail(opts.companies, "companies"));
      console.log(`Loaded ${companies.size} company lookup entries.`);
      people = backfillCompanies(people, companies);
    } catch (err) {
      return fail(`Failed to parse companies CSV: ${errorMessage(err)}`);
    }
  }

  let stageMap = new Map<string, BrokerStage>();
  if (opts.stageMapping) {
    try {
      stageMap = parseStageMapping(readFileOrFail(opts.stageMapping, "stage mapping"));
      console.log(`Loaded ${stageMap.size} stage mapping(s).`);
    } catch (err) {
      return fail(`Failed to parse stage mapping CSV: ${errorMessage(err)}`);
    }
  }

  // --- Plan against the current database state ---
  const db = createAdminClient("import");
  const existingRows = await fetchExistingBrokers(db);
  const existing = {
    emails: new Set(existingRows.flatMap((r) => (r.email ? [r.email.toLowerCase()] : []))),
    names: new Set(existingRows.map((r) => r.full_name.trim().toLowerCase())),
  };
  const plan = planImport(people, existing, stageMap);

  console.log(`\nParsed ${people.length} people; ${existingRows.length} broker(s) already in the database.`);
  if (plan.creates.length > 0) {
    console.log(`\nTo create (${plan.creates.length}):`);
    console.table(plan.creates.map((c) => ({ name: c.full_name, email: c.email ?? "—", stage: c.stage })));
  } else {
    console.log("\nNothing to create.");
  }
  if (plan.skips.length > 0) {
    console.log(`To skip (${plan.skips.length}):`);
    console.table(
      plan.skips.map((s) => ({ name: s.person.fullName, email: s.person.email ?? "—", reason: s.reason })),
    );
  }

  if (opts.dryRun) {
    printSummary(0, plan, parsed.skipped);
    console.log("\nDry run — nothing was written.");
    return;
  }

  // --- Insert in batches; a failed batch is reported and the run continues ---
  const BATCH_SIZE = 50;
  let created = 0;
  const failures: string[] = [];
  for (let i = 0; i < plan.creates.length; i += BATCH_SIZE) {
    const batch = plan.creates.slice(i, i + BATCH_SIZE);
    const { data, error } = await db.from("brokers").insert(batch).select("id");
    if (error) {
      failures.push(`Batch ${i / BATCH_SIZE + 1} (rows ${i + 1}–${i + batch.length}): ${error.message}`);
      continue;
    }
    created += data?.length ?? 0;
  }

  printSummary(created, plan, parsed.skipped);
  if (failures.length > 0) {
    console.error(`\n${failures.length} batch(es) failed:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(errorMessage(err));
  process.exit(1);
});
