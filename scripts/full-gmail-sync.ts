// One-off deep Gmail backfill — wider bounds than the nightly cron.
//
//   npx tsx scripts/full-gmail-sync.ts [--days 365] [--threads 100]
//
// Phase 1: contact discovery over a year of SENT mail (up to 500 messages) —
//          anyone you've written to becomes a contact, company-linked by domain.
// Phase 2: thread history for EVERY contact with an email (up to N threads,
//          subjects/dates/snippets only). Per-contact failures never abort the
//          run; Gmail 429s get a pause-and-retry.
import { config } from "dotenv";
import { createAdminClient } from "../src/lib/supabase/admin";
import { discoverContactsFromSent, refreshAccessToken, syncBrokerGmail } from "../src/lib/gmail";

config({ path: ".env.local" });
config();

const args = process.argv.slice(2);
function argNum(flag: string, fallback: number): number {
  const i = args.indexOf(flag);
  const v = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
const DAYS = argNum("--days", 365);
const THREADS = argNum("--threads", 100);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = createAdminClient("system");

  const { data: tokens, error: tokenError } = await db.from("google_oauth_tokens").select("refresh_token").limit(1);
  if (tokenError || !tokens?.length) throw new Error("No Google token stored — sign in to the app first.");
  let accessToken = await refreshAccessToken(tokens[0].refresh_token);

  console.log(`Phase 1: discovery over ${DAYS} days of sent mail…`);
  try {
    const discovery = await discoverContactsFromSent(db, accessToken, { newerThanDays: DAYS, max: 500 });
    console.log(`  discovery: created ${discovery.created}, known ${discovery.skipped}`);
  } catch (err) {
    console.error(`  discovery failed (continuing): ${err instanceof Error ? err.message : err}`);
  }

  const { data: contacts, error } = await db
    .from("contacts")
    .select("id, full_name, email")
    .not("email", "is", null)
    .order("full_name");
  if (error) throw new Error(error.message);

  console.log(`Phase 2: thread history (${DAYS}d, up to ${THREADS} threads) for ${contacts.length} contacts…`);
  let totalThreads = 0;
  let failures = 0;
  let done = 0;
  for (const contact of contacts) {
    if (!contact.email) continue;
    let attempts = 0;
    for (;;) {
      try {
        const n = await syncBrokerGmail(db, { id: contact.id, email: contact.email }, accessToken, {
          newerThanDays: DAYS,
          max: THREADS,
        });
        totalThreads += n;
        if (n > 0) console.log(`  ${contact.full_name}: ${n} threads`);
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/HTTP 429|rate/i.test(msg) && attempts < 3) {
          attempts++;
          console.warn(`  rate limited — pausing 30s (${contact.full_name})`);
          await sleep(30_000);
          continue;
        }
        if (/HTTP 401/.test(msg) && attempts < 2) {
          attempts++;
          accessToken = await refreshAccessToken(tokens[0].refresh_token); // token expired mid-run
          continue;
        }
        failures++;
        console.error(`  ${contact.full_name}: ${msg}`);
        break;
      }
    }
    done++;
    if (done % 25 === 0) console.log(`  … ${done}/${contacts.length} contacts`);
    await sleep(150); // stay well under Gmail per-user quota
  }

  console.log(`\nFull sync complete: ${totalThreads} threads indexed across ${done} contacts, ${failures} failures.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
