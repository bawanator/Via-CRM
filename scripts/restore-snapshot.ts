// Region-move restore: load a REST snapshot (JSON per table) into a fresh
// project, preserving original row ids so every FK carries over unchanged.
//
//   npx tsx scripts/restore-snapshot.ts --dir <snapshot-dir>
//
// Notes:
//   * created_by/updated_by are stripped — they reference auth.users ids from
//     the OLD project, which don't exist here. set_row_meta re-stamps.
//   * created_at/updated_at are re-stamped by triggers (report windows shift
//     by at most a few days; acceptable for a 4-day-old book).
//   * audit_log is NOT restored — history restarts in the new region.
//   * google_oauth_tokens is NOT restored — re-consent stores a fresh token.
//   * Idempotent: rows whose id already exists are skipped, so a network
//     failure mid-run is fixed by re-running.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { createAdminClient } from "../src/lib/supabase/admin";

config({ path: ".env.local" });
config();

const dirIdx = process.argv.indexOf("--dir");
const DIR = dirIdx >= 0 ? process.argv[dirIdx + 1] : ".";

const STRIP = new Set(["created_by", "updated_by", "created_at", "updated_at"]);

// FK-safe order. contact_types before contacts (type FK), companies before
// contacts (company_id), contacts before deals (broker_id), deals before the
// children.
const TABLES = [
  "contact_types",
  "companies",
  "contacts",
  "deals",
  "guarantors",
  "key_dates",
  "drive_links",
  "interactions",
  "tasks",
  "saved_reports",
] as const;

// contact_types has no id column — key on name instead.
function keyColumn(table: string): string {
  return table === "contact_types" ? "name" : "id";
}

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
      console.warn(`retrying ${label} (${i + 1})…`);
    }
  }
  throw lastErr;
}

async function main() {
  const db = createAdminClient("import");

  for (const table of TABLES) {
    let rows: Record<string, unknown>[];
    try {
      rows = JSON.parse(readFileSync(join(DIR, `${table}.json`), "utf8"));
    } catch {
      console.log(`${table}: no snapshot file, skipping`);
      continue;
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`${table}: 0 rows`);
      continue;
    }

    const key = keyColumn(table);
    const cleaned = rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) if (!STRIP.has(k)) out[k] = v;
      return out;
    });

    // Skip rows that already exist (idempotent re-runs).
    const keys = cleaned.map((r) => r[key] as string);
    const existing = await withRetry(`${table} existing`, async () => {
      const res = await db.from(table).select(key).in(key, keys);
      if (res.error) throw new Error(res.error.message);
      return (res.data ?? []) as unknown as Record<string, unknown>[];
    });
    const existingKeys = new Set(existing.map((r) => r[key] as string));
    const toInsert = cleaned.filter((r) => !existingKeys.has(r[key] as string));

    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      await withRetry(`${table} batch ${i / 100 + 1}`, async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await db.from(table).insert(batch as any);
        if (error) throw new Error(error.message);
      });
      inserted += batch.length;
    }
    console.log(`${table}: inserted ${inserted}, skipped ${existingKeys.size} existing`);
  }

  console.log("\nRestore complete.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
