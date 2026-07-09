// Schedule the Google sync to run every 30 minutes FROM INSIDE the database
// (pg_cron + pg_net calling the authenticated Vercel endpoint). Vercel Hobby
// crons are daily-only; this keeps the frequent cadence self-contained — no
// external scheduler, no extra secrets store (CRON_SECRET stays in the DB's
// cron job definition, which only the service role can read).
//
//   npx tsx scripts/schedule-sync.ts            # install / update the schedule
//   npx tsx scripts/schedule-sync.ts --remove   # remove it
//
// Idempotent: re-running replaces the existing job.
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local", quiet: true });

const JOB_NAME = "via-os-gmail-sync";
const ENDPOINT = "https://os.viaprivate.com.au/api/cron/gmail-sync";
const SCHEDULE = "*/30 * * * *";

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  const secret = process.env.CRON_SECRET;
  if (!url || !secret) throw new Error("Missing SUPABASE_DB_URL / CRON_SECRET in .env.local");

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`create extension if not exists pg_cron`);
    await client.query(`create extension if not exists pg_net`);
    // Replace any existing job of the same name.
    await client.query(`select cron.unschedule(jobid) from cron.job where jobname = $1`, [JOB_NAME]);
    if (process.argv.includes("--remove")) {
      console.log(`Removed schedule "${JOB_NAME}".`);
      return;
    }
    const command = `select net.http_get(url := '${ENDPOINT}', headers := jsonb_build_object('Authorization', 'Bearer ${secret}'), timeout_milliseconds := 300000)`;
    await client.query(`select cron.schedule($1, $2, $3)`, [JOB_NAME, SCHEDULE, command]);
    const { rows } = await client.query(`select jobname, schedule, active from cron.job where jobname = $1`, [JOB_NAME]);
    console.log("Scheduled:", rows[0]);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
