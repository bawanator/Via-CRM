// Apply a SQL file to the live database over the session pooler.
//
//   npx tsx scripts/apply-sql.ts supabase/migrations/00005_deal_securities.sql
//
// Needs SUPABASE_DB_URL in .env.local (session pooler, port 5432 — DDL-safe).
// The whole file runs in ONE transaction: it fully applies or fully rolls back.
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local", quiet: true });

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: npx tsx scripts/apply-sql.ts <file.sql>");
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("Missing SUPABASE_DB_URL in .env.local");

  const sql = readFileSync(path, "utf8");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log(`Applied ${path}`);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
